import type { ArgonautIndexName } from '../mappings';

export interface ElasticsearchBulkClientLike {
    bulk(params: {
        operations: Array<Record<string, unknown>>;
        refresh?: 'true' | 'false' | 'wait_for';
    }): Promise<unknown>;
}

export type WriterErrorCode =
    | 'INVALID_INPUT'
    | 'MISSING_REQUIRED_ID'
    | 'MISSING_REQUIRED_FIELD'
    | 'ID_MISMATCH'
    | 'BULK_ITEM_FAILED'
    | 'CLIENT_ERROR';

export interface WriterFailure {
    code: WriterErrorCode;
    index: ArgonautIndexName;
    documentId: string | null;
    position: number;
    message: string;
}

export interface WriterReport {
    index: ArgonautIndexName;
    attempted: number;
    succeeded: number;
    failed: number;
    upsertedIds: string[];
    failures: WriterFailure[];
}

export type IdResolver = (document: unknown, position: number) => WriterFailure | string;
