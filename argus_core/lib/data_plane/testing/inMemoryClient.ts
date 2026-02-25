import type { ArgonautIndexName } from '../mappings';
import type { ElasticsearchBulkClientLike } from '../writers';

type UnknownRecord = Record<string, unknown>;

type StoredDoc = {
    id: string;
    source: UnknownRecord;
};

type OperationMeta = {
    index: ArgonautIndexName;
    id: string;
};

export class InMemoryDataPlaneClient implements ElasticsearchBulkClientLike {
    private readonly indexStore = new Map<ArgonautIndexName, Map<string, UnknownRecord>>();

    readonly operationHistory: OperationMeta[] = [];

    failIds = new Set<string>();
    failIndexes = new Set<ArgonautIndexName>();
    throwOnBulk = false;

    async bulk(params: { operations: Array<Record<string, unknown>>; refresh?: 'true' | 'false' | 'wait_for' }): Promise<unknown> {
        if (this.throwOnBulk) {
            throw new Error('bulk unavailable');
        }

        const items: Array<{ index: { _id: string; status: number; result?: string; error?: { type: string; reason: string } } }> = [];

        for (let cursor = 0; cursor < params.operations.length; cursor += 2) {
            const action = params.operations[cursor];
            const document = params.operations[cursor + 1];

            const meta = extractActionMeta(action);
            if (!meta) {
                items.push({
                    index: {
                        _id: '__missing__',
                        status: 400,
                        error: {
                            type: 'invalid_action',
                            reason: 'bulk action metadata is invalid',
                        },
                    },
                });
                continue;
            }

            this.operationHistory.push(meta);

            if (this.failIds.has(meta.id) || this.failIndexes.has(meta.index)) {
                items.push({
                    index: {
                        _id: meta.id,
                        status: 409,
                        error: {
                            type: 'version_conflict_engine_exception',
                            reason: 'conflict',
                        },
                    },
                });
                continue;
            }

            const bucket = this.getBucket(meta.index);
            bucket.set(meta.id, structuredClone(toRecord(document) ?? {}));

            items.push({
                index: {
                    _id: meta.id,
                    status: 201,
                    result: 'created',
                },
            });
        }

        return {
            errors: items.some((item) => item.index.status >= 300),
            items,
        };
    }

    list(index: ArgonautIndexName): StoredDoc[] {
        const bucket = this.indexStore.get(index);
        if (!bucket) {
            return [];
        }

        return Array.from(bucket.entries())
            .map(([id, source]) => ({ id, source: structuredClone(source) }))
            .sort((left, right) => left.id.localeCompare(right.id));
    }

    get(index: ArgonautIndexName, id: string): UnknownRecord | null {
        const doc = this.indexStore.get(index)?.get(id);
        return doc ? structuredClone(doc) : null;
    }

    count(index: ArgonautIndexName): number {
        return this.indexStore.get(index)?.size ?? 0;
    }

    clear(): void {
        this.indexStore.clear();
        this.operationHistory.length = 0;
    }

    private getBucket(index: ArgonautIndexName): Map<string, UnknownRecord> {
        if (!this.indexStore.has(index)) {
            this.indexStore.set(index, new Map());
        }

        return this.indexStore.get(index) as Map<string, UnknownRecord>;
    }
}

function extractActionMeta(action: Record<string, unknown>): OperationMeta | null {
    const indexAction = toRecord(action.index);
    if (!indexAction) {
        return null;
    }

    const index = indexAction._index;
    const id = indexAction._id;

    if (!isArgonautIndexName(index) || typeof id !== 'string') {
        return null;
    }

    return {
        index,
        id,
    };
}

function isArgonautIndexName(value: unknown): value is ArgonautIndexName {
    return value === 'argonaut_artifacts'
        || value === 'argonaut_findings'
        || value === 'argonaut_dependencies'
        || value === 'argonaut_sbom'
        || value === 'argonaut_reachability'
        || value === 'argonaut_threatintel'
        || value === 'argonaut_actions';
}

function toRecord(value: unknown): UnknownRecord | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }

    return value as UnknownRecord;
}
