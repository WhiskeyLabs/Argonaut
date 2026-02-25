import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { InMemoryDataPlaneClient } from '../../lib/data_plane/testing';
import type { WorkflowRunSummary } from '../../lib/agent_workflow';

const bundlePath = join(process.cwd(), 'demo-data/bundles/payment-service_build-128');

afterEach(() => {
    vi.doUnmock('../../lib/agent_tools');
    vi.resetModules();
});

describe('agent workflow orchestration', () => {
    it('runs deterministic stage order and stable summary on identical fresh runs', async () => {
        const { runAgentWorkflow } = await import('../../lib/agent_workflow');
        const options = {
            repo: 'payment-service',
            buildId: '128',
            runId: 'wf-run-1',
            bundlePath,
            topN: 5,
            dryRun: true,
            now: 1700000000000,
        };

        const firstClient = new InMemoryDataPlaneClient();
        const secondClient = new InMemoryDataPlaneClient();

        const first = await runAgentWorkflow(firstClient, options);
        const second = await runAgentWorkflow(secondClient, options);

        expect(first.status).toBe('SUCCESS');
        expect(first.stages.map((stage) => stage.name)).toEqual(['Acquire', 'Enrich', 'Score', 'Act']);
        expect(first.stages.every((stage) => stage.attempt === 1)).toBe(true);
        expect(first.stages.every((stage) => stage.status === 'SUCCESS')).toBe(true);

        const sortedTopFindings = [...first.topFindings].sort((left, right) => {
            if (left.priorityScore !== right.priorityScore) {
                return right.priorityScore - left.priorityScore;
            }

            return left.findingId.localeCompare(right.findingId);
        });
        expect(first.topFindings).toEqual(sortedTopFindings);
        expect(first.actions.length).toBeGreaterThan(0);

        expect(stabilizeSummary(first)).toEqual(stabilizeSummary(second));
    });

    it('returns deterministic score-stage failure when topN is zero', async () => {
        const { runAgentWorkflow } = await import('../../lib/agent_workflow');
        const client = new InMemoryDataPlaneClient();

        const summary = await runAgentWorkflow(client, {
            repo: 'payment-service',
            buildId: '128',
            runId: 'wf-run-2',
            bundlePath,
            topN: 0,
            dryRun: true,
            now: 1700000000000,
        });

        expect(summary.status).toBe('FAILED');
        expect(summary.stages.map((stage) => [stage.name, stage.status])).toEqual([
            ['Acquire', 'SUCCESS'],
            ['Enrich', 'SUCCESS'],
            ['Score', 'FAILED'],
            ['Act', 'SKIPPED'],
        ]);

        const scoreStage = summary.stages.find((stage) => stage.name === 'Score');
        const actStage = summary.stages.find((stage) => stage.name === 'Act');
        expect(scoreStage?.errorCode).toBe('E_SCORE_EMPTY_RANKING');
        expect(actStage?.attempt).toBe(0);
    });

    it('returns deterministic act-stage failure when dryRun is disabled', async () => {
        const { runAgentWorkflow } = await import('../../lib/agent_workflow');
        const client = new InMemoryDataPlaneClient();

        const summary = await runAgentWorkflow(client, {
            repo: 'payment-service',
            buildId: '128',
            runId: 'wf-run-3',
            bundlePath,
            topN: 3,
            dryRun: false,
            now: 1700000000000,
        });

        expect(summary.status).toBe('FAILED');
        expect(summary.stages.map((stage) => [stage.name, stage.status])).toEqual([
            ['Acquire', 'SUCCESS'],
            ['Enrich', 'SUCCESS'],
            ['Score', 'SUCCESS'],
            ['Act', 'FAILED'],
        ]);

        const actStage = summary.stages.find((stage) => stage.name === 'Act');
        expect(actStage?.errorCode).toBe('E_ACTION_WRITE_BLOCKED');
    });

    it('fails early with E_TOOL_SCHEMA_INVALID when schema validation fails', async () => {
        vi.doMock('../../lib/agent_tools', () => ({
            validateToolSchemas: () => ['acquire: deterministicSortKeys must be declared.'],
        }));

        const { runAgentWorkflow } = await import('../../lib/agent_workflow');
        const client = new InMemoryDataPlaneClient();

        const summary = await runAgentWorkflow(client, {
            repo: 'payment-service',
            buildId: '128',
            runId: 'wf-run-4',
            bundlePath,
            topN: 5,
            dryRun: true,
            now: 1700000000000,
        });

        expect(summary.status).toBe('FAILED');
        expect(summary.stages.map((stage) => [stage.name, stage.status])).toEqual([
            ['Acquire', 'FAILED'],
            ['Enrich', 'SKIPPED'],
            ['Score', 'SKIPPED'],
            ['Act', 'SKIPPED'],
        ]);

        const acquireStage = summary.stages.find((stage) => stage.name === 'Acquire');
        expect(acquireStage?.errorCode).toBe('E_TOOL_SCHEMA_INVALID');
    });

    it('preserves finding score and explanation IDs across deterministic reruns', async () => {
        const { runAgentWorkflow } = await import('../../lib/agent_workflow');
        const client = new InMemoryDataPlaneClient();

        const options = {
            repo: 'payment-service',
            buildId: '128',
            runId: 'wf-run-5',
            bundlePath,
            topN: 5,
            dryRun: true,
            now: 1700000000000,
        };

        const first = await runAgentWorkflow(client, options);
        expect(first.status).toBe('SUCCESS');
        const baseline = captureFindingScoreState(client, options.repo, options.buildId);

        const second = await runAgentWorkflow(client, options);
        expect(second.status).toBe('SUCCESS');
        const rerun = captureFindingScoreState(client, options.repo, options.buildId);

        expect(rerun).toEqual(baseline);
    });
});

function stabilizeSummary(summary: WorkflowRunSummary) {
    return {
        runId: summary.runId,
        repo: summary.repo,
        buildId: summary.buildId,
        status: summary.status,
        stages: summary.stages.map((stage) => ({
            name: stage.name,
            attempt: stage.attempt,
            status: stage.status,
            errorCode: stage.errorCode,
            message: stage.message,
            counts: stage.counts,
            keyIds: stage.keyIds,
            toolCalls: stage.toolCalls,
        })),
        topFindings: summary.topFindings,
        actions: summary.actions,
    };
}

function captureFindingScoreState(client: InMemoryDataPlaneClient, repo: string, buildId: string): Record<string, { priorityScore: number; explanationId: string | null }> {
    const rows = client.list('argonaut_findings')
        .map((entry) => entry.source)
        .filter((source) => source.repo === repo && source.buildId === buildId)
        .map((source) => {
            const findingId = typeof source.findingId === 'string' ? source.findingId : null;
            const priorityScore = typeof source.priorityScore === 'number' ? source.priorityScore : null;
            const explanation = typeof source.priorityExplanation === 'object' && source.priorityExplanation !== null
                ? source.priorityExplanation as Record<string, unknown>
                : null;
            const explanationId = explanation && typeof explanation.explanationId === 'string'
                ? explanation.explanationId
                : null;

            if (!findingId || priorityScore === null) {
                return null;
            }

            return {
                findingId,
                priorityScore,
                explanationId,
            };
        })
        .filter((row): row is { findingId: string; priorityScore: number; explanationId: string | null } => row !== null)
        .sort((left, right) => left.findingId.localeCompare(right.findingId));

    return Object.fromEntries(rows.map((row) => [row.findingId, { priorityScore: row.priorityScore, explanationId: row.explanationId }]));
}
