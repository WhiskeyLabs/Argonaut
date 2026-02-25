import { NextResponse } from 'next/server';
import esClient from '@/lib/esClient';
import crypto from 'crypto';

const INDEX_FINDINGS = 'argonaut_findings';
const INDEX_GRAPH_VIEWS = 'argonaut_graph_views';
const INDEX_ACTIONS = 'argonaut_actions';
const INDEX_TASKLOGS = 'argonaut_tasklogs';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ findingId: string }> }
) {
    let runId = '';
    try {
        const { findingId } = await params;
        const { searchParams } = new URL(request.url);
        runId = searchParams.get('runId') || '';

        if (!runId) {
            return NextResponse.json({ error: 'runId is required' }, { status: 400 });
        }

        // 1. Fetch Finding Data
        const findingResponse = await esClient.get({
            index: INDEX_FINDINGS,
            id: findingId
        }).catch(err => {
            if (err.meta?.statusCode === 404) return null;
            throw err;
        });

        if (!findingResponse || !findingResponse.found) {
            return NextResponse.json({ error: 'Finding not found' }, { status: 404 });
        }

        const findingDoc = findingResponse._source as any;

        // Security check: ensure the finding belongs to the requested runId
        if (findingDoc.runId !== runId) {
            return NextResponse.json({ error: 'Finding does not belong to the specified runId' }, { status: 403 });
        }

        // 2. Fetch Graph View Data
        // View type per epic 7 design: "critical_path_v1"
        const graphResponse = await esClient.search({
            index: INDEX_GRAPH_VIEWS,
            size: 1,
            query: {
                bool: {
                    must: [
                        { term: { runId } },
                        { term: { viewType: 'run_level_dependency_graph' } }
                    ]
                }
            }
        });

        const graphHits = graphResponse.hits.hits || [];
        const graphView = {
            available: graphHits.length > 0,
            doc: graphHits.length > 0 ? graphHits[0]._source : null
        };

        // 3. Fetch History/Actions Date
        // Actions might just target 'findingId' exactly, or 'findingIds' array.
        const actionsResponse = await esClient.search({
            index: INDEX_ACTIONS,
            size: 100,
            query: {
                bool: {
                    must: [
                        { term: { runId } }
                    ],
                    should: [
                        { term: { findingId: findingId } },
                        { term: { findingIds: findingId } }
                    ],
                    minimum_should_match: 1
                }
            },
            sort: [
                { createdAt: { order: 'desc' } },
                { actionId: { order: 'asc' } }
            ]
        });

        const actionsList = (actionsResponse.hits.hits || []).map((hit: any) => hit._source);

        // 4. Determine latest fix bundle
        const fixActions = actionsList.filter((a: any) => a.actionType === 'FIX_BUNDLE');
        const latestFixBundle = fixActions.length > 0 ? fixActions[0] : null;

        const responsePayload = {
            finding: findingDoc,
            reachability: findingDoc.context?.reachability || null,
            graphView,
            actions: actionsList,
            fix: {
                available: !!latestFixBundle,
                latestBundle: latestFixBundle
            },
            links: {
                runUrl: `/runs/${runId}`,
                kibanaUrl: `http://localhost:5601/app/discover#/?_a=(query:(language:kuery,query:'findingId:%22${findingId}%22'))`
            }
        };

        return NextResponse.json(responsePayload);

    } catch (error: any) {
        console.error('Error in /api/findings/[findingId]:', error);

        // Emit tasklog on error only (per the task requirements)
        try {
            const taskId = crypto.randomUUID();
            const now = new Date().toISOString();
            await esClient.index({
                index: INDEX_TASKLOGS,
                id: taskId,
                document: {
                    runId: runId || 'unknown',
                    seq: Date.now(),
                    stage: 'UI_HYDRATE',
                    taskType: 'SYSTEM',
                    taskKey: 'drawer.hydrate_error',
                    taskId: taskId,
                    status: 'FAILED',
                    startedAt: now,
                    endedAt: now,
                    durationMs: 0,
                    message: `Drawer hydrate failed for finding`,
                    error: { code: 'API_ERROR', message: error.message || 'Internal Server Error' },
                    createdAt: now
                }
            });
        } catch (logErr) {
            console.error('Failed to write error tasklog:', logErr);
        }

        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
