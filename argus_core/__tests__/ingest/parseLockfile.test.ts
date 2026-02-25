import lockfileV1 from '../fixtures/lockfiles/package-lock-v1.sample.json';
import lockfileV3 from '../fixtures/lockfiles/package-lock-v3.sample.json';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { LockfileParseError, parseLockfile } from '../../lib/ingest/lockfiles';

const REQUIRED_KEYS = [
    'dependencyId',
    'repo',
    'buildId',
    'parent',
    'child',
    'version',
    'scope',
    'runtimeFlag',
    'sourceFile',
    'createdAt',
    'depth',
] as const;

describe('parseLockfile', () => {
    it('parses npm v3 lockfile with deterministic root and nested edges', () => {
        const edges = parseLockfile(lockfileV3, {
            repo: 'payment-service',
            buildId: '128',
            createdAt: 1700000000000,
        });

        expect(edges.length).toBeGreaterThan(0);

        const rootA = edges.find((edge) => edge.parent === '__root__' && edge.child === 'a');
        const rootDev = edges.find((edge) => edge.parent === '__root__' && edge.child === 'dev-only');
        const nestedSharedFromA = edges.find((edge) => edge.parent === 'a' && edge.child === 'shared');
        const nestedSharedFromB = edges.find((edge) => edge.parent === 'b' && edge.child === 'shared');

        expect(rootA).toBeDefined();
        expect(rootDev).toBeDefined();
        expect(nestedSharedFromA).toBeDefined();
        expect(nestedSharedFromB).toBeDefined();

        expect(rootA?.scope).toBe('runtime');
        expect(rootA?.runtimeFlag).toBe(true);
        expect(rootA?.version).toBe('1.0.0');

        expect(rootDev?.scope).toBe('dev');
        expect(rootDev?.runtimeFlag).toBe(false);
        expect(rootDev?.version).toBe('5.2.0');

        expect(Object.keys(rootA ?? {}).sort()).toEqual([...REQUIRED_KEYS].sort());
    });

    it('sets version to null when only version spec/range exists', () => {
        const edges = parseLockfile(lockfileV3, {
            repo: 'payment-service',
            buildId: '129',
            createdAt: 1700000000000,
        });

        const specOnly = edges.find((edge) => edge.parent === '__root__' && edge.child === 'spec-only');
        expect(specOnly).toBeDefined();
        expect(specOnly?.version).toBeNull();
    });

    it('keeps same child under different parents as distinct edges', () => {
        const edges = parseLockfile(lockfileV3, {
            repo: 'payment-service',
            buildId: '130',
            createdAt: 1700000000000,
        });

        const parentChildPairs = edges
            .filter((edge) => edge.child === 'shared')
            .map((edge) => `${edge.parent}->${edge.child}`)
            .sort();

        expect(parentChildPairs).toEqual(['a->shared', 'b->shared']);
    });

    it('parses npm v1 lockfile and applies scope/version policies', () => {
        const edges = parseLockfile(lockfileV1, {
            repo: 'legacy-service',
            buildId: '301',
            createdAt: 1700000000000,
        });

        const rootAlpha = edges.find((edge) => edge.parent === '__root__' && edge.child === 'alpha');
        const rootBeta = edges.find((edge) => edge.parent === '__root__' && edge.child === 'beta');
        const rootGamma = edges.find((edge) => edge.parent === '__root__' && edge.child === 'gamma');

        expect(rootAlpha?.version).toBe('1.2.3');
        expect(rootBeta?.scope).toBe('dev');
        expect(rootBeta?.version).toBeNull();
        expect(rootGamma?.scope).toBe('optional');
    });

    it('supports minimal yarn.lock parsing and deduplicates identical tuple edges', () => {
        const yarnFixturePath = join(process.cwd(), '__tests__/fixtures/lockfiles/yarn.lock.sample');
        const yarnContent = readFileSync(yarnFixturePath, 'utf8');

        const edges = parseLockfile(yarnContent, {
            repo: 'frontend-web',
            buildId: '88',
            createdAt: 1700000000000,
            sourceFile: 'C:\\workspace\\frontend\\yarn.lock',
        });

        const alphaSharedEdges = edges.filter((edge) => edge.parent === 'alpha' && edge.child === 'shared');
        const scopedShared = edges.find((edge) => edge.parent === '@scope/pkg' && edge.child === 'shared');

        expect(alphaSharedEdges).toHaveLength(1);
        expect(scopedShared).toBeDefined();
        expect(scopedShared?.version).toBe('2.0.1');
        expect(scopedShared?.sourceFile).toBe('workspace/frontend/yarn.lock');
    });

    it('normalizes sourceFile to workspace-relative POSIX path', () => {
        const edges = parseLockfile(lockfileV3, {
            repo: 'payment-service',
            buildId: '131',
            createdAt: 1700000000000,
            sourceFile: 'C:\\Users\\dev\\repo\\package-lock.json',
        });

        expect(edges[0].sourceFile).toBe('Users/dev/repo/package-lock.json');
    });

    it('keeps dependency identity deterministic while createdAt changes', () => {
        const earlier = parseLockfile(lockfileV3, {
            repo: 'payment-service',
            buildId: '132',
            createdAt: 1700000000000,
        });

        const later = parseLockfile(lockfileV3, {
            repo: 'payment-service',
            buildId: '132',
            createdAt: 1700000500000,
        });

        expect(earlier.map((edge) => edge.dependencyId)).toEqual(later.map((edge) => edge.dependencyId));
        expect(earlier.map((edge) => `${edge.parent}|${edge.child}|${edge.version ?? 'null'}|${edge.scope}`)).toEqual(
            later.map((edge) => `${edge.parent}|${edge.child}|${edge.version ?? 'null'}|${edge.scope}`),
        );
        expect(earlier.map((edge) => edge.createdAt)).not.toEqual(later.map((edge) => edge.createdAt));
    });

    it('throws typed INVALID_JSON error for malformed lockfile string', () => {
        expect(() => parseLockfile('{invalid-json', {
            repo: 'payment-service',
            buildId: '133',
        })).toThrow(LockfileParseError);

        try {
            parseLockfile('{invalid-json', {
                repo: 'payment-service',
                buildId: '133',
            });
            throw new Error('expected parseLockfile to throw INVALID_JSON');
        } catch (error) {
            expect(error).toBeInstanceOf(LockfileParseError);
            expect((error as LockfileParseError).code).toBe('INVALID_JSON');
        }
    });

    it('returns [] for unsupported lockfile version or structure', () => {
        const unsupportedVersion = parseLockfile({
            name: 'service-a',
            lockfileVersion: 9,
            packages: {},
        }, {
            repo: 'service-a',
            buildId: '44',
        });

        const unsupportedStructure = parseLockfile({
            name: 'service-a',
            lockfileVersion: 3,
            metadata: {},
        }, {
            repo: 'service-a',
            buildId: '44',
        });

        expect(unsupportedVersion).toEqual([]);
        expect(unsupportedStructure).toEqual([]);
    });
});
