import crypto from 'crypto';
import esClient from '../esClient';
import { publishAlertToSlack } from '../slackService';

const INDEX_FINDINGS = 'argonaut_findings';
const INDEX_THREATINTEL = 'argonaut_threatintel';
const INDEX_TASKLOGS = 'argonaut_tasklogs';
const INDEX_RUN_STAGES = 'argonaut_run_stages';

export interface EnrichThreatSummary {
    processed: number;
    missingCve: number;
    appliedKev: number;
    appliedEpss: number;
    scoreAdjustments: number;
    threatSeedHash: string;
}

export async function runThreatIntelWithLock(runId: string, bundleId: string): Promise<EnrichThreatSummary | null> {
    const lockId = `${runId}_THREAT_INTEL`;

    const indexExists = await esClient.indices.exists({ index: INDEX_RUN_STAGES });
    if (!indexExists) {
        await esClient.indices.create({ index: INDEX_RUN_STAGES }).catch(() => { }); // ignore race
    }

    const lockRes = await esClient.update({
        index: INDEX_RUN_STAGES,
        id: lockId,
        script: {
            source: `
                if (ctx._source.status == 'RUNNING') {
                    ctx.op = 'noop';
                } else {
                    ctx._source.status = 'RUNNING';
                    ctx._source.startedAt = params.time;
                }
            `,
            params: { time: new Date().toISOString() }
        },
        upsert: {
            runId,
            stage: 'THREAT_INTEL',
            status: 'RUNNING',
            startedAt: new Date().toISOString()
        }
    }) as any;

    if (lockRes.result === 'noop') {
        throw new Error('Enrichment already running');
    }

    try {
        const summary = await enrichThreatIntel(runId, bundleId);

        await esClient.update({
            index: INDEX_RUN_STAGES,
            id: lockId,
            doc: {
                status: 'SUCCEEDED',
                endedAt: new Date().toISOString(),
                summary
            }
        });

        return summary;
    } catch (err: any) {
        await esClient.update({
            index: INDEX_RUN_STAGES,
            id: lockId,
            doc: {
                status: 'FAILED',
                endedAt: new Date().toISOString(),
                error: String(err)
            }
        }).catch(() => { });
        throw err;
    }
}

export async function enrichThreatIntel(runId: string, bundleId: string): Promise<EnrichThreatSummary> {
    const summary: EnrichThreatSummary = {
        processed: 0,
        missingCve: 0,
        appliedKev: 0,
        appliedEpss: 0,
        scoreAdjustments: 0,
        threatSeedHash: ''
    };

    let seqCounter = Date.now(); // Simplified seq generator for isolation
    const emitLog = async (stage: string, taskType: string, taskKey: string, status: string, message: string, refs?: any) => {
        await esClient.index({
            index: INDEX_TASKLOGS,
            document: {
                runId, bundleId, seq: seqCounter++, timestamp: new Date().toISOString(),
                level: status === 'FAILED' ? 'ERROR' : 'INFO', stage, status, taskType, taskKey, message, refs
            }
        }).catch(e => console.error('[ThreatIntel] Failed to emit log:', e));
    };

    await emitLog('THREAT_INTEL', 'SYSTEM', 'stage:THREAT_INTEL:started', 'STARTED', 'Threat Intel Enrichment stage started');

    try {
        // 1. Compute Threat Seed Hash
        const metadataRes = await esClient.search({
            index: INDEX_THREATINTEL,
            size: 0,
            aggs: {
                max_pub: { max: { field: "publishedAt" } }
            }
        }) as any;
        const total = metadataRes.hits.total.value || 0;
        const maxPub = metadataRes.aggregations?.max_pub?.value || 0;
        const rawSeedHash = `seed_${total}_${maxPub}`;
        summary.threatSeedHash = crypto.createHash('sha256').update(rawSeedHash).digest('hex').substring(0, 8);

        // 2. Fetch Findings
        const findingsRes = await esClient.search({
            index: INDEX_FINDINGS,
            size: 10000,
            query: { term: { runId } }
        });
        const hitData = findingsRes.hits.hits as any[];
        summary.processed = hitData.length;

        const uniqueCves = Array.from(new Set(hitData.map(h => h._source.cve).filter(Boolean)));

        let threatsByCve = new Map<string, any>();
        if (uniqueCves.length > 0) {
            const threatsRes = await esClient.search({
                index: INDEX_THREATINTEL,
                size: 10000,
                query: { terms: { cve: uniqueCves } }
            });
            const thHits = threatsRes.hits.hits as any[];
            for (const thHit of thHits) {
                const s = thHit._source;
                if (s.cve) {
                    threatsByCve.set(s.cve, s);
                }
            }
        }

        // 3. Compute and Prepare Bulk Ops
        const bulkOps: any[] = [];

        for (const hit of hitData) {
            const f = hit._source;
            if (!f.cve) {
                summary.missingCve++;
                continue;
            }

            const th = threatsByCve.get(f.cve);

            // Deterministic base
            let baseScore = f.priorityScoreBase;
            if (baseScore === undefined || baseScore === null) {
                baseScore = f.priorityScore ?? 0;
            }

            let finalScore = baseScore;
            const boosts: string[] = [];

            // Default threat values
            let isKev = false;
            let epssScore = 0.0;
            let source = 'seed';

            if (th) {
                isKev = th.kev ?? th.kevFlag ?? false;
                epssScore = th.epssScore ?? th.epss ?? 0.0;
                source = 'argonaut_threatintel';

                if (isKev) {
                    finalScore += 25;
                    boosts.push('KEV');
                }
                if (epssScore >= 0.5) {
                    finalScore += 10;
                    boosts.push('EPSS_High');
                }
            }

            finalScore = Math.min(100, finalScore);

            const findingThreat = f.context?.threat || {};
            const findingIntelVersion = findingThreat.intelVersion;

            const hasScoreChanged = f.priorityScore !== finalScore;
            const hasBaseChanged = f.priorityScoreBase !== baseScore;
            const hasVersionChanged = findingIntelVersion !== summary.threatSeedHash;
            const hasKevChanged = findingThreat.kev !== isKev;
            const hasEpssChanged = findingThreat.epss !== epssScore;

            if (hasScoreChanged || hasBaseChanged || hasVersionChanged || hasKevChanged || hasEpssChanged) {
                if (isKev && hasKevChanged) summary.appliedKev++;
                if (epssScore >= 0.5 && hasEpssChanged) summary.appliedEpss++;
                if (hasScoreChanged) summary.scoreAdjustments++;

                bulkOps.push({ update: { _index: INDEX_FINDINGS, _id: hit._id } });

                const updateDoc = {
                    priorityScoreBase: baseScore,
                    priorityScore: finalScore,
                    context: {
                        ...f.context,
                        threat: {
                            kev: isKev,
                            epss: epssScore,
                            cve: f.cve,
                            source: source,
                            intelVersion: summary.threatSeedHash
                        }
                    },
                    priorityExplanation: {
                        ...(f.priorityExplanation || {}),
                        baseScore,
                        boostsApplied: boosts,
                        finalScore,
                        intelVersion: summary.threatSeedHash
                    }
                };
                bulkOps.push({ doc: updateDoc });
            }
        }

        // 4. Execute Bulk Write
        if (bulkOps.length > 0) {
            const bulkRes = await esClient.bulk({ body: bulkOps, refresh: true }) as any;
            if (bulkRes.errors) {
                console.error('[ThreatIntel] Bulk rewrite had errors', JSON.stringify(bulkRes.items));
            }
        }

        await emitLog('THREAT_INTEL', 'SYSTEM', 'stage:THREAT_INTEL:applied', 'SUCCEEDED',
            `Threat enrichment applied. KEV hits=${summary.appliedKev}, EPSS hits=${summary.appliedEpss}, Missing CVE=${summary.missingCve}`, { seedHash: summary.threatSeedHash });
        await emitLog('THREAT_INTEL', 'SYSTEM', 'stage:THREAT_INTEL:adjusted', 'SUCCEEDED',
            `Score adjustments required on ${summary.scoreAdjustments} findings`);
        if (summary.appliedKev > 0) {
            await publishAlertToSlack({
                title: `🚨 Critical Findings Enriched: ${runId}`,
                message: `Threat Intel enrichment found *${summary.appliedKev}* new KEV(s) and *${summary.appliedEpss}* high EPSS vulnerabilities.`,
                level: 'error',
                fields: [
                    { label: 'RunID', value: runId },
                    { label: 'KEV Hits', value: String(summary.appliedKev) },
                    { label: 'High EPSSHits', value: String(summary.appliedEpss) }
                ],
                actions: [
                    { text: 'Triage Now ↗', url: `${process.env.PUBLIC_BASE_URL}/runs/${runId}/findings?reachable=true` }
                ]
            });
        }

        return summary;
    } catch (err: any) {
        await emitLog('THREAT_INTEL', 'SYSTEM', 'stage:THREAT_INTEL:failed', 'FAILED',
            `Stage THREAT_INTEL failed: ${err.message}`, undefined);
        throw err;
    }
}
