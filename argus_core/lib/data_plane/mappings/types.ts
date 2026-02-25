export const ARGONAUT_MAPPING_VERSION = '1.0';

export const ARGONAUT_INDEX_NAMES = [
    'argonaut_artifacts',
    'argonaut_findings',
    'argonaut_dependencies',
    'argonaut_sbom',
    'argonaut_reachability',
    'argonaut_threatintel',
    'argonaut_actions',
] as const;

export type ArgonautIndexName = typeof ARGONAUT_INDEX_NAMES[number];

export type MappingDynamic = 'strict' | false;

export interface MappingField {
    type?: 'keyword' | 'text' | 'boolean' | 'float' | 'integer' | 'date' | 'object';
    doc_values?: boolean;
    index?: boolean;
    norms?: boolean;
    dynamic?: MappingDynamic;
    enabled?: boolean;
    fields?: Record<string, MappingField>;
    properties?: Record<string, MappingField>;
}

export interface IndexContract {
    index: ArgonautIndexName;
    settings: {
        index: {
            number_of_shards: string;
            number_of_replicas: string;
        };
    };
    mappings: {
        dynamic: MappingDynamic;
        date_detection: false;
        _meta: {
            argonaut_mapping_version: string;
        };
        properties: Record<string, MappingField>;
    };
}

export interface BootstrapIndexResult {
    index: ArgonautIndexName;
    action: 'created' | 'validated' | 'failed';
    message: string;
}

export interface BootstrapReport {
    mappingVersion: string;
    results: BootstrapIndexResult[];
}

export interface IndicesClientLike {
    exists(params: { index: string }): Promise<boolean | { body?: boolean }>;
    create(params: { index: string; settings: IndexContract['settings']; mappings: IndexContract['mappings'] }): Promise<unknown>;
    getMapping(params: { index: string }): Promise<unknown>;
}

export interface ElasticsearchClientLike {
    indices: IndicesClientLike;
}
