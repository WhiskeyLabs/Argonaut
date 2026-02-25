import { describe, expect, test, vi } from 'vitest';
import { ElasticsearchDataPlaneClient, RUN_ID_BEARING_INDEXES } from '../../lib/data_plane/es';

type FetchCall = {
    input: string;
    init: RequestInit | undefined;
};

function buildBulkSuccessResponse(itemsCount: number): Response {
    const items = Array.from({ length: itemsCount }, (_, index) => ({
        index: {
            _id: `doc-${index}`,
            status: 201,
            result: 'created',
        },
    }));

    return new Response(
        JSON.stringify({
            errors: false,
            items,
        }),
        { status: 200 },
    );
}

function extractBulkIdsFromCall(call: FetchCall): string[] {
    const payload = String(call.init?.body ?? '');
    const lines = payload.trim().split('\n');

    const ids: string[] = [];
    for (let cursor = 0; cursor < lines.length; cursor += 2) {
        const action = JSON.parse(lines[cursor]);
        const meta = action.index;
        ids.push(meta._id);
    }

    return ids;
}

describe('ElasticsearchDataPlaneClient', () => {
    test('bulkUpsert applies deterministic pre-sort and fixed 500-doc chunking', async () => {
        const fetchCalls: FetchCall[] = [];

        const fetchMock: typeof fetch = vi.fn(async (input, init) => {
            fetchCalls.push({ input: String(input), init });

            const payload = String(init?.body ?? '');
            const lineCount = payload.trim().split('\n').length;
            const itemCount = Math.floor(lineCount / 2);
            return buildBulkSuccessResponse(itemCount);
        }) as unknown as typeof fetch;

        const client = new ElasticsearchDataPlaneClient({
            esUrl: 'https://example.elastic.local:443',
            apiKey: 'test-key',
            fetchImpl: fetchMock,
            retryBackoffMs: 1,
        });

        const docs = Array.from({ length: 501 }, (_, index) => ({
            findingId: `finding-${String(500 - index).padStart(3, '0')}`,
            repo: 'payment-service',
            buildId: '128',
        }));

        const report = await client.bulkUpsert('argonaut_findings', docs);

        expect(report.attempted).toBe(501);
        expect(report.succeeded).toBe(501);
        expect(report.failed).toBe(0);
        expect(report.chunks).toBe(2);
        expect(report.retries).toBe(0);

        expect(fetchCalls).toHaveLength(2);
        const firstChunkIds = extractBulkIdsFromCall(fetchCalls[0]);
        const secondChunkIds = extractBulkIdsFromCall(fetchCalls[1]);

        expect(firstChunkIds).toHaveLength(500);
        expect(secondChunkIds).toHaveLength(1);
        expect(firstChunkIds[0]).toBe('finding-000');
        expect(firstChunkIds[499]).toBe('finding-499');
        expect(secondChunkIds[0]).toBe('finding-500');
    });

    test('bulkUpsert retries on retryable transport failure with deterministic retry count', async () => {
        const fetchMock: typeof fetch = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        error: 'service unavailable',
                    }),
                    { status: 503 },
                ),
            )
            .mockResolvedValueOnce(buildBulkSuccessResponse(1)) as unknown as typeof fetch;

        const client = new ElasticsearchDataPlaneClient({
            esUrl: 'https://example.elastic.local:443',
            apiKey: 'test-key',
            fetchImpl: fetchMock,
            retryAttempts: 2,
            retryBackoffMs: 1,
        });

        const report = await client.bulkUpsert('argonaut_findings', [
            {
                findingId: 'finding-123',
                repo: 'payment-service',
                buildId: '128',
            },
        ]);

        expect(report.succeeded).toBe(1);
        expect(report.failed).toBe(0);
        expect(report.retries).toBe(1);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    test('bulkUpsert does not retry non-retryable status failures', async () => {
        const fetchMock: typeof fetch = vi
            .fn()
            .mockResolvedValue(
                new Response(
                    JSON.stringify({
                        error: 'bad request',
                    }),
                    { status: 400 },
                ),
            ) as unknown as typeof fetch;

        const client = new ElasticsearchDataPlaneClient({
            esUrl: 'https://example.elastic.local:443',
            apiKey: 'test-key',
            fetchImpl: fetchMock,
            retryAttempts: 3,
            retryBackoffMs: 1,
        });

        await expect(() => client.bulkUpsert('argonaut_findings', [
            {
                findingId: 'finding-123',
                repo: 'payment-service',
                buildId: '128',
            },
        ])).rejects.toThrow('status=400');

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test('deleteByRunId issues deterministic delete_by_query requests across run-bearing indices', async () => {
        const calls: FetchCall[] = [];

        const fetchMock: typeof fetch = vi.fn(async (input, init) => {
            calls.push({ input: String(input), init });
            return new Response(
                JSON.stringify({
                    deleted: 2,
                }),
                { status: 200 },
            );
        }) as unknown as typeof fetch;

        const client = new ElasticsearchDataPlaneClient({
            esUrl: 'https://example.elastic.local:443',
            apiKey: 'test-key',
            fetchImpl: fetchMock,
        });

        const report = await client.deleteByRunId('run-abc');

        const sorted = [...RUN_ID_BEARING_INDEXES].sort((left, right) => left.localeCompare(right));
        expect(calls).toHaveLength(sorted.length);

        const calledIndexes = calls.map((call) => {
            const [, index] = call.input.split('example.elastic.local:443/');
            return index?.split('/_delete_by_query')[0] ?? '';
        });

        expect(calledIndexes).toEqual(sorted);
        expect(report.totalDeleted).toBe(sorted.length * 2);
        for (const index of sorted) {
            expect(report.deletedByIndex[index]).toBe(2);
        }
    });

    test('getById returns null on 404 and list returns stable _id ascending order', async () => {
        const fetchMock: typeof fetch = vi
            .fn()
            .mockResolvedValueOnce(new Response('', { status: 404 }))
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        hits: {
                            hits: [
                                { _id: 'a', _source: { value: 1 } },
                                { _id: 'b', _source: { value: 2 } },
                            ],
                        },
                    }),
                    { status: 200 },
                ),
            ) as unknown as typeof fetch;

        const client = new ElasticsearchDataPlaneClient({
            esUrl: 'https://example.elastic.local:443',
            apiKey: 'test-key',
            fetchImpl: fetchMock,
        });

        const missing = await client.getById('argonaut_findings', 'finding-missing');
        expect(missing).toBeNull();

        const rows = await client.list('argonaut_findings');
        expect(rows).toEqual([
            { id: 'a', source: { value: 1 } },
            { id: 'b', source: { value: 2 } },
        ]);

        const secondCall = (fetchMock as unknown as { mock: { calls: Array<[unknown, RequestInit | undefined]> } }).mock.calls[1];
        const body = JSON.parse(String(secondCall[1]?.body ?? '{}'));
        expect(body.query).toEqual({ match_all: {} });
    });
});
