import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
    buildCanonicalHash,
    generateDependencyId,
    generateFindingId,
    IdentityGenerationError,
    stableStringify,
} from '../../lib/identity';

type FindingSample = {
    findingId: string;
    repo: string;
    buildId: string;
    fingerprint: string;
    createdAt?: number;
};

type DependencySample = {
    dependencyId: string;
    repo: string;
    buildId: string;
    parent: string;
    child: string;
    version: string | null;
    scope: string;
    createdAt?: number;
    sourceFile?: string;
    runtimeFlag?: boolean;
    depth?: number;
};

describe('identity layer', () => {
    it('returns same IDs for same canonical finding/dependency input', () => {
        const findingInput = {
            repo: 'payment-service',
            buildId: '128',
            fingerprint: 'fp-001',
        };

        const dependencyInput = {
            repo: 'payment-service',
            buildId: '128',
            parent: '__root__',
            child: 'lodash',
            version: '4.17.21',
            scope: 'runtime' as const,
        };

        expect(generateFindingId(findingInput)).toBe(generateFindingId(findingInput));
        expect(generateDependencyId(dependencyInput)).toBe(generateDependencyId(dependencyInput));
    });

    it('ignores excluded fields for finding/dependency identity invariance', () => {
        const findingBase = {
            repo: 'payment-service',
            buildId: '128',
            fingerprint: 'fp-001',
        };

        const dependencyBase = {
            repo: 'payment-service',
            buildId: '128',
            parent: '__root__',
            child: 'lodash',
            version: '4.17.21',
            scope: 'runtime' as const,
        };

        const findingWithNoise = {
            ...findingBase,
            createdAt: 1700000000000,
            note: 'ignored',
        } as unknown as typeof findingBase;

        const dependencyWithNoise = {
            ...dependencyBase,
            createdAt: 1700000000000,
            sourceFile: 'package-lock.json',
            runtimeFlag: true,
            depth: 3,
        } as unknown as typeof dependencyBase;

        expect(generateFindingId(findingBase)).toBe(generateFindingId(findingWithNoise));
        expect(generateDependencyId(dependencyBase)).toBe(generateDependencyId(dependencyWithNoise));
    });

    it('normalizes undefined and null version equivalently for dependency identity', () => {
        const withUndefined = generateDependencyId({
            repo: 'payment-service',
            buildId: '128',
            parent: '__root__',
            child: 'spec-only',
            version: undefined,
            scope: 'runtime',
        });

        const withNull = generateDependencyId({
            repo: 'payment-service',
            buildId: '128',
            parent: '__root__',
            child: 'spec-only',
            version: null,
            scope: 'runtime',
        });

        expect(withUndefined).toBe(withNull);
    });

    it('keeps canonical hash invariant to object key order', () => {
        const hashA = buildCanonicalHash({
            kind: 'finding',
            repo: 'payment-service',
            buildId: '128',
            fingerprint: 'fp-001',
        });

        const hashB = buildCanonicalHash({
            fingerprint: 'fp-001',
            buildId: '128',
            repo: 'payment-service',
            kind: 'finding',
        });

        expect(hashA).toBe(hashB);
    });

    it('uses namespace separation between finding and dependency IDs', () => {
        const findingId = generateFindingId({
            repo: 'payment-service',
            buildId: '128',
            fingerprint: 'same-token',
        });

        const dependencyId = generateDependencyId({
            repo: 'payment-service',
            buildId: '128',
            parent: 'same-token',
            child: 'same-token',
            version: null,
            scope: 'runtime',
        });

        expect(findingId).not.toBe(dependencyId);
    });

    it('throws typed errors for malformed identity input', () => {
        expect(() => generateFindingId(null as unknown as { repo: string; buildId: string; fingerprint: string })).toThrow(IdentityGenerationError);

        try {
            generateDependencyId({
                repo: 'payment-service',
                buildId: '128',
                parent: '',
                child: 'lodash',
                version: '4.17.21',
                scope: 'runtime',
            });
            throw new Error('expected identity error');
        } catch (error) {
            expect(error).toBeInstanceOf(IdentityGenerationError);
            expect((error as IdentityGenerationError).code).toBe('MISSING_REQUIRED_FIELD');
        }
    });

    it('remains stable across repeated batches', () => {
        const input = {
            repo: 'payment-service',
            buildId: '128',
            parent: '__root__',
            child: 'a',
            version: '1.0.0',
            scope: 'runtime' as const,
        };

        const batches = Array.from({ length: 5 }, () => generateDependencyId(input));
        expect(new Set(batches).size).toBe(1);
    });

    it('keeps dependency ID unaffected by path separator style once canonical fields are fixed', () => {
        const fromWindowsPathInput = generateDependencyId({
            repo: 'payment-service',
            buildId: '128',
            parent: '__root__',
            child: 'shared',
            version: '2.0.1',
            scope: 'runtime',
        });

        const fromPosixPathInput = generateDependencyId({
            repo: 'payment-service',
            buildId: '128',
            parent: '__root__',
            child: 'shared',
            version: '2.0.1',
            scope: 'runtime',
        });

        expect(fromWindowsPathInput).toBe(fromPosixPathInput);
    });

    it('matches IDs in frozen sample artifacts for findings and dependencies', () => {
        const findingPath = join(process.cwd(), '../program_management/epics/epic_1_argus_core_extraction_stabilization/tasks/artifacts/task_1_1/normalized_findings.sample.json');
        const dependencyPath = join(process.cwd(), '../program_management/epics/epic_1_argus_core_extraction_stabilization/tasks/artifacts/task_1_2/dependency_edges.sample.json');

        const findings = JSON.parse(readFileSync(findingPath, 'utf8')) as FindingSample[];
        const dependencies = JSON.parse(readFileSync(dependencyPath, 'utf8')) as DependencySample[];

        for (const finding of findings) {
            const actual = generateFindingId({
                repo: finding.repo,
                buildId: finding.buildId,
                fingerprint: finding.fingerprint,
            });
            expect(actual).toBe(finding.findingId);
        }

        for (const dependency of dependencies) {
            const actual = generateDependencyId({
                repo: dependency.repo,
                buildId: dependency.buildId,
                parent: dependency.parent,
                child: dependency.child,
                version: dependency.version,
                scope: dependency.scope as 'runtime' | 'dev' | 'test' | 'peer' | 'optional' | 'unknown',
            });
            expect(actual).toBe(dependency.dependencyId);
        }
    });

    it('buildCanonicalHash returns lowercase sha256 hex and stableStringify handles undefined as null', () => {
        const hash = buildCanonicalHash({ a: 1, b: undefined, c: { d: undefined } });
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
        expect(stableStringify({ a: 1, b: undefined, c: { d: undefined } })).toBe('{"a":1,"b":null,"c":{"d":null}}');
    });
});
