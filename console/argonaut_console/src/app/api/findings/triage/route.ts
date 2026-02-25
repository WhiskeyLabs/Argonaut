import { NextResponse } from 'next/server';
import esClient from '@/lib/esClient';
import crypto from 'crypto';

const INDEX_FINDINGS = 'argonaut_findings';
const INDEX_ACTIONS = 'argonaut_actions';
const INDEX_TASKLOGS = 'argonaut_tasklogs';

export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { runId, updates, idempotencyKey } = body;

        if (!runId || !Array.isArray(updates) || updates.length === 0) {
            return NextResponse.json({ error: 'Missing runId or empty updates array' }, { status: 400 });
        }

        const now = new Date().toISOString();
        const iKey = idempotencyKey || crypto.randomUUID();

        const bulkOps: any[] = [];
        const actionDocs: any[] = [];
        const successIds: string[] = [];

        // In a real scenario we'd query the 'before' state to populate the audit log properly
        // For efficiency, we will fetch the current state of these findings first.
        const findingIds: string[] = updates.map((u: any) => String(u.findingId));

        const mgetResponse = await esClient.mget({
            index: INDEX_FINDINGS,
            body: {
                ids: findingIds
            } as any
        });

        const currentDocs = new Map();
        mgetResponse.docs.forEach((doc: any) => {
            if (doc.found) {
                // strict cross-run boundary check
                if (doc._source.runId === runId) {
                    currentDocs.set(doc._id, doc._source);
                }
            }
        });

        for (const update of updates) {
            const { findingId, triage } = update;

            // Validate scope
            const current = currentDocs.get(findingId);
            if (!current) {
                continue; // Skip if not found or cross-run violation
            }

            const newTriage = {
                status: triage.status,
                note: triage.note?.substring(0, 500) || null,
                updatedAt: now
            };

            // 1. Bulk op to update finding (Last Write Wins)
            bulkOps.push({ update: { _index: INDEX_FINDINGS, _id: findingId } });
            bulkOps.push({ doc: { triage: newTriage } });

            // 2. Audit action 
            // Note: In Elasticsearch, creating a document with the same ID overwrites. 
            // Using a composite ID helps idempotency retries avoid duplicating logs.
            const actionId = `triage-${iKey}-${findingId}`;

            const actionDoc = {
                actionId,
                actionType: 'TRIAGE_UPDATE',
                runId,
                findingId,
                findingIds: [findingId],
                source: 'system',
                createdAt: now,
                updatedAt: now,
                idempotencyKey: iKey,
                payload: {
                    before: current.triage || { status: 'Open', note: null },
                    after: newTriage
                }
            };

            bulkOps.push({ index: { _index: INDEX_ACTIONS, _id: actionId } });
            bulkOps.push(actionDoc);

            successIds.push(findingId);
            actionDocs.push(actionId);
        }

        if (bulkOps.length === 0) {
            return NextResponse.json({ error: 'No valid findings found for the given runId' }, { status: 400 });
        }

        const taskId = crypto.randomUUID();
        const taskLogDoc = {
            runId: runId,
            seq: Date.now(),
            stage: 'ACTIONS',
            taskType: 'SYSTEM',
            taskKey: 'triage.bulk_update',
            taskId: taskId,
            status: 'SUCCEEDED',
            startedAt: now,
            endedAt: now,
            durationMs: 0,
            message: `Triage bulk update applied to ${successIds.length} finding(s)`,
            refs: { findingIds: successIds, idempotencyKey: iKey },
            error: { code: 'NONE', message: 'none' },
            createdAt: now
        };

        bulkOps.push({ index: { _index: INDEX_TASKLOGS, _id: taskId } });
        bulkOps.push(taskLogDoc);

        const bulkResponse: any = await esClient.bulk({ refresh: true, body: bulkOps });

        if (bulkResponse.errors) {
            const erroredDocuments: any[] = [];
            bulkResponse.items.forEach((action: any) => {
                const operation = Object.keys(action)[0];
                if (action[operation].error) {
                    erroredDocuments.push({
                        status: action[operation].status,
                        error: action[operation].error
                    });
                }
            });
            console.error('Bulk errors:', erroredDocuments);
            return NextResponse.json({ error: 'Partial bulk errors occurred', details: erroredDocuments }, { status: 500 });
        }

        return NextResponse.json({
            updated: successIds,
            failed: [],
            auditActionIds: actionDocs
        });

    } catch (error: any) {
        console.error('Error in bulk triage patch:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
