/**
 * GET /api/fixes/status
 *
 * Returns FIX_REQUEST and associated FIX_BUNDLE state.
 * Accepts: actionId (for batch tracking) or runId+findingId (row-level).
 */

import { NextRequest, NextResponse } from 'next/server';
import esClient from '@/lib/esClient';
import { validateAgentKey } from '@/lib/fixAgent/fixAgentAuth';

const INDEX_ACTIONS = 'argonaut_actions';

export async function GET(req: NextRequest) {
    const authError = validateAgentKey(req);
    if (authError) return authError;

    const { searchParams } = new URL(req.url);
    const actionId = searchParams.get('actionId');
    const runId = searchParams.get('runId');
    const findingId = searchParams.get('findingId');

    try {
        if (actionId) {
            // Direct lookup by FIX_REQUEST actionId
            const result = await esClient.get({
                index: INDEX_ACTIONS,
                id: actionId,
            }).catch(() => null);

            if (!result || !result.found) {
                return NextResponse.json({ error: 'FIX_REQUEST not found' }, { status: 404 });
            }

            const request = result._source as any;

            // Also fetch any FIX_BUNDLE actions for these findings
            const bundleRes = await esClient.search({
                index: INDEX_ACTIONS,
                size: 50,
                query: {
                    bool: {
                        must: [
                            { term: { actionType: 'FIX_BUNDLE' } },
                            { term: { runId: request.runId } },
                            { terms: { findingId: request.findingIds || [] } },
                        ],
                    },
                },
            });

            return NextResponse.json({
                request: { id: actionId, ...request },
                bundles: (bundleRes.hits.hits || []).map((h: any) => ({
                    id: h._id,
                    ...h._source,
                })),
            });

        } else if (runId && findingId) {
            // Row-level: find FIX_BUNDLE for specific finding
            const bundleRes = await esClient.search({
                index: INDEX_ACTIONS,
                size: 1,
                query: {
                    bool: {
                        must: [
                            { term: { actionType: 'FIX_BUNDLE' } },
                            { term: { runId } },
                            { term: { findingId } },
                        ],
                    },
                },
                sort: [{ createdAt: { order: 'desc' } }],
            });

            const bundle = bundleRes.hits.hits?.[0];

            // Also find the parent FIX_REQUEST containing this findingId
            const requestRes = await esClient.search({
                index: INDEX_ACTIONS,
                size: 1,
                query: {
                    bool: {
                        must: [
                            { term: { actionType: 'FIX_REQUEST' } },
                            { term: { runId } },
                            { terms: { findingIds: [findingId] } },
                        ],
                    },
                },
                sort: [{ createdAt: { order: 'desc' } }],
            });

            return NextResponse.json({
                request: requestRes.hits.hits?.[0]
                    ? { id: requestRes.hits.hits[0]._id, ...(requestRes.hits.hits[0]._source as any) }
                    : null,
                bundle: bundle
                    ? { id: bundle._id, ...(bundle._source as any) }
                    : null,
            });

        } else {
            return NextResponse.json(
                { error: 'Provide actionId or runId+findingId' },
                { status: 400 }
            );
        }
    } catch (error: any) {
        console.error('[FIX_STATUS] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
