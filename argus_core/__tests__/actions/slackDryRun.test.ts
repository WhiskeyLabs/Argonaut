import { generateSlackDryRunActions } from '../../lib/actions';
import { InMemoryDataPlaneClient } from '../../lib/data_plane/testing';
import type { SlackFindingInput } from '../../lib/actions';

describe('slack dry-run payload generation', () => {
    function createFindings(): SlackFindingInput[] {
        return [
            {
                findingId: 'finding-b',
                repo: 'payment-service',
                buildId: '128',
                priorityScore: 72,
                cve: 'CVE-2024-2222',
                context: {
                    threat: {
                        kevFlag: false,
                        epssScore: 0.26,
                        cve: 'CVE-2024-2222',
                    },
                    reachability: {
                        reachable: true,
                        confidenceScore: 0.62,
                        analysisVersion: '1.0',
                    },
                },
            },
            {
                findingId: 'finding-a',
                repo: 'payment-service',
                buildId: '128',
                priorityScore: 95,
                cve: 'CVE-2024-1111',
                context: {
                    threat: {
                        kevFlag: true,
                        epssScore: 0.91,
                        cve: 'CVE-2024-1111',
                    },
                    reachability: {
                        reachable: true,
                        confidenceScore: 0.95,
                        analysisVersion: '1.0',
                    },
                },
            },
        ];
    }

    it('creates deterministic summary/thread payloads and writes action records without duplicates on rerun', async () => {
        const client = new InMemoryDataPlaneClient();
        const findings = createFindings();

        const firstRun = await generateSlackDryRunActions(client, findings, {
            repo: 'payment-service',
            buildId: '128',
            runId: 'run-4',
            dryRun: true,
            attempt: 1,
            includeThreads: true,
            topN: 2,
            now: 1700000000000,
            kibanaBaseUrl: 'https://kibana.example/app/dashboards#/view/triage',
        });

        expect(firstRun.attempt).toBe(1);
        expect(firstRun.generated).toHaveLength(3);
        expect(firstRun.generated[0].actionType).toBe('SLACK_SUMMARY');
        expect(firstRun.generated[0].payload.blocks.length).toBeLessThanOrEqual(12);
        expect(firstRun.generated[1].payload.blocks.length).toBeLessThanOrEqual(6);
        expect(firstRun.generated.every((item) => item.status === 'DRY_RUN_READY')).toBe(true);
        expect(client.count('argonaut_actions')).toBe(3);

        const summaryText = firstRun.generated[0].payload.blocks[2].text?.text ?? '';
        expect(summaryText).toContain('*finding-a*');
        expect(summaryText).toContain('Score 95 | Reachable=true (conf=0.95) | KEV=true | EPSS=0.91 | CVE=CVE-2024-1111 | AV=1.0');

        const storedActions = client.list('argonaut_actions');
        const summaryDoc = storedActions.find((item) => item.source.actionType === 'SLACK_SUMMARY');
        expect(summaryDoc).toBeDefined();
        expect(summaryDoc?.source).toMatchObject({
            runId: 'run-4',
            repo: 'payment-service',
            buildId: '128',
            templateVersion: '1.0',
            targetSystem: 'slack',
            source: 'argonaut',
            attempt: 1,
            findingId: null,
        });
        expect(summaryDoc?.source.findingIds).toEqual(['finding-a', 'finding-b']);
        expect(summaryDoc?.source.actionId).toBe(summaryDoc?.source.idempotencyKey);
        expect(summaryDoc?.source.payloadHash).toMatch(/^[0-9a-f]{64}$/);

        const secondRun = await generateSlackDryRunActions(client, findings, {
            repo: 'payment-service',
            buildId: '128',
            runId: 'run-4',
            dryRun: true,
            attempt: 2,
            includeThreads: true,
            topN: 2,
            now: 1700000005000,
            kibanaBaseUrl: 'https://kibana.example/app/dashboards#/view/triage',
        });

        expect(secondRun.attempt).toBe(2);
        expect(secondRun.generated.every((item) => item.status === 'SKIPPED_DUPLICATE')).toBe(true);
        expect(secondRun.generated.every((item) => item.attempt === 2)).toBe(true);
        expect(client.count('argonaut_actions')).toBe(3);
        expect(client.list('argonaut_actions').every((item) => item.source.attempt === 1)).toBe(true);
    });

    it('renders N/A placeholders for missing rationale fields deterministically', async () => {
        const client = new InMemoryDataPlaneClient();
        const findings: SlackFindingInput[] = [
            {
                findingId: 'finding-na',
                repo: 'payment-service',
                buildId: '128',
                priorityScore: 10,
                cve: null,
                context: {
                    threat: null,
                    reachability: null,
                },
            },
        ];

        const report = await generateSlackDryRunActions(client, findings, {
            repo: 'payment-service',
            buildId: '128',
            runId: 'run-5',
            dryRun: true,
            includeThreads: false,
            topN: 1,
            now: 1700000000000,
        });

        const rationale = report.generated[0].payload.blocks[2].text?.text ?? '';
        expect(rationale).toContain('Score 10 | Reachable=N/A (conf=N/A) | KEV=N/A | EPSS=N/A | CVE=N/A | AV=N/A');
    });

    it('rejects non-dry-run mode in hackathon defaults', async () => {
        const client = new InMemoryDataPlaneClient();

        await expect(generateSlackDryRunActions(client, createFindings(), {
            repo: 'payment-service',
            buildId: '128',
            dryRun: false,
        })).rejects.toThrow('Live Slack execution is disabled for hackathon dry-run mode.');
    });
});
