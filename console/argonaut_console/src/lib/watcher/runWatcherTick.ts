import esClient from '../esClient';
import { buildRunGraphView } from './buildRunGraphView';
import { runThreatIntelWithLock } from './enrichThreatIntel';
import { generateReportSummary } from '../reportEngine';
import { publishReportToSlack } from '../slackService';
import { writeDemoFindingsForRun } from './demoWriteback';

// Configuration
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';
const SLACK_MODE = process.env.SLACK_MODE || 'dry_run';
const WATCHER_LOCK_OWNER = process.env.WATCHER_LOCK_OWNER || 'argonaut-watcher-1';

// Indices
const INDEX_REGISTRY = 'argonaut_bundle_registry';
const INDEX_RUNS = 'argonaut_runs';
const INDEX_TASKLOGS = 'argonaut_tasklogs';
const INDEX_ACTIONS = 'argonaut_actions';

/**
 * Pushes a new scan notification to Slack, or acts as a dry_run depending on SLACK_MODE.
 * Idempotent: writes to argonaut_actions using sha256 to avoid duplicate sends.
 */
export async function pushSlackNewScan(applicationId: string, bundleId: string, runId?: string) {
    const crypto = require('crypto');
    const templateVersion = 'v1';

    // Idempotency Key
    const idKeyString = `SLACK_NEW_SCAN_${bundleId}_${templateVersion}`;
    const idempotencyKey = crypto.createHash('sha256').update(idKeyString).digest('hex');

    // 1. Check if the action already exists
    try {
        const existing = await esClient.get({
            index: INDEX_ACTIONS,
            id: idempotencyKey
        });

        if (existing) {
            console.log(`[SLACK] Duplicate prevent: Action ${idempotencyKey} already exists for bundle ${bundleId}`);
            return;
        }
    } catch (error: any) {
        // 404 is expected here
        if (error.meta?.statusCode !== 404) {
            console.error('[SLACK] Error checking idempotency key:', error);
            return;
        }
    }

    // 2. We are clear to proceed
    const payload = {
        blocks: [
            {
                type: "header",
                text: {
                    type: "plain_text",
                    text: `🔍 New Scan: ${applicationId}`,
                    emoji: true
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `A new bundle **${bundleId}** has been received for **${applicationId}** and is currently processing. <${process.env.PUBLIC_BASE_URL || 'http://localhost:3000'}/runs/${runId || bundleId}|View Analysis ↗>`
                }
            }
        ]
    };

    let status = 'DRY_RUN_READY';

    if (SLACK_MODE === 'enabled' && SLACK_WEBHOOK_URL) {
        try {
            const res = await fetch(SLACK_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                status = 'EXECUTED';
                console.log(`[SLACK] Successfully posted to Slack for bundle: ${bundleId}`);
            } else {
                console.error(`[SLACK] Failed to post to Slack. Status: ${res.status}`);
                status = 'FAILED';
            }
        } catch (e) {
            console.error(`[SLACK] Error pushing to webhook:`, e);
            status = 'FAILED';
        }
    } else {
        console.log(`[SLACK] (Dry Run): Payload ready for ${bundleId}`);
    }

    // 3. Atomically write the action record tracking this
    try {
        await esClient.index({
            index: INDEX_ACTIONS,
            id: idempotencyKey,
            op_type: 'create', // Only insert if it doesn't exist
            document: {
                actionType: 'SLACK_NEW_SCAN',
                bundleId,
                applicationId,
                status,
                payload,
                createdAt: new Date().toISOString()
            }
        });
    } catch (e: any) {
        if (e.meta?.statusCode === 409) {
            console.log(`[SLACK] Action record creation collision. Someone beat us to it.`);
        } else {
            console.error(`[SLACK] Error saving action record:`, e);
        }
    }
}

import { STAGES } from '../../../../../argus_core/lib/contracts/executionEnums';

/**
 * Creates the run record and writes necessary task logs to 'simulate' the demo execution
 */
export async function simulateWorkflowRun(bundleId: string, applicationId: string, runId: string, buildId?: string) {
    let seqCounter = 1;
    const emitLog = async (stage: string, taskType: string, taskKey: string, status: string, message: string, refs?: any, error?: any) => {
        await esClient.index({
            index: INDEX_TASKLOGS,
            document: {
                runId, bundleId, seq: seqCounter++, timestamp: new Date().toISOString(),
                level: status === 'FAILED' ? 'ERROR' : 'INFO', stage, status, taskType, taskKey, message, refs, error
            }
        });
    };

    const runStageSummary: any = {};
    STAGES.forEach(stage => {
        runStageSummary[stage] = { status: 'NOT_STARTED' };
    });

    const updateRun = async (status: string, completedAt?: string) => {
        const doc: any = { status, stageSummary: runStageSummary };
        if (completedAt) doc.completedAt = completedAt;
        if (status === 'FAILED') doc.errorSummary = 'Workflow failed during execution';
        await esClient.update({ index: INDEX_RUNS, id: runId, doc });
    };

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const withStage = async (stage: string, fn: () => Promise<void>) => {
        const startedAt = new Date().toISOString();
        runStageSummary[stage] = { status: 'RUNNING', startedAt };
        await updateRun('RUNNING');

        await emitLog(stage, 'SYSTEM', `stage:${stage}:started`, 'STARTED', `Stage ${stage} started`);

        try {
            await fn();
            const endedAt = new Date().toISOString();
            runStageSummary[stage] = { ...runStageSummary[stage], status: 'SUCCEEDED', endedAt };
            await emitLog(stage, 'SYSTEM', `stage:${stage}:succeeded`, 'SUCCEEDED', `Stage ${stage} succeeded`);
        } catch (err: any) {
            const endedAt = new Date().toISOString();
            runStageSummary[stage] = { ...runStageSummary[stage], status: 'FAILED', endedAt };
            await emitLog(stage, 'SYSTEM', `stage:${stage}:failed`, 'FAILED', `Stage ${stage} failed`, undefined, { code: 'STAGE_FAIL', message: err.message || String(err) });
            throw err;
        }
    };

    // 1. Create run doc
    await esClient.index({
        index: INDEX_RUNS, id: runId,
        document: {
            runId, bundleId, applicationId, buildId,
            status: 'RUNNING', createdAt: new Date().toISOString(),
            executionMode: 'cloud', pipelineVersion: '1.2.0',
            stageSummary: runStageSummary
        }
    });

    // 2. Emit provenance hook (workflow meta)
    await emitLog('ACQUIRE', 'SYSTEM', 'workflow:meta', 'SUCCEEDED', 'Workflow execution initialized', {
        workflowSystem: "elastic-agent-builder",
        workflowId: "argonaut-auto-triage-v1",
        workflowVersion: "1.2.0",
        agentId: "agent_runner_001"
    });

    try {
        await withStage('ACQUIRE', async () => {
            await delay(100);
            await emitLog('ACQUIRE', 'SYSTEM', 'acquire:manifest', 'SUCCEEDED', 'Auto-run claimed bundle ' + bundleId);
            await emitLog('ACQUIRE', 'SYSTEM', 'acquire:verify', 'SUCCEEDED', 'Downloaded manifest and verified artifacts');
        });

        await withStage('NORMALIZE', async () => {
            await delay(100);
            await emitLog('NORMALIZE', 'SYSTEM', 'normalize:sarif', 'SUCCEEDED', 'Parsed SARIF: 14 results');
            await emitLog('NORMALIZE', 'SYSTEM', 'normalize:sbom', 'SUCCEEDED', 'Parsed SBOM: 341 components');
        });

        await withStage('SCORE', async () => {
            await delay(100);
            await emitLog('SCORE', 'SYSTEM', 'score:rank', 'SUCCEEDED', 'Ranked findings: count=14');
        });

        await withStage('DEP_GRAPH', async () => {
            const { nodes, edges } = await buildRunGraphView(esClient, bundleId, runId, applicationId);
            await emitLog('DEP_GRAPH', 'SYSTEM', 'graph:build', 'SUCCEEDED', `Graph built: nodes=${nodes}, edges=${edges}`);
            // Opaque stats inside the run doc itself
            runStageSummary['DEP_GRAPH'] = { ...runStageSummary['DEP_GRAPH'], stats: { nodes, edges } };
        });

        // Skip FIX_BUNDLES per the default logic, but record them as SKIPPED
        runStageSummary['FIX_BUNDLES'] = { status: 'SKIPPED' };
        await updateRun('RUNNING'); // flush the skipped status

        await withStage('THREAT_INTEL', async () => {
            await runThreatIntelWithLock(runId, bundleId);
        });

        // DEMO_WRITEBACK
        if (process.env.DEMO_WRITEBACK_MODE === 'curated') {
            await writeDemoFindingsForRun({
                esClient,
                runId,
                bundleId,
                repo: applicationId,
                buildId,
                runTs: new Date().toISOString()
            });
            // Ensure findings and actions are visible for the REPORT stage
            await esClient.indices.refresh({ index: 'argonaut_findings' });
            await esClient.indices.refresh({ index: 'argonaut_actions' });
        }

        await withStage('REPORT', async () => {
            await emitLog('REPORT', 'SYSTEM', 'report:start', 'STARTED', 'Generating run report summary');
            const report = await generateReportSummary(runId);
            await emitLog('REPORT', 'SYSTEM', 'report:generate', 'SUCCEEDED',
                `Report generated: ${report.counts.totalFindings} total, ${report.counts.fixableCutoffCount} fixable, ${report.counts.reachableCount} reachable, ${report.counts.kevCount} KEV`);

            await emitLog('REPORT', 'SYSTEM', 'slack:publish', 'STARTED', 'Distributing report to Slack');
            const slackRes = await publishReportToSlack(runId, report);
            await emitLog('REPORT', 'SYSTEM', 'report:publish', 'SUCCEEDED', `Slack summary status: ${slackRes.status}`);
        });

        await updateRun('SUCCEEDED', new Date().toISOString());
    } catch (e) {
        await updateRun('FAILED', new Date().toISOString());
        throw e;
    }
}

/**
 * The core polling loop to pick up NEW bundles, assign them to this watcher, 
 * run the simulated workflow, and notify Slack.
 */
export async function runWatcherTick(): Promise<{ processed: number, skipped: number }> {
    let processed = 0;
    let skipped = 0;

    try {
        console.log(`[WATCHER] Tick started at ${new Date().toISOString()}`);
        // Query for NEW bundles
        console.log(`[WATCHER] Searching for NEW bundles in ${INDEX_REGISTRY}...`);
        const searchRes = await esClient.search({
            index: INDEX_REGISTRY,
            size: 5, // Process up to 5 at a time
            seq_no_primary_term: true,
            query: {
                term: { 'status': 'NEW' }
            },
            sort: [
                { createdAt: { order: 'desc' } }
            ]
        });

        const hits = searchRes.hits.hits;
        console.log(`[WATCHER] Search complete.Found ${hits?.length || 0} hits.`);

        if (!hits || hits.length === 0) {
            return { processed, skipped };
        }

        for (const hit of hits) {
            const bundleId = hit._id as string;

            if (!bundleId) {
                skipped++;
                continue;
            }

            const doc = hit._source as any;
            const applicationId = doc.applicationId || doc.repo || 'unknown_app';
            const buildId = doc.buildId || doc.version;

            // Deterministic hash runId — must stay in sync with demo:judge's computeRunId tuple
            const crypto = require('crypto');
            const runId = crypto.createHash('sha256').update([applicationId, buildId || '', bundleId].join('|')).digest('hex');
            const lockedAt = new Date().toISOString();

            // 1. Atomic claim via optimistic concurrency (no Painless scripting)
            try {
                await esClient.update({
                    index: INDEX_REGISTRY,
                    id: bundleId,
                    if_seq_no: hit._seq_no,
                    if_primary_term: hit._primary_term,
                    doc: {
                        status: 'PROCESSING',
                        activeRunId: runId,
                        processingLock: {
                            lockedAt,
                            lockedBy: WATCHER_LOCK_OWNER,
                            runId
                        }
                    },
                    refresh: 'wait_for'
                });
            } catch (err: any) {
                if (err.meta?.statusCode === 409) {
                    // Bundle was claimed by another watcher between search and update
                    skipped++;
                    continue;
                }
                console.error(`Failed to claim bundle ${bundleId}: `, err);
                skipped++;
                continue;
            }

            // 2. Successfully claimed. Now process.
            console.log(`[WATCHER] Claimed bundle ${bundleId}. Starting simulation...`);

            try {
                // Kick off Slack notification simultaneously
                await pushSlackNewScan(applicationId, bundleId, runId);

                // Run simulation
                await simulateWorkflowRun(bundleId, applicationId, runId, buildId);

                // 3. Mark processed in registry
                await esClient.update({
                    index: INDEX_REGISTRY,
                    id: bundleId,
                    doc: {
                        status: 'PROCESSED',
                        lastRunId: runId,
                        activeRunId: null,
                        processedAt: new Date().toISOString()
                    }
                });

                processed++;
                console.log(`[WATCHER] Successfully processed bundle ${bundleId} `);

            } catch (workflowErr: any) {
                console.error(`[WATCHER] Error processing bundle ${bundleId}: `, workflowErr);

                // Fallback: mark as FAILED
                await esClient.update({
                    index: INDEX_REGISTRY,
                    id: bundleId,
                    doc: {
                        status: 'FAILED',
                        lastRunId: runId,
                        activeRunId: null,
                        errorSummary: workflowErr.message || String(workflowErr),
                        processedAt: new Date().toISOString()
                    }
                });

                // And run doc as failed
                await esClient.update({
                    index: INDEX_RUNS,
                    id: runId,
                    doc: {
                        status: 'FAILED',
                        completedAt: new Date().toISOString(),
                        errorSummary: workflowErr.message || String(workflowErr),
                    }
                }).catch(() => { });
            }
        }

    } catch (e) {
        console.error('[WATCHER] Error during watcher tick:', e);
    }

    return { processed, skipped };
}
