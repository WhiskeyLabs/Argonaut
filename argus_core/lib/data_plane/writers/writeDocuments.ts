import type { ArgonautIndexName } from '../mappings';
import type { ElasticsearchBulkClientLike, IdResolver, WriterFailure, WriterReport } from './types';

type BulkItemResult = {
    _id?: string;
    status?: number;
    error?: { type?: string; reason?: string };
};

export async function writeDocuments(
    client: ElasticsearchBulkClientLike,
    index: ArgonautIndexName,
    documents: unknown[],
    idResolver: IdResolver,
): Promise<WriterReport> {
    if (!Array.isArray(documents)) {
        return {
            index,
            attempted: 0,
            succeeded: 0,
            failed: 1,
            upsertedIds: [],
            failures: [
                {
                    code: 'INVALID_INPUT',
                    index,
                    documentId: null,
                    position: -1,
                    message: 'documents must be an array.',
                },
            ],
        };
    }

    const failures: WriterFailure[] = [];
    const operations: Array<Record<string, unknown>> = [];
    const operationMeta: Array<{ id: string; position: number }> = [];

    for (let position = 0; position < documents.length; position += 1) {
        const document = documents[position];
        const resolved = idResolver(document, position);

        if (typeof resolved !== 'string') {
            failures.push(resolved);
            continue;
        }

        operations.push({ index: { _index: index, _id: resolved } });
        operations.push(document as Record<string, unknown>);
        operationMeta.push({ id: resolved, position });
    }

    const upsertedIds: string[] = [];

    if (operations.length > 0) {
        try {
            const response = await client.bulk({ operations, refresh: 'wait_for' });
            const items = extractBulkItems(response);

            for (let itemPosition = 0; itemPosition < operationMeta.length; itemPosition += 1) {
                const meta = operationMeta[itemPosition];
                const result = items[itemPosition];

                if (!result) {
                    failures.push({
                        code: 'BULK_ITEM_FAILED',
                        index,
                        documentId: meta.id,
                        position: meta.position,
                        message: 'Bulk response missing item result.',
                    });
                    continue;
                }

                if (isSuccessStatus(result.status)) {
                    upsertedIds.push(meta.id);
                    continue;
                }

                failures.push({
                    code: 'BULK_ITEM_FAILED',
                    index,
                    documentId: meta.id,
                    position: meta.position,
                    message: buildBulkErrorMessage(result),
                });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown bulk client error';
            for (const meta of operationMeta) {
                failures.push({
                    code: 'CLIENT_ERROR',
                    index,
                    documentId: meta.id,
                    position: meta.position,
                    message,
                });
            }
        }
    }

    return {
        index,
        attempted: documents.length,
        succeeded: upsertedIds.length,
        failed: failures.length,
        upsertedIds,
        failures,
    };
}

function extractBulkItems(response: unknown): BulkItemResult[] {
    if (!isRecord(response) || !Array.isArray(response.items)) {
        return [];
    }

    return response.items
        .map((item) => {
            if (!isRecord(item)) {
                return null;
            }

            const operation = Object.values(item)[0];
            if (!isRecord(operation)) {
                return null;
            }

            return {
                _id: typeof operation._id === 'string' ? operation._id : undefined,
                status: typeof operation.status === 'number' ? operation.status : undefined,
                error: isRecord(operation.error)
                    ? {
                        type: typeof operation.error.type === 'string' ? operation.error.type : undefined,
                        reason: typeof operation.error.reason === 'string' ? operation.error.reason : undefined,
                    }
                    : undefined,
            } satisfies BulkItemResult;
        })
        .filter((value): value is BulkItemResult => value !== null);
}

function isSuccessStatus(status: number | undefined): boolean {
    return typeof status === 'number' && status >= 200 && status < 300;
}

function buildBulkErrorMessage(result: BulkItemResult): string {
    const status = result.status ?? 'unknown';
    const errorType = result.error?.type;
    const errorReason = result.error?.reason;

    if (errorType && errorReason) {
        return `Bulk item failed with status ${status}: ${errorType}: ${errorReason}`;
    }

    if (errorReason) {
        return `Bulk item failed with status ${status}: ${errorReason}`;
    }

    return `Bulk item failed with status ${status}.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
