import cyclonedxSample from '../fixtures/sbom/cyclonedx.sample.json';
import { SbomParseError, parseSbom } from '../../lib/ingest/sbom';

const REQUIRED_KEYS = [
    'componentId',
    'repo',
    'buildId',
    'component',
    'version',
    'license',
    'supplier',
    'hash',
    'purl',
    'bomRef',
    'bomFormatVersion',
    'ecosystem',
    'sourceFile',
    'createdAt',
] as const;

describe('parseSbom', () => {
    it('parses CycloneDX components and enforces deterministic contract fields', () => {
        const components = parseSbom(cyclonedxSample, {
            repo: 'payment-service',
            buildId: '128',
            createdAt: 1700000000000,
            sourceFile: 'demo-data\\bundles\\payment-service_build-128\\sbom.cdx.json',
        });

        expect(components.length).toBeGreaterThan(0);

        const lodash = components.find((item) => item.component === 'lodash' && item.version === '4.17.21');
        expect(lodash).toBeDefined();

        expect(Object.keys(lodash ?? {}).sort()).toEqual([...REQUIRED_KEYS].sort());
        expect(lodash?.license).toBe('MIT');
        expect(lodash?.hash).toBe('SHA-256:222');
        expect(lodash?.purl).toBe('pkg:npm/lodash@4.17.21');
        expect(lodash?.ecosystem).toBe('npm');
        expect(lodash?.bomFormatVersion).toBe('1.5');
        expect(lodash?.sourceFile).toBe('demo-data/bundles/payment-service_build-128/sbom.cdx.json');
    });

    it('includes metadata.component and collapses duplicate tuple entries', () => {
        const components = parseSbom(cyclonedxSample, {
            repo: 'payment-service',
            buildId: '129',
            createdAt: 1700000000000,
        });

        const metadataRoot = components.find((item) => item.component === 'payment-service');
        const lodashCount = components.filter((item) => item.component === 'lodash' && item.version === '4.17.21').length;

        expect(metadataRoot).toBeDefined();
        expect(metadataRoot?.license).toBe('MIT OR Apache-2.0');
        expect(lodashCount).toBe(1);
    });

    it('applies missing version policy and expression non-interpretation', () => {
        const components = parseSbom(cyclonedxSample, {
            repo: 'payment-service',
            buildId: '130',
            createdAt: 1700000000000,
        });

        const leftPadNoVersion = components.find((item) => item.component === 'left-pad' && item.version === null);
        expect(leftPadNoVersion).toBeDefined();
        expect(leftPadNoVersion?.version).toBeNull();
        expect(leftPadNoVersion?.license).toBe('BSD-3-Clause');
        expect(leftPadNoVersion?.hash).toBe('SHA-1:sha1v');
    });

    it('does not collapse components when tuple differs by version/purl/supplier', () => {
        const components = parseSbom(cyclonedxSample, {
            repo: 'payment-service',
            buildId: '131',
            createdAt: 1700000000000,
        });

        const leftPadVariants = components.filter((item) => item.component === 'left-pad');
        expect(leftPadVariants).toHaveLength(2);

        const versions = leftPadVariants.map((item) => item.version ?? 'null').sort();
        expect(versions).toEqual(['1.3.0', 'null']);
    });

    it('keeps component IDs deterministic and excludes createdAt from hash inputs', () => {
        const earlier = parseSbom(cyclonedxSample, {
            repo: 'payment-service',
            buildId: '132',
            createdAt: 1700000000000,
        });

        const later = parseSbom(cyclonedxSample, {
            repo: 'payment-service',
            buildId: '132',
            createdAt: 1700000500000,
        });

        expect(earlier.map((item) => item.componentId)).toEqual(later.map((item) => item.componentId));
        expect(earlier.map((item) => `${item.component}|${item.version ?? 'null'}|${item.purl ?? 'null'}`)).toEqual(
            later.map((item) => `${item.component}|${item.version ?? 'null'}|${item.purl ?? 'null'}`),
        );
        expect(earlier.map((item) => item.createdAt)).not.toEqual(later.map((item) => item.createdAt));
    });

    it('throws INVALID_JSON for malformed JSON strings', () => {
        expect(() => parseSbom('{broken-json', {
            repo: 'payment-service',
            buildId: '133',
        })).toThrow(SbomParseError);

        try {
            parseSbom('{broken-json', {
                repo: 'payment-service',
                buildId: '133',
            });
            throw new Error('expected parseSbom to throw INVALID_JSON');
        } catch (error) {
            expect(error).toBeInstanceOf(SbomParseError);
            expect((error as SbomParseError).code).toBe('INVALID_JSON');
        }
    });

    it('returns deterministic [] for unsupported format/version/structure', () => {
        const unsupportedFormat = parseSbom({
            bomFormat: 'SPDX',
            specVersion: '2.3',
            components: [],
        }, {
            repo: 'payment-service',
            buildId: '134',
        });

        const unsupportedVersion = parseSbom({
            bomFormat: 'CycloneDX',
            specVersion: '1.2',
            components: [],
        }, {
            repo: 'payment-service',
            buildId: '134',
        });

        const unsupportedStructure = parseSbom({
            bomFormat: 'CycloneDX',
            specVersion: '1.5'
        }, {
            repo: 'payment-service',
            buildId: '134',
        });

        expect(unsupportedFormat).toEqual([]);
        expect(unsupportedVersion).toEqual([]);
        expect(unsupportedStructure).toEqual([]);
    });
});
