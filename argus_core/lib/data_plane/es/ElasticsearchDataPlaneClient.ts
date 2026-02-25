import type { ElasticsearchBulkClientLike } from '../writers';
import type {
    BulkUpsertOptions,
    BulkUpsertReport,
    DeleteByRunIdReport,
    ElasticsearchDataPlaneClientOptions,
    ListDocumentResult,
    RuntimeIndexName,
} from './types';
import { RUN_ID_BEARING_INDEXES } from './types';

type UnknownRecord = Record<string, unknown>;

type RequestOptions = {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
    expectedStatuses?: number[];
    contentType?: 'application/json' | 'application/x-ndjson';
};

type BulkItem = {
    _id?: string;
    status?: number;
};

const DEFAULT_BULK_BATCH_SIZE = 500;
const DEFAULT_RETRY_ATTEMPTS = 2;
const DEFAULT_RETRY_BACKOFF_MS = 200;

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

const DEFAULT_ID_FIELDS: Record<RuntimeIndexName, string> = {
    argonaut_artifacts: 'artifactId',
    argonaut_findings: 'findingId',
    argonaut_dependencies: 'dependencyId',
    argonaut_sbom: 'componentId',
    argonaut_reachability: 'reachabilityId',
    argonaut_threatintel: 'intelId',
    argonaut_actions: 'actionId',
    argonaut_runs: 'runId',
    argonaut_tasklogs: 'taskId',
};

export class ElasticsearchDataPlaneClient implements ElasticsearchBulkClientLike {
    private readonly esUrl: string;
    private readonly authHeader: string;
    private readonly fetchImpl: typeof fetch;
    private readonly bulkBatchSize: number;
    private readonly retryAttempts: number;
    private readonly retryBackoffMs: number;
    private retryCounter = 0;

    constructor(options: ElasticsearchDataPlaneClientOptions = {}) {
        this.esUrl = normalizeBaseUrl(options.esUrl ?? process.env.ES_URL ?? process.env.ELASTIC_URL ?? 'http://localhost:9200');
        this.authHeader = resolveAuthHeader(options);
        this.fetchImpl = options.fetchImpl ?? fetch;

        this.bulkBatchSize = normalizePositiveInt(options.bulkBatchSize, DEFAULT_BULK_BATCH_SIZE);
        this.retryAttempts = normalizePositiveInt(options.retryAttempts, DEFAULT_RETRY_ATTEMPTS);
        this.retryBackoffMs = normalizePositiveInt(options.retryBackoffMs, DEFAULT_RETRY_BACKOFF_MS);
    }

    async bulk(params: {
        operations: Array<Record<string, unknown>>;
        refresh?: 'true' | 'false' | 'wait_for';
    }): Promise<unknown> {
        const ndjson = operationsToNdjson(params.operations);
        const query = params.refresh ? `?refresh=${encodeURIComponent(params.refresh)}` : '';

        return this.request(`/_bulk${query}`, {
            method: 'POST',
            contentType: 'application/x-ndjson',
            body: ndjson,
            expectedStatuses: [200],
        });
    }

    async bulkUpsert(index: RuntimeIndexName, documents: unknown[], options: BulkUpsertOptions = {}): Promise<BulkUpsertReport> {
        const idField = options.idField ?? DEFAULT_ID_FIELDS[index];
        const refresh = options.refresh ?? 'wait_for';

        const normalized = documents
            .map((document, position) => ({
                document: ensureRecord(document, `Invalid document at position ${position}.`),
                position,
            }))
            .map(({ document, position }) => {
                const id = document[idField];
                if (typeof id !== 'string' || id.trim().length === 0) {
                    throw new Error(`Missing required id field '${idField}' for ${index} at position ${position}.`);
                }

                return {
                    id: id.trim(),
                    source: document,
                };
            })
            .sort((left, right) => left.id.localeCompare(right.id));

        const chunks = chunkArray(normalized, this.bulkBatchSize);
        const upsertedIds: string[] = [];
        let failed = 0;
        let retries = 0;

        for (const chunk of chunks) {
            const operations: Array<Record<string, unknown>> = [];
            for (const entry of chunk) {
                operations.push({ index: { _index: index, _id: entry.id } });
                operations.push(entry.source);
            }

            const retriesBefore = this.retryCounter;
            const response = await this.bulk({ operations, refresh });
            retries += this.retryCounter - retriesBefore;

            const items = extractBulkItems(response);
            if (items.length !== chunk.length) {
                throw new Error(`Bulk response item count mismatch for ${index}: expected ${chunk.length}, got ${items.length}.`);
            }

            for (let i = 0; i < items.length; i += 1) {
                const item = items[i];
                const entry = chunk[i];

                if (isSuccessStatus(item.status)) {
                    upsertedIds.push(entry.id);
                    continue;
                }

                console.error('ES Bulk Error for item:', JSON.stringify(response.items[i], null, 2));
                failed += 1;
            }
        }

        return {
            attempted: normalized.length,
            succeeded: upsertedIds.length,
            failed,
            ids: upsertedIds,
            chunks: chunks.length,
            retries,
        };
    }

    async getById(index: RuntimeIndexName, id: string): Promise<Record<string, unknown> | null> {
        const response = await this.requestRaw(`/${encodeURIComponent(index)}/_doc/${encodeURIComponent(id)}`, {
            method: 'GET',
            expectedStatuses: [200, 404],
        });

        if (response.status === 404) {
            return null;
        }

        const source = toRecord(response.body?._source);
        return source ? source : null;
    }

    async count(index: RuntimeIndexName, query?: Record<string, unknown>): Promise<number> {
        const response = await this.request(`/${encodeURIComponent(index)}/_count`, {
            method: 'POST',
            body: query ? { query } : {},
            expectedStatuses: [200],
        });

        if (!isRecord(response) || typeof response.count !== 'number') {
            throw new Error(`Invalid count response for index ${index}.`);
        }

        return response.count;
    }

    async search(index: RuntimeIndexName, body: Record<string, unknown>): Promise<Record<string, unknown>> {
        const response = await this.request(`/${encodeURIComponent(index)}/_search`, {
            method: 'POST',
            body,
            expectedStatuses: [200],
        });

        return ensureRecord(response, `Invalid search response for index ${index}.`);
    }

    async list(index: RuntimeIndexName, size = 1000): Promise<ListDocumentResult[]> {
        const response = await this.search(index, {
            size,
            query: { match_all: {} },
            _source: true,
        });

        const hitsNode = toRecord(response.hits);
        const hitsArray = Array.isArray(hitsNode?.hits) ? hitsNode.hits : [];

        const rows: ListDocumentResult[] = [];
        for (const hit of hitsArray) {
            const record = toRecord(hit);
            if (!record) {
                continue;
            }

            const id = record._id;
            const source = toRecord(record._source);
            if (typeof id === 'string' && source) {
                rows.push({ id, source });
            }
        }

        return rows.sort((left, right) => left.id.localeCompare(right.id));
    }

    async deleteByRunId(runId: string, indexes: RuntimeIndexName[] = RUN_ID_BEARING_INDEXES): Promise<DeleteByRunIdReport> {
        const normalizedRunId = runId.trim();
        if (normalizedRunId.length === 0) {
            throw new Error('runId is required for deleteByRunId.');
        }

        const deletedByIndex: Record<string, number> = {};
        let totalDeleted = 0;

        const orderedIndexes = [...indexes].sort((left, right) => left.localeCompare(right));

        for (const index of orderedIndexes) {
            const response = await this.request(
                `/${encodeURIComponent(index)}/_delete_by_query?conflicts=proceed&refresh=true`,
                {
                    method: 'POST',
                    body: {
                        query: {
                            term: {
                                runId: normalizedRunId,
                            },
                        },
                    },
                    expectedStatuses: [200],
                },
            );

            const deleted = isRecord(response) && typeof response.deleted === 'number'
                ? response.deleted
                : 0;
            deletedByIndex[index] = deleted;
            totalDeleted += deleted;
        }

        return {
            runId: normalizedRunId,
            deletedByIndex,
            totalDeleted,
        };
    }

    private async request(path: string, options: RequestOptions): Promise<unknown> {
        const response = await this.requestRaw(path, options);
        return response.body;
    }

    private async requestRaw(path: string, options: RequestOptions): Promise<{ status: number; body: unknown }> {
        const expectedStatuses = options.expectedStatuses ?? [200];

        for (let attempt = 1; attempt <= this.retryAttempts; attempt += 1) {
            try {
                const response = await this.fetchImpl(`${this.esUrl}${path}`, {
                    method: options.method,
                    headers: {
                        Authorization: this.authHeader,
                        ...(resolveContentType(options) ? { 'Content-Type': resolveContentType(options) as string } : {}),
                    },
                    body: serializeRequestBody(options),
                });

                const payload = await parseResponseBody(response);

                if (expectedStatuses.includes(response.status)) {
                    return {
                        status: response.status,
                        body: payload,
                    };
                }

                if (RETRYABLE_STATUSES.has(response.status) && attempt < this.retryAttempts) {
                    this.retryCounter += 1;
                    await sleep(this.retryBackoffMs);
                    continue;
                }

                throw new NonRetryableRequestError(
                    `Request failed [${options.method} ${path}] status=${response.status} body=${JSON.stringify(payload)}`,
                );
            } catch (error) {
                if (error instanceof NonRetryableRequestError) {
                    throw error;
                }

                if (attempt >= this.retryAttempts) {
                    throw error;
                }

                this.retryCounter += 1;
                await sleep(this.retryBackoffMs);
            }
        }

        throw new Error(`Unreachable request retry loop for ${options.method} ${path}.`);
    }
}

function serializeRequestBody(options: RequestOptions): string | undefined {
    if (options.body === undefined) {
        return undefined;
    }

    if (options.contentType === 'application/x-ndjson' && typeof options.body === 'string') {
        return options.body;
    }

    return JSON.stringify(options.body);
}

function resolveContentType(options: RequestOptions): string | undefined {
    if (options.contentType) {
        return options.contentType;
    }

    if (options.body !== undefined) {
        return 'application/json';
    }

    return undefined;
}

async function parseResponseBody(response: Response): Promise<unknown> {
    const text = await response.text();
    if (text.trim().length === 0) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch (_error) {
        return { raw: text };
    }
}

function operationsToNdjson(operations: Array<Record<string, unknown>>): string {
    return operations.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
}

function extractBulkItems(response: unknown): BulkItem[] {
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
            } satisfies BulkItem;
        })
        .filter((item): item is BulkItem => item !== null);
}

function isSuccessStatus(status: number | undefined): boolean {
    return typeof status === 'number' && status >= 200 && status < 300;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];

    for (let index = 0; index < items.length; index += chunkSize) {
        chunks.push(items.slice(index, index + chunkSize));
    }

    return chunks;
}

function normalizeBaseUrl(value: string): string {
    return value.replace(/\/$/, '');
}

function normalizePositiveInt(value: number | undefined, fallback: number): number {
    if (!Number.isInteger(value) || (value as number) <= 0) {
        return fallback;
    }

    return value as number;
}

function resolveAuthHeader(options: ElasticsearchDataPlaneClientOptions): string {
    const apiKey = options.apiKey ?? process.env.ES_API_KEY ?? process.env.ELASTIC_API_KEY;
    if (apiKey && apiKey.trim().length > 0) {
        return `ApiKey ${apiKey.trim()}`;
    }

    const username = options.username ?? process.env.ES_USERNAME ?? process.env.ELASTIC_USERNAME;
    const password = options.password ?? process.env.ES_PASSWORD ?? process.env.ELASTIC_PASSWORD;
    if (username && password) {
        return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    }

    throw new Error('Elasticsearch auth is required. Set ES_API_KEY (preferred) or ES_USERNAME/ES_PASSWORD.');
}

function ensureRecord(value: unknown, message: string): UnknownRecord {
    const record = toRecord(value);
    if (!record) {
        throw new Error(message);
    }

    return record;
}

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): UnknownRecord | null {
    return isRecord(value) ? value : null;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

class NonRetryableRequestError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NonRetryableRequestError';
    }
}
