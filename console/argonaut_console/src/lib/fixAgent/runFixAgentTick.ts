/**
 * runFixAgentTick
 *
 * Core polling loop for the Fix Worker.
 * Follows the same pattern as runWatcherTick.ts:
 *   1. Poll argonaut_actions for FIX_REQUEST status=NEW
 *   2. Claim via optimistic concurrency (_seq_no/_primary_term)
 *   3. Process each finding with FixEngine.processFinding()
 *   4. Write FIX_BUNDLE actions + tasklogs
 *   5. Update FIX_REQUEST status + outcome summary
 *   6. Post "Fix bundle ready" to Slack (idempotent via SLACK_PUBLISH action)
 */

import esClient from '../esClient';
import { TaskLogger } from '../taskLogger';
import { FixEngine } from '../fixEngine';
import { publishAlertToSlack } from '../slackService';
import {
    FixOutcomeSummary,
    formatOutcomeSummary,
    FIX_ENGINE_VERSION,
} from './fixAgentTypes';
import crypto from 'crypto';

const INDEX_ACTIONS = 'argonaut_actions';
const INDEX_FINDINGS = 'argonaut_findings';
const MAX_REQUESTS_PER_TICK = 5;

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';

/**
 * One tick of the fix agent polling loop.
 * Returns processed and skipped counts.
 */
export async function runFixAgentTick(): Promise<{ processed: number; skipped: number }> {
    let processed = 0;
    let skipped = 0;

    try {
        console.log(`[FIX_AGENT] Tick started at ${new Date().toISOString()}`);

        // 1. Poll for NEW FIX_REQUESTs
        const searchRes = await esClient.search({
            index: INDEX_ACTIONS,
            size: MAX_REQUESTS_PER_TICK,
            seq_no_primary_term: true,
            query: {
                bool: {
                    must: [
                        { term: { actionType: 'FIX_REQUEST' } },
                        { term: { status: 'NEW' } },
                    ],
                },
            },
            sort: [{ createdAt: { order: 'asc' } }],
        });

        const hits = searchRes.hits.hits;
        console.log(`[FIX_AGENT] Found ${hits?.length || 0} pending FIX_REQUESTs`);

        if (!hits || hits.length === 0) {
            return { processed, skipped };
        }

        for (const hit of hits) {
            const requestId = hit._id as string;
            const doc = hit._source as any;
            const findingIds: string[] = doc.findingIds || [];
            const runId: string = doc.runId;
            const requestHash: string = doc.payloadHash || '';

            if (!requestId || findingIds.length === 0) {
                skipped++;
                continue;
            }

            // 2. Claim via optimistic concurrency
            try {
                await esClient.update({
                    index: INDEX_ACTIONS,
                    id: requestId,
                    if_seq_no: hit._seq_no,
                    if_primary_term: hit._primary_term,
                    doc: {
                        status: 'PROCESSING',
                        updatedAt: new Date().toISOString(),
                    },
                    refresh: 'wait_for',
                });
            } catch (err: any) {
                if (err.meta?.statusCode === 409) {
                    // Another worker claimed this request — skip silently
                    skipped++;
                    continue;
                }
                console.error(`[FIX_AGENT] Failed to claim ${requestId}:`, err);
                skipped++;
                continue;
            }

            // 3. Process claimed request
            console.log(`[FIX_AGENT] Claimed ${requestId}. Processing ${findingIds.length} findings...`);
            const logger = new TaskLogger(runId);
            const engine = new FixEngine(logger);
            const outcome: FixOutcomeSummary = { created: 0, exists: 0, failed: 0 };

            await logger.log(
                'FIX_BUNDLES', 'SYSTEM', `request:${requestId}`, 'STARTED',
                `Fix generation started for ${findingIds.length} finding(s) [source=${doc.source || 'unknown'}]`,
                { findingIds, source: doc.source, agentId: doc.templateVersion }
            );

            try {
                for (const findingId of findingIds) {
                    // Fetch finding doc
                    let findingDoc: any;
                    try {
                        const findingRes = await esClient.get({
                            index: INDEX_FINDINGS,
                            id: findingId,
                        });
                        findingDoc = findingRes._source;
                    } catch (fetchErr: any) {
                        console.error(`[FIX_AGENT] Finding ${findingId} not found:`, fetchErr.message);
                        await logger.log(
                            'FIX_BUNDLES', 'FINDING', findingId, 'FAILED',
                            `Finding not found in index`
                        );
                        outcome.failed++;
                        continue;
                    }

                    // Generate fix via FixEngine
                    const result = await engine.processFinding(runId, findingId, findingDoc);

                    if (result === 'CREATED') outcome.created++;
                    else if (result === 'EXISTS') outcome.exists++;
                    else outcome.failed++;
                }

                // 4. Update FIX_REQUEST with outcome
                const summaryString = formatOutcomeSummary(outcome);
                const finalStatus = (outcome.created > 0 || outcome.exists > 0) ? 'SUCCEEDED' : 'FAILED';

                await esClient.update({
                    index: INDEX_ACTIONS,
                    id: requestId,
                    doc: {
                        status: finalStatus,
                        error: summaryString,
                        updatedAt: new Date().toISOString(),
                    },
                });

                await logger.log(
                    'FIX_BUNDLES', 'SYSTEM', `request:${requestId}`, finalStatus,
                    `Fix generation complete: ${summaryString}`,
                    { outcome }
                );

                // 5. Slack notification (idempotent via SLACK_PUBLISH action)
                await postFixReadySlack(runId, requestHash, requestId, outcome, findingIds.length);

                processed++;
                console.log(`[FIX_AGENT] Completed ${requestId}: ${summaryString}`);

            } catch (batchErr: any) {
                // Fatal batch error
                console.error(`[FIX_AGENT] Fatal error processing ${requestId}:`, batchErr);

                await esClient.update({
                    index: INDEX_ACTIONS,
                    id: requestId,
                    doc: {
                        status: 'FAILED',
                        error: `FATAL: ${batchErr.message || String(batchErr)}`,
                        updatedAt: new Date().toISOString(),
                    },
                }).catch(() => { });

                await logger.log(
                    'FIX_BUNDLES', 'SYSTEM', `request:${requestId}`, 'FAILED',
                    `Fatal batch error: ${batchErr.message}`
                );
            }
        }

    } catch (e) {
        console.error('[FIX_AGENT] Error during fix agent tick:', e);
    }

    return { processed, skipped };
}

/**
 * Post "Fix bundle ready" to Slack, idempotent via SLACK_PUBLISH action.
 * Uses FIX_READY:<runId>:<requestHash> as idempotency key.
 */
async function postFixReadySlack(
    runId: string,
    requestHash: string,
    requestId: string,
    outcome: FixOutcomeSummary,
    totalFindings: number,
) {
    const slackIdempotencyKey = `FIX_READY:${runId}:${requestHash}`;

    // Check if already posted
    const existing = await esClient.get({
        index: INDEX_ACTIONS,
        id: slackIdempotencyKey,
    }).catch(() => null);

    if (existing && existing.found) {
        console.log(`[FIX_AGENT] Slack already posted for ${slackIdempotencyKey}`);
        return;
    }

    // Post to Slack
    const summaryString = formatOutcomeSummary(outcome);
    const consoleUrl = `${PUBLIC_BASE_URL}/runs/${runId}`;
    const slackResult = await publishAlertToSlack({
        title: '🔧 Elastic Agent — Fix Bundles Ready',
        message: `Elastic Agent Builder dispatched remediation for ${totalFindings} finding(s). Fix Worker completed: ${summaryString}`,
        level: outcome.failed > 0 ? 'warning' : 'info',
        fields: [
            { label: 'Run', value: runId },
            { label: 'Created', value: String(outcome.created) },
            { label: 'Existed', value: String(outcome.exists) },
            { label: 'Failed', value: String(outcome.failed) },
            { label: 'Agent', value: 'Elastic Agent Builder' },
        ],
        actions: [
            { text: 'View Run ↗', url: consoleUrl },
        ],
    });

    // Record SLACK_PUBLISH action for idempotency
    const now = new Date().toISOString();
    await esClient.index({
        index: INDEX_ACTIONS,
        id: slackIdempotencyKey,
        document: {
            actionType: 'SLACK_PUBLISH',
            runId,
            status: slackResult.status === 'DRY_RUN' ? 'DRY_RUN' : slackResult.status === 'POSTED' ? 'POSTED' : 'FAILED',
            idempotencyKey: slackIdempotencyKey,
            payloadHash: crypto.createHash('sha256').update(summaryString).digest('hex'),
            source: 'fix_agent',
            targetSystem: 'slack',
            targetKey: requestId,
            createdAt: now,
            updatedAt: now,
        },
    }).catch(err => {
        console.error('[FIX_AGENT] Failed to record SLACK_PUBLISH action:', err);
    });

    console.log(`[FIX_AGENT] Slack notification ${slackResult.status} for ${slackIdempotencyKey}`);
}
