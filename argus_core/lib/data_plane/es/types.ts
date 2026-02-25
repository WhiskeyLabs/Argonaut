import type { ArgonautIndexName } from '../mappings';

export type RuntimeIndexName = ArgonautIndexName | 'argonaut_runs' | 'argonaut_tasklogs';

export const RUN_ID_BEARING_INDEXES: RuntimeIndexName[] = [
    'argonaut_actions',
    'argonaut_artifacts',
    'argonaut_dependencies',
    'argonaut_findings',
    'argonaut_reachability',
    'argonaut_runs',
    'argonaut_sbom',
    'argonaut_tasklogs',
];

export interface ElasticsearchDataPlaneClientOptions {
    esUrl?: string;
    apiKey?: string;
    username?: string;
    password?: string;
    bulkBatchSize?: number;
    retryAttempts?: number;
    retryBackoffMs?: number;
    fetchImpl?: typeof fetch;
}

export interface BulkUpsertOptions {
    idField?: string;
    refresh?: 'true' | 'false' | 'wait_for';
}

export interface BulkUpsertReport {
    attempted: number;
    succeeded: number;
    failed: number;
    ids: string[];
    chunks: number;
    retries: number;
}

export interface DeleteByRunIdReport {
    runId: string;
    deletedByIndex: Record<string, number>;
    totalDeleted: number;
}

export interface ListDocumentResult {
    id: string;
    source: Record<string, unknown>;
}
