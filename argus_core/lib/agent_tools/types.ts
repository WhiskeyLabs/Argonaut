import type { ArgonautIndexName } from '../data_plane/mappings';

export type ToolAccessMode = 'READ_ONLY' | 'PIPELINE_WRITE' | 'ACTION_WRITE';

export type WritePolicy = 'NONE' | 'EPIC2_PIPELINE_ONLY' | 'ACTIONS_ONLY';

export type ArgonautToolName =
    | 'acquire'
    | 'enrich'
    | 'score'
    | 'jira'
    | 'slack'
    | 'search';

export interface JsonSchema {
    type: 'object';
    additionalProperties: boolean;
    required?: string[];
    properties: Record<string, unknown>;
}

export interface ToolSchema {
    name: ArgonautToolName;
    accessMode: ToolAccessMode;
    writePolicy: WritePolicy;
    description: string;
    allowedReadIndices: ArgonautIndexName[];
    allowedWriteIndices: ArgonautIndexName[];
    deterministicSortKeys: string[];
    inputSchema: JsonSchema;
    outputSchema: JsonSchema;
}
