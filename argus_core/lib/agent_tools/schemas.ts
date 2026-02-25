import type { ToolSchema } from './types';

const RESPONSE_ENVELOPE_PROPERTIES = {
    status: {
        type: 'string',
        enum: ['OK', 'ERROR'],
    },
    errors: {
        type: 'array',
        items: { type: 'string' },
    },
    meta: {
        type: 'object',
        additionalProperties: false,
        required: ['repo', 'buildId', 'runId', 'startedAt', 'finishedAt'],
        properties: {
            repo: { type: 'string' },
            buildId: { type: 'string' },
            runId: { type: 'string' },
            startedAt: { type: ['number', 'null'] },
            finishedAt: { type: ['number', 'null'] },
        },
    },
    data: {
        type: 'object',
        additionalProperties: true,
        properties: {},
    },
} as const;

export const TOOL_SCHEMAS: ToolSchema[] = [
    {
        name: 'acquire',
        accessMode: 'PIPELINE_WRITE',
        writePolicy: 'EPIC2_PIPELINE_ONLY',
        description: 'Trigger EPIC 2 Acquire pipeline for repo/build inputs.',
        allowedReadIndices: ['argonaut_artifacts'],
        allowedWriteIndices: [
            'argonaut_artifacts',
            'argonaut_dependencies',
            'argonaut_sbom',
            'argonaut_findings',
            'argonaut_reachability',
            'argonaut_threatintel',
        ],
        deterministicSortKeys: ['stage ASC'],
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['repo', 'buildId', 'bundlePath'],
            properties: {
                repo: { type: 'string' },
                buildId: { type: 'string' },
                bundlePath: { type: 'string' },
                dryRun: { type: 'boolean' },
                verbose: { type: 'boolean' },
            },
        },
        outputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['status', 'errors', 'meta', 'data'],
            properties: {
                ...RESPONSE_ENVELOPE_PROPERTIES,
                data: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['bundleId', 'runId', 'status', 'stageResults'],
                    properties: {
                        bundleId: { type: 'string' },
                        runId: { type: 'string' },
                        status: { type: 'string', enum: ['SUCCESS', 'FAILED'] },
                        stageResults: { type: 'array' },
                    },
                },
            },
        },
    },
    {
        name: 'enrich',
        accessMode: 'PIPELINE_WRITE',
        writePolicy: 'EPIC2_PIPELINE_ONLY',
        description: 'Trigger EPIC 2 Enrich merge-context pipeline.',
        allowedReadIndices: ['argonaut_findings', 'argonaut_reachability', 'argonaut_threatintel'],
        allowedWriteIndices: ['argonaut_findings'],
        deterministicSortKeys: ['findingId ASC'],
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['repo', 'buildId'],
            properties: {
                repo: { type: 'string' },
                buildId: { type: 'string' },
                runId: { type: 'string' },
            },
        },
        outputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['status', 'errors', 'meta', 'data'],
            properties: {
                ...RESPONSE_ENVELOPE_PROPERTIES,
                data: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['processed', 'warnings', 'integrity'],
                    properties: {
                        processed: { type: 'number' },
                        warnings: { type: 'array' },
                        integrity: { type: 'object' },
                    },
                },
            },
        },
    },
    {
        name: 'score',
        accessMode: 'READ_ONLY',
        writePolicy: 'NONE',
        description: 'Return ranked findings from indexed EPIC 2 score outputs.',
        allowedReadIndices: ['argonaut_findings', 'argonaut_reachability', 'argonaut_threatintel'],
        allowedWriteIndices: [],
        deterministicSortKeys: ['priorityScore DESC', 'findingId ASC'],
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['repo', 'buildId'],
            properties: {
                repo: { type: 'string' },
                buildId: { type: 'string' },
                topN: { type: 'number' },
            },
        },
        outputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['status', 'errors', 'meta', 'data'],
            properties: {
                ...RESPONSE_ENVELOPE_PROPERTIES,
                data: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['topN', 'sorting'],
                    properties: {
                        topN: { type: 'array' },
                        sorting: { type: 'array' },
                    },
                },
            },
        },
    },
    {
        name: 'jira',
        accessMode: 'ACTION_WRITE',
        writePolicy: 'ACTIONS_ONLY',
        description: 'Generate deterministic Jira dry-run action payloads and audit records.',
        allowedReadIndices: ['argonaut_findings', 'argonaut_actions'],
        allowedWriteIndices: ['argonaut_actions'],
        deterministicSortKeys: ['createdAt ASC', 'actionId ASC'],
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['repo', 'buildId', 'findingIds', 'dryRun'],
            properties: {
                repo: { type: 'string' },
                buildId: { type: 'string' },
                findingIds: { type: 'array' },
                dryRun: { type: 'boolean' },
                templateVersion: { type: 'string' },
            },
        },
        outputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['status', 'errors', 'meta', 'data'],
            properties: {
                ...RESPONSE_ENVELOPE_PROPERTIES,
                data: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['actions', 'sorting'],
                    properties: {
                        actions: { type: 'array' },
                        sorting: { type: 'array' },
                    },
                },
            },
        },
    },
    {
        name: 'slack',
        accessMode: 'ACTION_WRITE',
        writePolicy: 'ACTIONS_ONLY',
        description: 'Generate deterministic Slack dry-run payloads and audit records.',
        allowedReadIndices: ['argonaut_findings', 'argonaut_actions'],
        allowedWriteIndices: ['argonaut_actions'],
        deterministicSortKeys: ['createdAt ASC', 'actionId ASC'],
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['repo', 'buildId', 'dryRun'],
            properties: {
                repo: { type: 'string' },
                buildId: { type: 'string' },
                findingIds: { type: 'array' },
                dryRun: { type: 'boolean' },
                templateVersion: { type: 'string' },
            },
        },
        outputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['status', 'errors', 'meta', 'data'],
            properties: {
                ...RESPONSE_ENVELOPE_PROPERTIES,
                data: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['actions', 'sorting'],
                    properties: {
                        actions: { type: 'array' },
                        sorting: { type: 'array' },
                    },
                },
            },
        },
    },
    {
        name: 'search',
        accessMode: 'READ_ONLY',
        writePolicy: 'NONE',
        description: 'Read-only search over frozen findings and knowledge indices.',
        allowedReadIndices: ['argonaut_findings', 'argonaut_artifacts', 'argonaut_threatintel', 'argonaut_reachability'],
        allowedWriteIndices: [],
        deterministicSortKeys: ['findingId ASC'],
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['repo', 'buildId', 'query'],
            properties: {
                repo: { type: 'string' },
                buildId: { type: 'string' },
                query: { type: 'string' },
                topN: { type: 'number' },
            },
        },
        outputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['status', 'errors', 'meta', 'data'],
            properties: {
                ...RESPONSE_ENVELOPE_PROPERTIES,
                data: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['findings', 'sorting'],
                    properties: {
                        findings: { type: 'array' },
                        sorting: { type: 'array' },
                    },
                },
            },
        },
    },
];

export function validateToolSchemas(schemas = TOOL_SCHEMAS): string[] {
    const failures: string[] = [];

    if (schemas.length !== 6) {
        failures.push(`Expected 6 tool schemas, found ${schemas.length}.`);
    }

    for (const schema of schemas) {
        if (!Array.isArray(schema.deterministicSortKeys) || schema.deterministicSortKeys.length === 0) {
            failures.push(`${schema.name}: deterministicSortKeys must be declared.`);
        }

        if (schema.accessMode === 'READ_ONLY') {
            if (schema.writePolicy !== 'NONE') {
                failures.push(`${schema.name}: READ_ONLY tool must use writePolicy NONE.`);
            }

            if (schema.allowedWriteIndices.length > 0) {
                failures.push(`${schema.name}: READ_ONLY tool must not declare writable indices.`);
            }
        }

        if (schema.accessMode === 'ACTION_WRITE') {
            if (schema.writePolicy !== 'ACTIONS_ONLY') {
                failures.push(`${schema.name}: ACTION_WRITE tool must use ACTIONS_ONLY writePolicy.`);
            }

            if (!schema.allowedWriteIndices.every((index) => index === 'argonaut_actions')) {
                failures.push(`${schema.name}: ACTION_WRITE tool can only write to argonaut_actions.`);
            }
        }

        if (schema.accessMode === 'PIPELINE_WRITE' && schema.writePolicy !== 'EPIC2_PIPELINE_ONLY') {
            failures.push(`${schema.name}: PIPELINE_WRITE tool must use EPIC2_PIPELINE_ONLY writePolicy.`);
        }

        if (!schema.outputSchema.required?.includes('status') || !schema.outputSchema.required?.includes('meta') || !schema.outputSchema.required?.includes('data')) {
            failures.push(`${schema.name}: output schema must include status/meta/data envelope.`);
        }
    }

    return failures.sort((left, right) => left.localeCompare(right));
}

export function getToolSchema(name: ToolSchema['name']): ToolSchema {
    const found = TOOL_SCHEMAS.find((schema) => schema.name === name);
    if (!found) {
        throw new Error(`Tool schema not found: ${name}`);
    }

    return found;
}
