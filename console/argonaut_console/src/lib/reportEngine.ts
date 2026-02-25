import crypto from 'crypto';
import esClient from './esClient';

const INDEX_FINDINGS = 'argonaut_findings';
const INDEX_ACTIONS = 'argonaut_actions';

export interface ReportThresholds {
    fixableScoreCutoff: number;
    epssCutoff: number;
}

export interface ReportSummaryPayload {
    runId: string;
    payloadVersion: string;
    generatedAt: string;
    thresholds: ReportThresholds;
    counts: {
        totalFindings: number;
        fixableCutoffCount: number;
        reachableCount: number;
        kevCount: number;
        epssGte050Count: number;
        reachableKevCount: number;
        reachableFixableCount: number;
        fixBundlesCreated: number;
    };
    topLists: {
        topReachable: any[];
        topKev: any[];
        topFixBundles: any[];
        topCurated: any[];
    };
    links: {
        consoleRunPath: string;
        consoleFindingsPath: string;
    };
}

/**
 * Deterministic JSON stringifier to ensure stable hashing.
 */
export function canonicalStringify(obj: any): string {
    if (obj === null) return 'null';
    if (typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) {
        return '[' + obj.map(item => canonicalStringify(item)).join(',') + ']';
    }
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(key => `${JSON.stringify(key)}:${canonicalStringify(obj[key])}`).join(',') + '}';
}

/**
 * Generates the report summary for a given runId.
 * Implements Task 7.9 logic with strict idempotency.
 */
export async function generateReportSummary(runId: string, thresholds: ReportThresholds = { fixableScoreCutoff: 70, epssCutoff: 0.5 }): Promise<ReportSummaryPayload> {
    console.log(`[REPORT_ENGINE] Generating report for run: ${runId}`);

    // 1. Basic Counts Aggregation
    const countsRes = await esClient.search({
        index: INDEX_FINDINGS,
        query: { term: { runId: runId } },
        size: 0,
        aggs: {
            totalFindings: { value_count: { field: 'findingId' } },
            fixableCutoffCount: { filter: { range: { priorityScore: { gte: thresholds.fixableScoreCutoff } } } },
            reachableCount: { filter: { term: { "context.reachability.reachable": true } } },
            kevCount: { filter: { term: { "context.threat.kev": true } } },
            epssGte050Count: { filter: { range: { "context.threat.epss": { gte: thresholds.epssCutoff } } } },
            reachableKevCount: {
                filter: {
                    bool: {
                        must: [
                            { term: { "context.reachability.reachable": true } },
                            { term: { "context.threat.kev": true } }
                        ]
                    }
                }
            },
            reachableFixableCount: {
                filter: {
                    bool: {
                        must: [
                            { term: { "context.reachability.reachable": true } },
                            { range: { priorityScore: { gte: thresholds.fixableScoreCutoff } } }
                        ]
                    }
                }
            }
        }
    });

    const aggs = countsRes.aggregations as Record<string, any>;
    const counts = {
        totalFindings: countsRes.hits.total ? (typeof countsRes.hits.total === 'number' ? countsRes.hits.total : (countsRes.hits.total as any).value) : 0,
        fixableCutoffCount: aggs.fixableCutoffCount?.doc_count || 0,
        reachableCount: aggs.reachableCount?.doc_count || 0,
        kevCount: aggs.kevCount?.doc_count || 0,
        epssGte050Count: aggs.epssGte050Count?.doc_count || 0,
        reachableKevCount: aggs.reachableKevCount?.doc_count || 0,
        reachableFixableCount: aggs.reachableFixableCount?.doc_count || 0,
        fixBundlesCreated: 0 // Will populate below
    };

    // 2. Fix Bundles Created Count (from argonaut_actions)
    const fixActionsRes = await esClient.count({
        index: INDEX_ACTIONS,
        query: {
            bool: {
                must: [
                    { term: { runId: runId } },
                    { term: { actionType: "FIX_BUNDLE" } }
                ]
            }
        }
    });
    counts.fixBundlesCreated = fixActionsRes.count;

    // 3. Top Lists
    const topReachableRes = await esClient.search({
        index: INDEX_FINDINGS,
        query: {
            bool: {
                must: [
                    { term: { runId: runId } },
                    { term: { "context.reachability.reachable": true } }
                ]
            }
        },
        size: 5,
        sort: [{ priorityScore: 'desc' }, { findingId: 'asc' }]
    });

    const topKevRes = await esClient.search({
        index: INDEX_FINDINGS,
        query: {
            bool: {
                must: [
                    { term: { runId: runId } },
                    { term: { "context.threat.kev": true } }
                ]
            }
        },
        size: 5,
        sort: [{ priorityScore: 'desc' }, { findingId: 'asc' }]
    });

    const topCuratedRes = await esClient.search({
        index: INDEX_FINDINGS,
        query: {
            bool: {
                must: [
                    { term: { runId: runId } },
                    { term: { "triage.status": "DEMO_CURATED" } }
                ]
            }
        },
        size: 5,
        sort: [{ priorityScore: 'desc' }, { findingId: 'asc' }]
    });

    // 4. Top Fix Bundles (Join Action -> Finding)
    const fixBundlesRes = await esClient.search({
        index: INDEX_ACTIONS,
        query: {
            bool: {
                must: [
                    { term: { runId: runId } },
                    { term: { actionType: "FIX_BUNDLE" } }
                ]
            }
        },
        size: 5,
        sort: [{ createdAt: 'desc' }, { actionId: 'asc' }]
    });

    const fixFindingIds = (fixBundlesRes.hits.hits
        .map(h => {
            const source = h._source as Record<string, any>;
            if (source.findingId) return String(source.findingId);
            if (Array.isArray(source.findingIds) && source.findingIds.length > 0) return String(source.findingIds[0]);
            return null;
        })
        .filter(Boolean) as string[]);
    const orderedUniqueFixFindingIds = Array.from(new Set(fixFindingIds));
    let topFixBundles: any[] = [];
    if (orderedUniqueFixFindingIds.length > 0) {
        const findingsForFixRes = await esClient.search({
            index: INDEX_FINDINGS,
            query: {
                bool: {
                    must: [{ term: { runId: runId } }],
                    filter: [{ terms: { findingId: orderedUniqueFixFindingIds } }]
                }
            },
            size: orderedUniqueFixFindingIds.length
        });
        const findingById = new Map<string, Record<string, any>>();
        for (const hit of findingsForFixRes.hits.hits) {
            const source = hit._source as Record<string, any>;
            if (source.findingId) {
                findingById.set(String(source.findingId), source);
            }
        }
        topFixBundles = orderedUniqueFixFindingIds
            .map(id => findingById.get(id))
            .filter(Boolean)
            .slice(0, 5) as Record<string, any>[];
    }

    const payload: ReportSummaryPayload = {
        runId,
        payloadVersion: "report_summary_v1",
        generatedAt: new Date().toISOString(),
        thresholds,
        counts,
        topLists: {
            topReachable: topReachableRes.hits.hits.map(h => h._source),
            topKev: topKevRes.hits.hits.map(h => h._source),
            topFixBundles,
            topCurated: topCuratedRes.hits.hits.map(h => h._source)
        },
        links: {
            consoleRunPath: `/runs/${runId}`,
            consoleFindingsPath: `/runs/${runId}/findings?reachable=true`
        }
    };

    // 5. Deterministic Hashing & Idempotency
    const { generatedAt: _, ...hashablePart } = payload;
    const canonicalPayload = canonicalStringify(hashablePart);
    const reportPayloadHash = crypto.createHash('sha256').update(canonicalPayload).digest('hex');
    const idempotencyKey = `REPORT_SUMMARY:${runId}:${reportPayloadHash}`;

    // 6. Record Action
    console.log(`[REPORT_ENGINE] Recording action with idempotencyKey: ${idempotencyKey}`);
    try {
        await esClient.index({
            index: INDEX_ACTIONS,
            id: idempotencyKey,
            op_type: 'create',
            document: {
                actionId: idempotencyKey,
                runId,
                actionType: 'REPORT_SUMMARY',
                status: 'COMPLETED',
                idempotencyKey,
                payload,
                createdAt: new Date().toISOString()
            }
        });
    } catch (e: any) {
        if (e.meta?.statusCode === 409) {
            console.log(`[REPORT_ENGINE] Report summary already exists for this content. (Conflict 409)`);
        } else {
            console.error(`[REPORT_ENGINE] Error recording report action:`, e);
            throw e;
        }
    }

    return payload;
}
