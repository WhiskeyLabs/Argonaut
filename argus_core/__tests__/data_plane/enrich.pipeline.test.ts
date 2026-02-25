import { generateDependencyId, generateFindingId } from '../../lib/identity';
import { writeDependencies, writeFindings, writeReachability, writeThreatIntel } from '../../lib/data_plane/writers';
import { enrichFindingsContext } from '../../lib/data_plane/pipeline';
import { InMemoryDataPlaneClient } from '../../lib/data_plane/testing';

describe('enrich pipeline', () => {
    it('merges deterministic context and preserves no-churn on rerun', async () => {
        const client = new InMemoryDataPlaneClient();

        const finding = {
            repo: 'payment-service',
            buildId: '128',
            ruleId: 'RULE-1',
            severity: 'HIGH',
            cve: 'CVE-2024-1111',
            cves: ['CVE-2024-1111'],
            package: 'lodash',
            version: '4.17.20',
            filePath: 'src/app.ts',
            lineNumber: 10,
            tool: 'semgrep',
            fingerprint: 'fp-1',
            createdAt: 1700000000000,
        };
        const findingId = generateFindingId({
            repo: finding.repo,
            buildId: finding.buildId,
            fingerprint: finding.fingerprint,
        });

        await writeFindings(client, [{ ...finding, findingId }]);
        await writeThreatIntel(client, [{
            intelId: 'CVE-2024-1111',
            cve: 'CVE-2024-1111',
            kev: true,
            kevFlag: true,
            epss: 0.8,
            epssScore: 0.8,
            exploitInWild: true,
            publishedAt: null,
            publishedDate: null,
            lastSeenAt: 1700000000000,
            sourceRefs: ['seed'],
        }]);
        await writeReachability(client, [
            {
                reachabilityId: 'reach-2',
                findingId,
                repo: 'payment-service',
                buildId: '128',
                reachable: true,
                confidenceScore: 1,
                confidence: 1,
                evidencePath: ['__root__', 'lodash@4.17.20'],
                method: 'graph',
                status: 'REACHABLE',
                reason: 'PATH_FOUND',
                analysisVersion: '1.0',
                computedAt: 1700000000000,
            },
            {
                reachabilityId: 'reach-1',
                findingId,
                repo: 'payment-service',
                buildId: '128',
                reachable: false,
                confidenceScore: 0,
                confidence: 0,
                evidencePath: [],
                method: 'unavailable',
                status: 'INSUFFICIENT_DATA',
                reason: 'NO_PATH',
                analysisVersion: '1.0',
                computedAt: 1700000000000,
            },
        ]);

        const first = await enrichFindingsContext(client);
        const snapshotOne = client.get('argonaut_findings', findingId);
        const second = await enrichFindingsContext(client);
        const snapshotTwo = client.get('argonaut_findings', findingId);

        expect(first.processed).toBe(1);
        expect(second.processed).toBe(1);
        expect(first.warnings.length).toBeGreaterThan(0);
        expect(snapshotOne).toEqual(snapshotTwo);

        const context = snapshotTwo?.context as Record<string, unknown>;
        const reachability = context.reachability as Record<string, unknown>;
        expect(reachability.reachable).toBe(false);
        expect(reachability.status).toBe('INSUFFICIENT_DATA');
    });

    it('reports integrity issues deterministically', async () => {
        const client = new InMemoryDataPlaneClient();

        await writeFindings(client, [{
            repo: 'payment-service',
            buildId: '128',
            ruleId: 'RULE-X',
            severity: 'LOW',
            cve: null,
            cves: [],
            package: null,
            version: null,
            filePath: 'src/x.ts',
            lineNumber: 1,
            tool: 'semgrep',
            fingerprint: 'fp-x',
            createdAt: 1700000000000,
            priorityExplanation: {
                explanationId: 'exp-1',
                findingId: 'other-finding',
            },
            findingId: generateFindingId({
                repo: 'payment-service',
                buildId: '128',
                fingerprint: 'fp-x',
            }),
        }]);

        await writeDependencies(client, [{
            repo: 'payment-service',
            buildId: '128',
            parent: '__root__',
            child: 'lodash',
            version: '4.17.20',
            scope: 'runtime',
            runtimeFlag: true,
            sourceFile: 'package-lock.json',
            createdAt: 1700000000000,
            dependencyId: generateDependencyId({
                repo: 'payment-service',
                buildId: '128',
                parent: '__root__',
                child: 'lodash',
                version: '4.17.20',
                scope: 'runtime',
            }),
        }]);

        await writeReachability(client, [{
            reachabilityId: 'reach-broken',
            findingId: 'missing-finding',
            repo: 'payment-service',
            buildId: '128',
            reachable: false,
            confidenceScore: 0,
            confidence: 0,
            evidencePath: [],
            method: 'unavailable',
            status: 'INSUFFICIENT_DATA',
            reason: 'NO_PATH',
            analysisVersion: '1.0',
            computedAt: 1700000000000,
        }]);

        const summary = await enrichFindingsContext(client);

        expect(summary.integrity.brokenReachabilityRefsCount).toBe(1);
        expect(summary.integrity.brokenExplanationRefsCount).toBe(1);
        expect(summary.integrity.brokenDependencyBuildRefsCount).toBe(1);
        expect(summary.integrity.sampleBrokenIds.length).toBeGreaterThan(0);
    });
});
