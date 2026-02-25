import { join } from 'node:path';

import { runAcquirePipeline } from '../../lib/data_plane/pipeline';
import { InMemoryDataPlaneClient } from '../../lib/data_plane/testing';

describe('acquire pipeline', () => {
    const bundlePath = join(process.cwd(), 'demo-data/bundles/payment-service_build-128');

    it('runs stages in deterministic order and writes expected indices', async () => {
        const client = new InMemoryDataPlaneClient();

        const summary = await runAcquirePipeline(client, {
            repo: 'payment-service',
            buildId: '128',
            bundlePath,
        });

        expect(summary.status).toBe('SUCCESS');
        expect(summary.stageResults.map((stage) => stage.stage)).toEqual([
            'artifacts',
            'dependencies',
            'sbom',
            'findings',
            'reachability',
            'threatIntel',
            'actions',
        ]);

        expect(client.count('argonaut_artifacts')).toBeGreaterThan(0);
        expect(client.count('argonaut_dependencies')).toBeGreaterThan(0);
        expect(client.count('argonaut_findings')).toBeGreaterThan(0);
        expect(client.count('argonaut_reachability')).toBeGreaterThan(0);
        expect(client.count('argonaut_threatintel')).toBeGreaterThan(0);
    });

    it('marks run failed and skips downstream stages when dependency writes fail', async () => {
        const client = new InMemoryDataPlaneClient();
        client.failIndexes.add('argonaut_dependencies');

        const summary = await runAcquirePipeline(client, {
            repo: 'payment-service',
            buildId: '128',
            bundlePath,
        });

        expect(summary.status).toBe('FAILED');

        const dependenciesStage = summary.stageResults.find((stage) => stage.stage === 'dependencies');
        expect(dependenciesStage?.status).toBe('FAILED');

        const findingsStage = summary.stageResults.find((stage) => stage.stage === 'findings');
        expect(findingsStage?.status).toBe('SKIPPED');
    });

    it('supports deterministic dry-run output without writes', async () => {
        const client = new InMemoryDataPlaneClient();

        const summaryOne = await runAcquirePipeline(client, {
            repo: 'payment-service',
            buildId: '128',
            bundlePath,
            dryRun: true,
        });

        const summaryTwo = await runAcquirePipeline(client, {
            repo: 'payment-service',
            buildId: '128',
            bundlePath,
            dryRun: true,
        });

        expect(summaryOne.status).toBe('SUCCESS');
        expect(summaryTwo.status).toBe('SUCCESS');
        expect(summaryOne.bundleId).toBe(summaryTwo.bundleId);
        expect(summaryOne.stageResults).toEqual(summaryTwo.stageResults);

        expect(client.count('argonaut_artifacts')).toBe(0);
        expect(client.count('argonaut_findings')).toBe(0);
    });
});
