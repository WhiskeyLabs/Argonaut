import { join } from 'node:path';

import { captureState, diffCaptures, runDeterminismHarness } from '../../lib/data_plane/harness';
import { runAcquirePipeline } from '../../lib/data_plane/pipeline';
import { enrichFindingsContext } from '../../lib/data_plane/pipeline';
import { scoreAndWriteback } from '../../lib/data_plane/scoring';
import { InMemoryDataPlaneClient } from '../../lib/data_plane/testing';

describe('determinism harness', () => {
    const bundlePath = join(process.cwd(), 'demo-data/bundles/payment-service_build-128');

    it('passes on stable rerun baseline', async () => {
        const report = await runDeterminismHarness({
            repo: 'payment-service',
            buildId: '128',
            bundlePath,
            topN: 5,
        });

        expect(report.passed).toBe(true);
        expect(report.failures).toEqual([]);
    });

    it('detects ranking drift in diff logic', async () => {
        const client = new InMemoryDataPlaneClient();
        await runAcquirePipeline(client, {
            repo: 'payment-service',
            buildId: '128',
            bundlePath,
        });
        await enrichFindingsContext(client);
        await scoreAndWriteback(client, 5);

        const baseline = captureState(client, 5);

        const changed = structuredClone(baseline);
        if (changed.ranking.topN.length > 0) {
            changed.ranking.topN[0].priorityScore += 1;
        }

        const failures = diffCaptures(baseline, changed, false);
        expect(failures.some((entry) => entry.includes('Top-N ranking drift'))).toBe(true);
    });

    it('detects source hash and count drift', () => {
        const baseline = {
            indexStats: {
                argonaut_findings: { count: 1, ids: ['a'], sourceHashById: { a: 'h1' } },
                argonaut_dependencies: { count: 1, ids: ['a'], sourceHashById: { a: 'h1' } },
                argonaut_reachability: { count: 1, ids: ['a'], sourceHashById: { a: 'h1' } },
                argonaut_threatintel: { count: 1, ids: ['a'], sourceHashById: { a: 'h1' } },
                argonaut_actions: { count: 0, ids: [], sourceHashById: {} },
            },
            ranking: { topN: [] },
            versions: {
                identityContractVersion: '1.0',
                analysisVersion: '1.0',
                explanationVersion: '1.0',
            },
            cardinality: {
                reachabilityPerFindingOk: true,
                threatPerCveOk: true,
                explanationPerFindingOk: true,
            },
        };

        const rerun = structuredClone(baseline);
        rerun.indexStats.argonaut_findings.count = 2;
        rerun.indexStats.argonaut_findings.sourceHashById.a = 'h2';

        const failures = diffCaptures(baseline as never, rerun as never, false);

        expect(failures.some((entry) => entry.includes('Count drift in argonaut_findings'))).toBe(true);
        expect(failures.some((entry) => entry.includes('_source hash drift in argonaut_findings'))).toBe(true);
    });

    it('fail-fast returns first error only', () => {
        const baseline = {
            indexStats: {
                argonaut_findings: { count: 1, ids: ['a'], sourceHashById: { a: 'h1' } },
                argonaut_dependencies: { count: 1, ids: ['a'], sourceHashById: { a: 'h1' } },
                argonaut_reachability: { count: 1, ids: ['a'], sourceHashById: { a: 'h1' } },
                argonaut_threatintel: { count: 1, ids: ['a'], sourceHashById: { a: 'h1' } },
                argonaut_actions: { count: 0, ids: [], sourceHashById: {} },
            },
            ranking: { topN: [{ findingId: 'a', priorityScore: 1 }] },
            versions: {
                identityContractVersion: '1.0',
                analysisVersion: '1.0',
                explanationVersion: '1.0',
            },
            cardinality: {
                reachabilityPerFindingOk: true,
                threatPerCveOk: true,
                explanationPerFindingOk: true,
            },
        };

        const rerun = structuredClone(baseline);
        rerun.indexStats.argonaut_findings.count = 3;
        rerun.ranking.topN = [{ findingId: 'b', priorityScore: 2 }];

        const failures = diffCaptures(baseline as never, rerun as never, true);
        expect(failures).toHaveLength(1);
    });
});
