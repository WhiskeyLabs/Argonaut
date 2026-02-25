import { generateJiraDryRunActions, generateSlackDryRunActions } from '../../lib/actions';
import type { JiraFindingInput, SlackFindingInput } from '../../lib/actions';
import { InMemoryDataPlaneClient } from '../../lib/data_plane/testing';

function createJiraFindings(): JiraFindingInput[] {
    return [
        {
            findingId: 'finding-b',
            repo: 'payment-service',
            buildId: '128',
            severity: 'high',
            ruleId: 'RULE-B',
            package: 'axios',
            version: '1.7.0',
            cve: 'CVE-2024-2222',
            priorityScore: 72,
        },
        {
            findingId: 'finding-a',
            repo: 'payment-service',
            buildId: '128',
            severity: 'critical',
            ruleId: 'RULE-A',
            package: 'lodash',
            version: '4.17.20',
            cve: 'CVE-2024-1111',
            priorityScore: 95,
        },
    ];
}

function createSlackFindings(): SlackFindingInput[] {
    return [
        {
            findingId: 'finding-b',
            repo: 'payment-service',
            buildId: '128',
            priorityScore: 72,
            cve: 'CVE-2024-2222',
        },
        {
            findingId: 'finding-a',
            repo: 'payment-service',
            buildId: '128',
            priorityScore: 95,
            cve: 'CVE-2024-1111',
        },
    ];
}

describe('action idempotency and retry behavior', () => {
    it('creates new Jira action IDs when templateVersion changes', async () => {
        const client = new InMemoryDataPlaneClient();
        const findings = createJiraFindings();

        const first = await generateJiraDryRunActions(client, findings, {
            repo: 'payment-service',
            buildId: '128',
            runId: 'run-idk-jira',
            templateVersion: '1.0',
            dryRun: true,
            attempt: 1,
            now: 1700000000000,
        });

        const second = await generateJiraDryRunActions(client, findings, {
            repo: 'payment-service',
            buildId: '128',
            runId: 'run-idk-jira',
            templateVersion: '1.1',
            dryRun: true,
            attempt: 1,
            now: 1700000001000,
        });

        expect(first.generated.every((entry) => entry.status === 'DRY_RUN_READY')).toBe(true);
        expect(second.generated.every((entry) => entry.status === 'DRY_RUN_READY')).toBe(true);
        expect(first.generated.map((entry) => entry.actionId)).not.toEqual(second.generated.map((entry) => entry.actionId));
        expect(client.count('argonaut_actions')).toBe(4);
    });

    it('keeps Slack summary idempotency stable across equivalent input order and changes with topN changes', async () => {
        const forwardClient = new InMemoryDataPlaneClient();
        const reverseClient = new InMemoryDataPlaneClient();
        const changedTopNClient = new InMemoryDataPlaneClient();
        const findings = createSlackFindings();

        const forward = await generateSlackDryRunActions(forwardClient, findings, {
            repo: 'payment-service',
            buildId: '128',
            runId: 'run-idk-slack',
            dryRun: true,
            includeThreads: false,
            topN: 2,
            templateVersion: '1.0',
            attempt: 1,
            now: 1700000000000,
        });

        const reversed = await generateSlackDryRunActions(reverseClient, [...findings].reverse(), {
            repo: 'payment-service',
            buildId: '128',
            runId: 'run-idk-slack',
            dryRun: true,
            includeThreads: false,
            topN: 2,
            templateVersion: '1.0',
            attempt: 1,
            now: 1700000000000,
        });

        const changedTopN = await generateSlackDryRunActions(changedTopNClient, findings, {
            repo: 'payment-service',
            buildId: '128',
            runId: 'run-idk-slack',
            dryRun: true,
            includeThreads: false,
            topN: 1,
            templateVersion: '1.0',
            attempt: 1,
            now: 1700000000000,
        });

        expect(forward.generated).toHaveLength(1);
        expect(reversed.generated).toHaveLength(1);
        expect(changedTopN.generated).toHaveLength(1);

        expect(forward.generated[0].actionId).toBe(reversed.generated[0].actionId);
        expect(forward.generated[0].actionId).not.toBe(changedTopN.generated[0].actionId);
    });

    it('returns duplicate outcome and existing actionId on explicit retry attempts', async () => {
        const client = new InMemoryDataPlaneClient();
        const findings = createSlackFindings();

        const first = await generateSlackDryRunActions(client, findings, {
            repo: 'payment-service',
            buildId: '128',
            runId: 'run-idk-retry',
            dryRun: true,
            includeThreads: false,
            topN: 2,
            attempt: 1,
            now: 1700000000000,
        });

        const retry = await generateSlackDryRunActions(client, findings, {
            repo: 'payment-service',
            buildId: '128',
            runId: 'run-idk-retry',
            dryRun: true,
            includeThreads: false,
            topN: 2,
            attempt: 3,
            now: 1700000001000,
        });

        expect(first.generated[0].status).toBe('DRY_RUN_READY');
        expect(retry.generated[0].status).toBe('SKIPPED_DUPLICATE');
        expect(retry.generated[0].duplicate).toBe(true);
        expect(retry.generated[0].actionId).toBe(first.generated[0].actionId);
        expect(client.count('argonaut_actions')).toBe(1);
        expect(client.list('argonaut_actions')[0].source.attempt).toBe(1);
    });

    it('rejects invalid explicit attempt values', async () => {
        const client = new InMemoryDataPlaneClient();

        await expect(generateJiraDryRunActions(client, createJiraFindings(), {
            repo: 'payment-service',
            buildId: '128',
            dryRun: true,
            attempt: 0,
        })).rejects.toThrow('attempt must be a positive integer.');

        await expect(generateSlackDryRunActions(client, createSlackFindings(), {
            repo: 'payment-service',
            buildId: '128',
            dryRun: true,
            attempt: -2,
        })).rejects.toThrow('attempt must be a positive integer.');
    });
});
