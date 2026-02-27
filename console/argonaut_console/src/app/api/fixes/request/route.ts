/**
 * POST /api/fixes/request
 *
 * Creates a FIX_REQUEST action in argonaut_actions.
 * Called by Agent Builder AI Agent tool or Console UI.
 */

import { NextRequest, NextResponse } from 'next/server';
import esClient from '@/lib/esClient';
import { validateAgentKey } from '@/lib/fixAgent/fixAgentAuth';
import {
    FixRequestAction,
    FixRequestInput,
    FIX_ENGINE_VERSION,
    FIX_REQUEST_DEFAULT_TOP_N,
    FIX_REQUEST_MAX_TOP_N,
} from '@/lib/fixAgent/fixAgentTypes';
import crypto from 'crypto';

const INDEX_ACTIONS = 'argonaut_actions';
const INDEX_FINDINGS = 'argonaut_findings';

function canonicalStringify(obj: unknown): string {
    return JSON.stringify(obj, Object.keys(obj as Record<string, unknown>).sort());
}

export async function POST(req: NextRequest) {
    // Auth check
    const authError = validateAgentKey(req);
    if (authError) return authError;

    try {
        const body: FixRequestInput = await req.json();
        const { runId, mode, source, agentId, conversationId } = body;

        if (!runId) {
            return NextResponse.json({ error: 'runId is required' }, { status: 400 });
        }

        // Resolve findingIds
        let findingIds: string[];

        if (mode === 'single' && body.findingId) {
            findingIds = [body.findingId];
        } else if (body.findingIds && body.findingIds.length > 0) {
            findingIds = body.findingIds;
        } else {
            // topN mode — server selects using locked sort + filters
            const topN = Math.min(body.topN || FIX_REQUEST_DEFAULT_TOP_N, FIX_REQUEST_MAX_TOP_N);
            const filters = body.filters || {};

            const must: any[] = [
                { term: { runId } },
            ];
            if (filters.kevOnly) {
                must.push({ term: { 'context.threat.kevFlag': true } });
            }
            if (filters.reachableOnly) {
                must.push({ term: { 'context.reachability.reachable': true } });
            }
            if (filters.minEpss !== undefined) {
                must.push({ range: { 'context.threat.epssScore': { gte: filters.minEpss } } });
            }

            const searchRes = await esClient.search({
                index: INDEX_FINDINGS,
                size: topN,
                _source: ['findingId'],
                query: { bool: { must } },
                sort: [
                    { priorityScore: { order: 'desc' } },
                    { findingId: { order: 'asc' } },
                ],
            });

            findingIds = (searchRes.hits.hits || []).map((h: any) => h._id as string);

            if (findingIds.length === 0) {
                return NextResponse.json(
                    { error: 'No findings matched the specified filters' },
                    { status: 404 }
                );
            }
        }

        // Compute idempotency
        const hashInput = canonicalStringify({
            findingIdsResolved: [...findingIds].sort(),
            filters: body.filters || {},
            fixEngineVersion: FIX_ENGINE_VERSION,
            mode: mode || 'topN',
            runId,
            topN: body.topN || FIX_REQUEST_DEFAULT_TOP_N,
        });
        const requestHash = crypto.createHash('sha256').update(hashInput).digest('hex');
        const idempotencyKey = `FIX_REQUEST:${runId}:${requestHash}`;

        // Check for existing request
        const existing = await esClient.get({
            index: INDEX_ACTIONS,
            id: idempotencyKey,
        }).catch(() => null);

        if (existing && existing.found) {
            return NextResponse.json({
                actionId: idempotencyKey,
                status: (existing._source as any)?.status || 'EXISTS',
                duplicate: true,
                findingIds,
            });
        }

        // Write FIX_REQUEST
        const now = new Date().toISOString();
        const action: FixRequestAction = {
            actionType: 'FIX_REQUEST',
            runId,
            findingIds,
            status: 'NEW',
            idempotencyKey,
            payloadHash: requestHash,
            source: source || 'console',
            templateVersion: agentId || '',
            targetKey: conversationId || '',
            createdAt: now,
            updatedAt: now,
        };

        await esClient.index({
            index: INDEX_ACTIONS,
            id: idempotencyKey,
            document: action,
            refresh: 'wait_for',
        });

        console.log(`[FIX_REQUEST] Created ${idempotencyKey} with ${findingIds.length} findings`);

        return NextResponse.json({
            actionId: idempotencyKey,
            status: 'NEW',
            duplicate: false,
            findingIds,
            requestHash,
        });

    } catch (error: any) {
        console.error('[FIX_REQUEST] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
