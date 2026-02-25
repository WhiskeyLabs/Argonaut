import sampleSarif from '../fixtures/sarif/sample.sarif.json';
import { SarifParseError, parseSarif } from '../../lib/ingest/sarif';

const REQUIRED_KEYS = [
    'findingId',
    'repo',
    'buildId',
    'ruleId',
    'severity',
    'cve',
    'cves',
    'package',
    'version',
    'filePath',
    'lineNumber',
    'tool',
    'fingerprint',
    'createdAt',
] as const;

describe('parseSarif', () => {
    it('returns canonical findings with required fields', () => {
        const findings = parseSarif(sampleSarif, {
            repo: 'payment-service',
            buildId: '128',
            createdAt: 1700000000000,
            defaultFilePath: 'fallback/file.ts',
        });

        expect(findings).toHaveLength(3);

        const first = findings.find((item) => item.ruleId === 'CVE-2024-1111');
        expect(first).toBeDefined();

        const firstFinding = first!;
        expect(Object.keys(firstFinding).sort()).toEqual([...REQUIRED_KEYS].sort());
        expect(firstFinding.severity).toBe('CRITICAL');
        expect(firstFinding.cve).toBe('CVE-2024-1111');
        expect(firstFinding.cves).toEqual(['CVE-2024-1111', 'CVE-2024-2222']);
        expect(firstFinding.package).toBe('lodash');
        expect(firstFinding.version).toBe('4.17.20');
        expect(firstFinding.filePath).toBe('src/app.ts');
        expect(firstFinding.lineNumber).toBe(42);
        expect(firstFinding.tool).toBe('semgrep');
    });

    it('throws typed error for malformed JSON strings', () => {
        expect(() => parseSarif('{invalid-json', {
            repo: 'payment-service',
            buildId: '129',
        })).toThrow(SarifParseError);

        try {
            parseSarif('{invalid-json', {
                repo: 'payment-service',
                buildId: '129',
            });
            throw new Error('expected parseSarif to throw for malformed JSON');
        } catch (error) {
            expect(error).toBeInstanceOf(SarifParseError);
            expect((error as SarifParseError).code).toBe('MALFORMED_JSON');
        }
    });

    it('returns empty array for unsupported SARIF version', () => {
        const unsupported = {
            ...sampleSarif,
            version: '2.0.0',
        };

        const findings = parseSarif(unsupported, {
            repo: 'payment-service',
            buildId: '130',
        });

        expect(findings).toEqual([]);
    });

    it('uses location fallback policy when location is missing', () => {
        const findings = parseSarif(sampleSarif, {
            repo: 'payment-service',
            buildId: '131',
            createdAt: 1700000000000,
            defaultFilePath: 'fallback/file.ts',
        });

        const fallbackFinding = findings.find((item) => item.ruleId === 'RULE-NO-CVE');
        expect(fallbackFinding).toBeDefined();

        const finding = fallbackFinding!;
        expect(finding.filePath).toBe('fallback/file.ts');
        expect(finding.lineNumber).toBeNull();
    });

    it('normalizes CVE list deterministically for multiple references', () => {
        const findings = parseSarif(sampleSarif, {
            repo: 'payment-service',
            buildId: '132',
            createdAt: 1700000000000,
        });

        const multiCveFinding = findings.find((item) => item.ruleId === 'RULE-MULTI-CVE');
        expect(multiCveFinding).toBeDefined();

        const finding = multiCveFinding!;
        expect(finding.cves).toEqual(['CVE-2021-1111', 'CVE-2023-9999']);
        expect(finding.cve).toBe('CVE-2021-1111');
    });

    it('keeps finding identity deterministic even when createdAt changes', () => {
        const withEarlierTimestamp = parseSarif(sampleSarif, {
            repo: 'payment-service',
            buildId: '133',
            createdAt: 1700000000000,
        });

        const withLaterTimestamp = parseSarif(sampleSarif, {
            repo: 'payment-service',
            buildId: '133',
            createdAt: 1700000500000,
        });

        expect(withEarlierTimestamp.map((item) => item.findingId)).toEqual(
            withLaterTimestamp.map((item) => item.findingId),
        );
        expect(withEarlierTimestamp.map((item) => item.fingerprint)).toEqual(
            withLaterTimestamp.map((item) => item.fingerprint),
        );
        expect(withEarlierTimestamp.map((item) => item.createdAt)).not.toEqual(
            withLaterTimestamp.map((item) => item.createdAt),
        );
    });
});
