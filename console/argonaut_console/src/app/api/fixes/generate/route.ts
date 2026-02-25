import { NextResponse } from 'next/server';
import esClient from '@/lib/esClient';
import { stageService } from '@/lib/stageService';
import { TaskLogger } from '@/lib/taskLogger';
import { FixEngine } from '@/lib/fixEngine';
import { publishAlertToSlack } from '@/lib/slackService';

const INDEX_FINDINGS = 'argonaut_findings';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { runId, findingIds, mode, topN, requestId } = body;

        if (!runId || !mode || !requestId) {
            return NextResponse.json({ error: 'runId, mode, and requestId are required' }, { status: 400 });
        }

        const stage = 'FIX_BUNDLES';

        // 1. Enforce Lock
        const lockAcquired = await stageService.acquireLock(runId, stage, requestId, mode, topN);
        if (!lockAcquired) {
            return NextResponse.json({
                error: 'FIX_BUNDLES stage is already running for this run.',
                status: 'RUNNING'
            }, { status: 409 });
        }

        // 2. Start Background Process
        // In Next.js, we don't await the background work to return 202 quickly.
        // For long-running tasks in serverless, you'd use a queue, but here we'll 
        // trigger it and let it run.
        runFixGeneration(runId, findingIds, mode, topN, requestId).catch(err => {
            console.error('[API/Fixes/Generate] Background execution error:', err);
        });

        return NextResponse.json({
            message: 'Fix generation started',
            requestId,
            status: 'ACCEPTED'
        }, { status: 202 });

    } catch (error: any) {
        console.error('Error starting fix generation:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

async function runFixGeneration(runId: string, findingIds: string[] | undefined, mode: 'single' | 'topN', topN: number | undefined, requestId: string) {
    const logger = new TaskLogger(runId);
    const fixEngine = new FixEngine(logger);
    const stage = 'FIX_BUNDLES';

    const startTime = Date.now();

    try {
        // 1. Identify Findings to process
        let targets: any[] = [];

        if (mode === 'single' && findingIds && findingIds.length > 0) {
            // Fetch specific findings
            const res = await esClient.search({
                index: INDEX_FINDINGS,
                query: {
                    bool: {
                        must: [
                            { term: { runId } },
                            { ids: { values: findingIds } }
                        ]
                    }
                }
            });
            targets = res.hits.hits.map(h => ({ ...(h._source as any), _id: h._id }));
        } else if (mode === 'topN') {
            const limit = topN || 5;
            // Fetch top N findings based on priorityScore desc
            const res = await esClient.search({
                index: INDEX_FINDINGS,
                size: limit,
                query: {
                    bool: {
                        must: [
                            { term: { runId } },
                            // Filtering to high-signal findings per implementation plan
                            { term: { 'context.reachability.reachable': true } }
                        ]
                    }
                },
                sort: [
                    { priorityScore: { order: 'desc', missing: '_last' } },
                    { findingId: { order: 'asc' } }
                ]
            });
            targets = res.hits.hits.map(h => ({ ...(h._source as any), _id: h._id }));
        }

        const requestedCount = targets.length;
        await logger.log(stage, 'SYSTEM', 'stage:FIX_BUNDLES:started', 'STARTED', `FIX_BUNDLES started: mode=${mode}, requested=${requestedCount}`, { mode, requestedCount });

        if (requestedCount === 0) {
            await logger.log(stage, 'SYSTEM', 'stage:FIX_BUNDLES:skipped', 'SKIPPED', 'No eligible findings found for fix generation.');
            await stageService.updateStatus(runId, stage, 'SKIPPED');
            return;
        }

        // 2. Process Findings
        let created = 0;
        let exists = 0;
        let failed = 0;

        for (const target of targets) {
            const result = await fixEngine.processFinding(runId, target._id, target);
            if (result === 'CREATED') created++;
            else if (result === 'EXISTS') exists++;
            else failed++;
        }

        // 3. Complete
        const durationMs = Date.now() - startTime;
        await logger.log(stage, 'SYSTEM', 'stage:FIX_BUNDLES:complete', 'SUCCEEDED', `FIX_BUNDLES complete: created=${created}, exists=${exists}, failed=${failed}, durationMs=${durationMs}`, {
            created, exists, failed, durationMs
        });

        await publishAlertToSlack({
            title: `🛠️ Fix Generation Complete: ${runId}`,
            message: `Successfully processed ${targets.length} findings.\n- *Created:* ${created}\n- *Exists:* ${exists}\n- *Failed:* ${failed}`,
            level: 'info',
            fields: [
                { label: 'RunID', value: runId },
                { label: 'Duration', value: `${(durationMs / 1000).toFixed(1)}s` }
            ],
            actions: [
                { text: 'View Run ↗', url: `${process.env.PUBLIC_BASE_URL}/runs/${runId}` }
            ]
        });

        await stageService.updateStatus(runId, stage, 'SUCCEEDED');

    } catch (error: any) {
        console.error('[runFixGeneration] Fatal error:', error);
        await logger.log(stage, 'SYSTEM', 'stage:FIX_BUNDLES:failed', 'FAILED', `FIX_BUNDLES fatal error: ${error.message}`);

        await publishAlertToSlack({
            title: `❌ Fix Generation Failed: ${runId}`,
            message: `A fatal error occurred during the FIX_BUNDLES stage: ${error.message}`,
            level: 'error',
            fields: [
                { label: 'RunID', value: runId }
            ],
            actions: [
                { text: 'Debug in Console ↗', url: `${process.env.PUBLIC_BASE_URL}/runs/${runId}` }
            ]
        });

        await stageService.updateStatus(runId, stage, 'FAILED');
    }
}
