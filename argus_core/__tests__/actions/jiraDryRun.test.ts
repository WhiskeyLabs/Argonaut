import { generateJiraDryRunActions } from '../../lib/actions';
import { InMemoryDataPlaneClient } from '../../lib/data_plane/testing';
import type { JiraFindingInput } from '../../lib/actions';

describe('jira dry-run payload generation', () => {
    function createFindings(): JiraFindingInput[] {
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
                priorityExplanation: {
                    summary: 'Reachable with medium EPSS.',
                },
                tool: 'semgrep',
                filePath: 'src/net/client.ts',
                lineNumber: 88,
                context: {
                    threat: {
                        kevFlag: false,
                        epssScore: 0.26,
                        cve: 'CVE-2024-2222',
                    },
                    reachability: {
                        reachable: true,
                        confidenceScore: 0.62,
                        status: 'REACHABLE',
                        reason: 'PATH_FOUND',
                        evidencePath: ['__root__', 'axios'],
                        analysisVersion: '1.0',
                    },
                },
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
                priorityExplanation: {
                    summary: 'KEV and reachable.',
                },
                tool: 'snyk',
                filePath: 'src/app.ts',
                lineNumber: 42,
                context: {
                    threat: {
                        kevFlag: true,
                        epssScore: 0.91,
                        cve: 'CVE-2024-1111',
                    },
                    reachability: {
                        reachable: true,
                        confidenceScore: 0.95,
                        status: 'REACHABLE',
                        reason: 'PATH_FOUND',
                        evidencePath: ['__root__', 'lodash'],
                        analysisVersion: '1.0',
                    },
                },
            },
        ];
    }

    it('creates deterministic payloads and writes one action per finding in dry-run mode', async () => {
        const client = new InMemoryDataPlaneClient();
        const findings = createFindings();

        const firstRun = await generateJiraDryRunActions(client, findings, {
            repo: 'payment-service',
            buildId: '128',
            runId: 'run-1',
            dryRun: true,
            now: 1700000000000,
        });

        expect(firstRun.generated).toHaveLength(2);
        expect(firstRun.attempt).toBe(1);
        expect(firstRun.generated.map((item) => item.findingId)).toEqual(['finding-a', 'finding-b']);
        expect(firstRun.generated.every((item) => item.status === 'DRY_RUN_READY')).toBe(true);
        expect(client.count('argonaut_actions')).toBe(2);

        expect(firstRun.generated[0].payload.issue.summary).toBe('[CRITICAL] lodash@4.17.20 RULE-A (finding-a)');
        expect(firstRun.generated[0].payload.issue.labels).toEqual([
            'argonaut',
            'repo:payment-service',
            'build:128',
            'finding:finding-a',
            'cve:CVE-2024-1111',
            'reachable:true',
        ]);
        expect(firstRun.generated[0].payload.issue.description).toContain('Header');
        expect(firstRun.generated[0].payload.issue.description).toContain('Threat Context');
        expect(firstRun.generated[0].payload.issue.description).toContain('Suggested Next Step');

        const storedActions = client.list('argonaut_actions');
        expect(storedActions).toHaveLength(2);
        expect(storedActions[0].source).toMatchObject({
            actionType: 'JIRA_CREATE',
            runId: 'run-1',
            repo: 'payment-service',
            buildId: '128',
            templateVersion: '1.0',
            targetSystem: 'jira',
            source: 'argonaut',
            attempt: 1,
        });
        expect(storedActions[0].source.actionId).toBe(storedActions[0].source.idempotencyKey);
        expect(storedActions[0].source.payloadHash).toMatch(/^[0-9a-f]{64}$/);

        const secondRun = await generateJiraDryRunActions(client, findings, {
            repo: 'payment-service',
            buildId: '128',
            runId: 'run-1',
            dryRun: true,
            attempt: 2,
            now: 1700000005000,
        });

        expect(secondRun.attempt).toBe(2);
        expect(secondRun.generated.every((item) => item.status === 'SKIPPED_DUPLICATE')).toBe(true);
        expect(secondRun.generated.every((item) => item.attempt === 2)).toBe(true);
        expect(client.count('argonaut_actions')).toBe(2);
        expect(secondRun.generated.map((item) => item.actionId)).toEqual(firstRun.generated.map((item) => item.actionId));
        expect(secondRun.generated.map((item) => item.payloadHash)).toEqual(firstRun.generated.map((item) => item.payloadHash));
        expect(client.list('argonaut_actions').every((item) => item.source.attempt === 1)).toBe(true);
    });

    it('is insensitive to input order for same ranked result set', async () => {
        const findings = createFindings();
        const forwardClient = new InMemoryDataPlaneClient();
        const reversedClient = new InMemoryDataPlaneClient();

        const forward = await generateJiraDryRunActions(forwardClient, findings, {
            repo: 'payment-service',
            buildId: '128',
            runId: 'run-2',
            dryRun: true,
            now: 1700000000000,
        });

        const reversed = await generateJiraDryRunActions(reversedClient, [...findings].reverse(), {
            repo: 'payment-service',
            buildId: '128',
            runId: 'run-2',
            dryRun: true,
            now: 1700000000000,
        });

        expect(reversed.generated.map((item) => item.actionId)).toEqual(forward.generated.map((item) => item.actionId));
        expect(reversed.generated.map((item) => item.payloadHash)).toEqual(forward.generated.map((item) => item.payloadHash));
    });

    it('rejects non-dry-run mode in hackathon defaults', async () => {
        const client = new InMemoryDataPlaneClient();
        const findings = createFindings();

        await expect(generateJiraDryRunActions(client, findings, {
            repo: 'payment-service',
            buildId: '128',
            runId: 'run-3',
            dryRun: false,
        })).rejects.toThrow('Live Jira execution is disabled for hackathon dry-run mode.');
    });
});
