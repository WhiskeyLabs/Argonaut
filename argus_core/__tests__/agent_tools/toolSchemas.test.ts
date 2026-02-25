import { describe, expect, it } from 'vitest';

import { getToolSchema, TOOL_SCHEMAS, validateToolSchemas } from '../../lib/agent_tools';

describe('agent tool schemas', () => {
    it('registers all required tools', () => {
        const names = TOOL_SCHEMAS.map((schema) => schema.name).sort((left, right) => left.localeCompare(right));
        expect(names).toEqual(['acquire', 'enrich', 'jira', 'score', 'search', 'slack']);
    });

    it('passes built-in schema guard validations', () => {
        const failures = validateToolSchemas();
        expect(failures).toEqual([]);
    });

    it('enforces read-only write boundaries for score and search', () => {
        const score = getToolSchema('score');
        const search = getToolSchema('search');

        expect(score.accessMode).toBe('READ_ONLY');
        expect(search.accessMode).toBe('READ_ONLY');
        expect(score.allowedWriteIndices).toEqual([]);
        expect(search.allowedWriteIndices).toEqual([]);
    });

    it('enforces action write boundaries for jira and slack', () => {
        const jira = getToolSchema('jira');
        const slack = getToolSchema('slack');

        expect(jira.accessMode).toBe('ACTION_WRITE');
        expect(slack.accessMode).toBe('ACTION_WRITE');
        expect(jira.allowedWriteIndices).toEqual(['argonaut_actions']);
        expect(slack.allowedWriteIndices).toEqual(['argonaut_actions']);
    });

    it('requires deterministic sort keys for every tool', () => {
        for (const schema of TOOL_SCHEMAS) {
            expect(Array.isArray(schema.deterministicSortKeys)).toBe(true);
            expect(schema.deterministicSortKeys.length).toBeGreaterThan(0);
        }
    });

    it('detects invalid schema write policy drift', () => {
        const failures = validateToolSchemas([
            {
                ...getToolSchema('score'),
                writePolicy: 'ACTIONS_ONLY',
            },
        ]);

        expect(failures.some((failure) => failure.includes('READ_ONLY tool must use writePolicy NONE'))).toBe(true);
    });
});
