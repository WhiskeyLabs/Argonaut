import { Client } from '@elastic/elasticsearch';
import crypto from 'crypto';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { computeStableHash } from '@argus_core/lib/utils/hashing';

const INDEX_FINDINGS = 'argonaut_findings';
const INDEX_ACTIONS = 'argonaut_actions';

export interface WritebackOptions {
    esClient: Client;
    runId: string;
    bundleId: string;
    repo: string;
    buildId?: string;
    runTs: string;
}

/**
 * Deterministically writes demo findings and fix bundles for a simulated run.
 */
export async function writeDemoFindingsForRun(options: WritebackOptions) {
    const { esClient, runId, bundleId, repo, buildId, runTs } = options;
    console.log(`[DEMO_WRITEBACK] Starting writeback for run: ${runId}`);

    try {
        // 1. Fetch SARIF Artifact (Simplified for demo)
        // In a real scenario, we'd fetch from object store. 
        // For this task, we will simulate the "source rows" extraction 
        // to ensure the logic is robust even if object store is unreachable.
        const sourceRows = await getSourceRowsFromSARIF(bundleId);

        // 2. Sort deterministically
        sourceRows.sort((a, b) => {
            const keyA = `${a.ruleId}|${a.filePath}|${a.lineNumber}`;
            const keyB = `${b.ruleId}|${b.filePath}|${b.lineNumber}`;
            return keyA.localeCompare(keyB);
        });

        const curatedCount = 30;
        const bulkCount = 800;

        const curatedRows = sourceRows.slice(0, curatedCount);
        const bulkRows = sourceRows.slice(curatedCount, curatedCount + bulkCount);

        const bulkOps: any[] = [];

        // 3. Generate Curated Findings
        for (let i = 0; i < curatedRows.length; i++) {
            const row = curatedRows[i];
            const priorityScore = 95 - (i * 0.8); // 95 -> 71 range
            const isReachable = i < 7;
            const isKev = i < 2;

            const finding = buildFindingDoc({
                ...options,
                row,
                priorityScore,
                isCurated: true,
                isReachable,
                isKev
            });

            bulkOps.push({ index: { _index: INDEX_FINDINGS, _id: finding.findingId } });
            bulkOps.push(finding);

            // Seed Fix for top finding
            if (i === 0) {
                const fixAction = await buildFixAction(runId, finding.findingId, runTs);
                bulkOps.push({ index: { _index: INDEX_ACTIONS, _id: fixAction.actionId } });
                bulkOps.push(fixAction);
            }
        }

        // 4. Generate Bulk Findings
        for (let i = 0; i < bulkRows.length; i++) {
            const row = bulkRows[i];
            const priorityScore = 25 - (i * (25 / bulkCount)); // 25 -> 0 range

            const finding = buildFindingDoc({
                ...options,
                row,
                priorityScore,
                isCurated: false,
                isReachable: false,
                isKev: false
            });

            bulkOps.push({ index: { _index: INDEX_FINDINGS, _id: finding.findingId } });
            bulkOps.push(finding);
        }

        // 5. Execute Bulk
        if (bulkOps.length > 0) {
            const res = await esClient.bulk({ refresh: 'wait_for', body: bulkOps });
            if (res.errors) {
                console.error('[DEMO_WRITEBACK] Bulk index errors occurred');
            } else {
                console.log(`[DEMO_WRITEBACK] Successfully indexed ${bulkOps.length / 2} documents.`);
            }
        }

    } catch (error) {
        console.error('[DEMO_WRITEBACK] Fatal error during writeback:', error);
        throw error;
    }
}

async function getSourceRowsFromSARIF(bundleId: string): Promise<any[]> {
    // For the demo, we'll return a deterministic set of 1000 "source rows"
    // to ensure the grid always has data even if the object store ingest is flaky.
    const rows = [];
    for (let i = 0; i < 1000; i++) {
        rows.push({
            ruleId: `npm.audit.lodash.${1000 + i}`,
            filePath: `src/lib/utils_${i % 10}.ts`,
            lineNumber: 10 + (i * 7) % 500,
            package: 'lodash',
            version: '4.17.20',
            cve: `CVE-2023-${10000 + i}`,
            severity: i % 10 === 0 ? 'CRITICAL' : (i % 5 === 0 ? 'HIGH' : 'MEDIUM'),
            title: `Prototype Pollution in lodash`,
            description: `Vulnerability detected in transitive dependency lodash version 4.17.20.`
        });
    }
    return rows;
}

function buildFindingDoc(params: any) {
    const { runId, repo, buildId, runTs, row, priorityScore, isCurated, isReachable, isKev } = params;

    const canonicalTuple = `${runId}|${row.ruleId}|${row.filePath}|${row.lineNumber}|${row.cve}|${row.package}|${row.version}`;
    const findingId = `f_${crypto.createHash('sha256').update(canonicalTuple).digest('hex')}`;

    return {
        findingId,
        runId,
        repo,
        buildId: buildId || 'build-unknown',
        ruleId: row.ruleId,
        severity: row.severity,
        title: row.title,
        description: row.description,
        filePath: row.filePath,
        lineNumber: row.lineNumber,
        package: row.package,
        version: row.version,
        cve: row.cve,
        priorityScore,
        triage: {
            status: isCurated ? "Open" : "NEW",
            note: isCurated ? "Curated demo finding" : "",
            updatedAt: runTs
        },
        context: {
            reachability: {
                reachable: isReachable,
                status: isReachable ? "REAL" : "UNKNOWN",
                confidenceScore: isReachable ? 0.92 : 0,
                method: "path_trace",
                reason: isReachable ? "user_input_reaches_sink" : "bulk_default",
                evidencePath: isReachable ? `${row.filePath} -> src/lib/merge.ts` : "",
                analysisVersion: "demo-1"
            },
            threat: {
                cve: row.cve,
                kev: isKev,
                epss: isKev ? 0.81 : 0.01,
                source: "argonaut_threatintel"
            }
        },
        priorityExplanation: {
            summary: isCurated ? (isReachable ? "Reachable KEV with high EPSS." : "Curated finding for demo.") : "Bulk demo finding.",
            reasonCodes: isKev ? "KEV|REACHABLE_REAL" : (isReachable ? "REACHABLE_REAL" : "BULK_DEFAULT"),
            factors: {
                kev: isKev,
                epss: isKev ? 0.81 : 0.01,
                reachable: isReachable,
                internetExposed: isReachable,
                confidenceScore: isReachable ? 0.92 : 0,
                blastRadius: isReachable ? 8 : 1
            },
            scoreBreakdown: {
                exploitWeight: isKev ? 45.0 : 2.0,
                reachabilityWeight: isReachable ? 30.0 : 0.0,
                exposureWeight: isReachable ? 12.0 : 0.0,
                totalScore: priorityScore
            }
        },
        createdAt: runTs,
        updatedAt: runTs
    };
}

async function buildFixAction(runId: string, findingId: string, runTs: string) {
    const inputHash = crypto.createHash('sha256').update(`${runId}|${findingId}`).digest('hex');
    const actionId = `FIX_BUNDLE:${runId}:${findingId}:${inputHash}`;

    return {
        actionId,
        actionType: "FIX_BUNDLE",
        runId,
        findingId,
        findingIds: [findingId],
        status: "CREATED",
        payload: {
            patchSummary: "Bumps lodash to a safe version.",
            filesTouched: ["package.json"],
            diff: "--- a/package.json\n+++ b/package.json\n- \"lodash\": \"4.17.20\"\n+ \"lodash\": \"4.17.21\"",
            confidence: 0.98,
            engineVersion: "1.0.0-demo",
            inputHash,
            warnings: []
        },
        createdAt: runTs
    };
}
