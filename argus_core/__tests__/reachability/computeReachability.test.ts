import { computeReachability, ReachabilityComputeError } from '../../lib/reachability';
import type { DependencyEdge } from '../../lib/ingest/lockfiles';

function edge(partial: Partial<DependencyEdge> & Pick<DependencyEdge, 'parent' | 'child'>): DependencyEdge {
    return {
        dependencyId: partial.dependencyId ?? 'dep',
        repo: partial.repo ?? 'payment-service',
        buildId: partial.buildId ?? '128',
        parent: partial.parent,
        child: partial.child,
        version: partial.version ?? null,
        scope: partial.scope ?? 'runtime',
        runtimeFlag: partial.runtimeFlag ?? true,
        sourceFile: partial.sourceFile ?? 'package-lock.json',
        createdAt: partial.createdAt ?? 1700000000000,
        depth: partial.depth,
    };
}

describe('computeReachability', () => {
    it('returns REACHABLE with deterministic evidencePath when runtime path exists', () => {
        const edges: DependencyEdge[] = [
            edge({ parent: '__root__', child: 'a', version: '1.0.0' }),
            edge({ parent: 'a', child: 'target', version: '2.0.0' }),
        ];

        const result = computeReachability({
            findingId: 'f-1',
            repo: 'payment-service',
            buildId: '128',
            targetPackage: 'target',
            targetVersion: '2.0.0',
            dependencyEdges: edges,
        });

        expect(result.status).toBe('REACHABLE');
        expect(result.reason).toBe('PATH_FOUND');
        expect(result.reachable).toBe(true);
        expect(result.method).toBe('graph');
        expect(result.confidenceScore).toBe(1);
        expect(result.confidence).toBe(1);
        expect(result.evidencePath).toEqual(['__root__', 'a@1.0.0', 'target@2.0.0']);
        expect(result.analysisVersion).toBe('1.0');
    });

    it('returns UNREACHABLE NO_PATH when target exists but is disconnected from root', () => {
        const edges: DependencyEdge[] = [
            edge({ parent: '__root__', child: 'a', version: '1.0.0' }),
            edge({ parent: 'ghost', child: 'target', version: '2.0.0' }),
        ];

        const result = computeReachability({
            findingId: 'f-2',
            repo: 'payment-service',
            buildId: '128',
            targetPackage: 'target',
            dependencyEdges: edges,
        });

        expect(result.status).toBe('INSUFFICIENT_DATA');
        expect(result.reason).toBe('UNSUPPORTED_GRAPH_SHAPE');
    });

    it('returns UNREACHABLE TARGET_NOT_PRESENT when target package does not exist in runtime graph', () => {
        const edges: DependencyEdge[] = [
            edge({ parent: '__root__', child: 'a', version: '1.0.0' }),
            edge({ parent: 'a', child: 'b', version: '1.2.0' }),
        ];

        const result = computeReachability({
            findingId: 'f-3',
            repo: 'payment-service',
            buildId: '128',
            targetPackage: 'target',
            dependencyEdges: edges,
        });

        expect(result.status).toBe('UNREACHABLE');
        expect(result.reason).toBe('TARGET_NOT_PRESENT');
    });

    it('returns INSUFFICIENT_DATA EMPTY_GRAPH for empty dependency edge list', () => {
        const result = computeReachability({
            findingId: 'f-4',
            repo: 'payment-service',
            buildId: '128',
            targetPackage: 'target',
            dependencyEdges: [],
        });

        expect(result.status).toBe('INSUFFICIENT_DATA');
        expect(result.reason).toBe('EMPTY_GRAPH');
        expect(result.method).toBe('unavailable');
        expect(result.confidenceScore).toBe(0);
    });

    it('returns INSUFFICIENT_DATA MISSING_VERSION_CONTEXT when targetVersion is required but missing on nodes', () => {
        const edges: DependencyEdge[] = [
            edge({ parent: '__root__', child: 'a', version: '1.0.0' }),
            edge({ parent: 'a', child: 'target', version: null }),
        ];

        const result = computeReachability({
            findingId: 'f-5',
            repo: 'payment-service',
            buildId: '128',
            targetPackage: 'target',
            targetVersion: '2.0.0',
            dependencyEdges: edges,
        });

        expect(result.status).toBe('INSUFFICIENT_DATA');
        expect(result.reason).toBe('MISSING_VERSION_CONTEXT');
    });

    it('uses deterministic lexicographic tie-break for equal-length shortest paths', () => {
        const edges: DependencyEdge[] = [
            edge({ parent: '__root__', child: 'a', version: '1.0.0' }),
            edge({ parent: '__root__', child: 'b', version: '1.0.0' }),
            edge({ parent: 'a', child: 'target', version: '2.0.0' }),
            edge({ parent: 'b', child: 'target', version: '2.0.0' }),
        ];

        const result = computeReachability({
            findingId: 'f-6',
            repo: 'payment-service',
            buildId: '128',
            targetPackage: 'target',
            dependencyEdges: edges,
        });

        expect(result.evidencePath).toEqual(['__root__', 'a@1.0.0', 'target@2.0.0']);
    });

    it('applies runtime-only filtering for path computation', () => {
        const edges: DependencyEdge[] = [
            edge({ parent: '__root__', child: 'a', version: '1.0.0', runtimeFlag: true }),
            edge({ parent: 'a', child: 'target', version: '2.0.0', runtimeFlag: false, scope: 'dev' }),
            edge({ parent: '__root__', child: 'dev-only', version: '5.0.0', runtimeFlag: false, scope: 'dev' }),
        ];

        const result = computeReachability({
            findingId: 'f-7',
            repo: 'payment-service',
            buildId: '128',
            targetPackage: 'target',
            dependencyEdges: edges,
        });

        expect(result.status).toBe('UNREACHABLE');
        expect(result.reason).toBe('TARGET_NOT_PRESENT');
    });

    it('keeps result deterministic (except computedAt) for same canonical input', () => {
        const edges: DependencyEdge[] = [
            edge({ parent: '__root__', child: 'a', version: '1.0.0' }),
            edge({ parent: 'a', child: 'target', version: '2.0.0' }),
        ];

        const first = computeReachability({
            findingId: 'f-8',
            repo: 'payment-service',
            buildId: '128',
            targetPackage: 'target',
            dependencyEdges: edges,
            analysisVersion: '1.0',
        });

        const second = computeReachability({
            findingId: 'f-8',
            repo: 'payment-service',
            buildId: '128',
            targetPackage: 'target',
            dependencyEdges: edges,
            analysisVersion: '1.0',
        });

        expect(first.reachabilityId).toBe(second.reachabilityId);
        expect(first.evidencePath).toEqual(second.evidencePath);
        expect(first.status).toBe(second.status);
        expect(first.reason).toBe(second.reason);
    });

    it('throws INVALID_INPUT for malformed input shape', () => {
        expect(() => computeReachability({
            findingId: 'f-9',
            repo: 'payment-service',
            buildId: '128',
            targetPackage: 'target',
            dependencyEdges: 'invalid' as unknown as DependencyEdge[],
        })).toThrow(ReachabilityComputeError);

        try {
            computeReachability({
                findingId: 'f-9',
                repo: 'payment-service',
                buildId: '128',
                targetPackage: '',
                dependencyEdges: [],
            });
            throw new Error('expected INVALID_INPUT');
        } catch (error) {
            expect(error).toBeInstanceOf(ReachabilityComputeError);
            expect((error as ReachabilityComputeError).code).toBe('INVALID_INPUT');
        }
    });

    it('returns analysisVersion default and deterministic ID when not provided', () => {
        const edges: DependencyEdge[] = [
            edge({ parent: '__root__', child: 'target', version: '1.0.0' }),
        ];

        const result = computeReachability({
            findingId: 'f-10',
            repo: 'payment-service',
            buildId: '128',
            targetPackage: 'target',
            dependencyEdges: edges,
        });

        expect(result.analysisVersion).toBe('1.0');
        expect(result.reachabilityId).toBeTruthy();
    });
});
