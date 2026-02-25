import { explainPriority, ExplanationBuildError, type ExplainInputs } from '../../lib/scoring';

const REQUIRED_KEYS = [
    'explanationId',
    'findingId',
    'repo',
    'buildId',
    'summary',
    'factors',
    'scoreBreakdown',
    'reasonCodes',
    'explanationVersion',
    'createdAt',
] as const;

function baseInput(overrides: Partial<ExplainInputs> = {}): ExplainInputs {
    return {
        findingId: 'finding-1',
        repo: 'payment-service',
        buildId: '128',
        kev: true,
        epss: 0.77,
        reachable: true,
        internetExposed: true,
        confidenceScore: 0.91,
        blastRadius: 12,
        totalScore: 88.2,
        ...overrides,
    };
}

describe('explainPriority', () => {
    it('returns canonical explanation for happy path with all factors', () => {
        const result = explainPriority(baseInput());

        expect(Object.keys(result).sort()).toEqual([...REQUIRED_KEYS].sort());
        expect(result.factors).toEqual({
            kev: true,
            epss: 0.77,
            reachable: true,
            internetExposed: true,
            confidenceScore: 0.91,
            blastRadius: 12,
        });

        expect(result.scoreBreakdown).toEqual({
            exploitWeight: 30,
            reachabilityWeight: 25,
            exposureWeight: 15,
            totalScore: 88.2,
        });

        expect(result.reasonCodes).toEqual([
            'KEV_PRESENT',
            'EPSS_HIGH',
            'REACHABLE_TRUE',
            'EXPOSED_TRUE',
            'CONFIDENCE_HIGH',
            'BLAST_RADIUS_HIGH',
        ]);
    });

    it('maps exposure factor deterministically for true, false, and null', () => {
        const exposed = explainPriority(baseInput({ internetExposed: true }));
        const notExposed = explainPriority(baseInput({ internetExposed: false }));
        const missingExposure = explainPriority(baseInput({ internetExposed: null }));

        expect(exposed.reasonCodes[3]).toBe('EXPOSED_TRUE');
        expect(notExposed.reasonCodes[3]).toBe('EXPOSED_FALSE');
        expect(missingExposure.reasonCodes[3]).toBe('EXPOSED_MISSING');
    });

    it('normalizes missing EPSS/confidence/blast-radius values to null and missing reason codes', () => {
        const result = explainPriority(baseInput({
            epss: null,
            confidenceScore: null,
            blastRadius: null,
        }));

        expect(result.factors.epss).toBeNull();
        expect(result.factors.confidenceScore).toBeNull();
        expect(result.factors.blastRadius).toBeNull();
        expect(result.reasonCodes).toEqual([
            'KEV_PRESENT',
            'EPSS_MISSING',
            'REACHABLE_TRUE',
            'EXPOSED_TRUE',
            'CONFIDENCE_MISSING',
            'BLAST_RADIUS_MISSING',
        ]);
    });

    it('always emits exactly one reason code per reason family in deterministic order', () => {
        const result = explainPriority(baseInput({
            kev: false,
            epss: 0.15,
            reachable: false,
            internetExposed: false,
            confidenceScore: 0.6,
            blastRadius: 4,
        }));

        expect(result.reasonCodes).toHaveLength(6);
        expect(result.reasonCodes).toEqual([
            'KEV_ABSENT',
            'EPSS_MEDIUM',
            'REACHABLE_FALSE',
            'EXPOSED_FALSE',
            'CONFIDENCE_MEDIUM',
            'BLAST_RADIUS_MEDIUM',
        ]);
    });

    it('applies threshold boundaries for EPSS, confidence, and blast radius exactly', () => {
        const highBoundaries = explainPriority(baseInput({
            epss: 0.5,
            confidenceScore: 0.8,
            blastRadius: 10,
        }));

        const mediumBoundaries = explainPriority(baseInput({
            epss: 0.1,
            confidenceScore: 0.4,
            blastRadius: 3,
        }));

        const lowBoundaries = explainPriority(baseInput({
            epss: 0.099,
            confidenceScore: 0.399,
            blastRadius: 2,
        }));

        expect(highBoundaries.reasonCodes[1]).toBe('EPSS_HIGH');
        expect(highBoundaries.reasonCodes[4]).toBe('CONFIDENCE_HIGH');
        expect(highBoundaries.reasonCodes[5]).toBe('BLAST_RADIUS_HIGH');

        expect(mediumBoundaries.reasonCodes[1]).toBe('EPSS_MEDIUM');
        expect(mediumBoundaries.reasonCodes[4]).toBe('CONFIDENCE_MEDIUM');
        expect(mediumBoundaries.reasonCodes[5]).toBe('BLAST_RADIUS_MEDIUM');

        expect(lowBoundaries.reasonCodes[1]).toBe('EPSS_LOW');
        expect(lowBoundaries.reasonCodes[4]).toBe('CONFIDENCE_LOW');
        expect(lowBoundaries.reasonCodes[5]).toBe('BLAST_RADIUS_LOW');
    });

    it('formats summary with deterministic 2/2/1 decimal display policy', () => {
        const result = explainPriority(baseInput({
            epss: 0.33333,
            confidenceScore: 0.87654,
            totalScore: 70.26,
        }));

        expect(result.summary).toContain('EPSS 0.33');
        expect(result.summary).toContain('confidence 0.88');
        expect(result.summary).toContain('total score 70.3');
    });

    it('keeps explanation deterministic for same canonical input except createdAt', () => {
        const first = explainPriority(baseInput({ explanationVersion: '1.0' }));
        const second = explainPriority(baseInput({ explanationVersion: '1.0' }));

        expect(first.explanationId).toBe(second.explanationId);
        expect(first.summary).toBe(second.summary);
        expect(first.reasonCodes).toEqual(second.reasonCodes);
        expect(first.factors).toEqual(second.factors);
    });

    it('throws INVALID_INPUT for malformed input shape', () => {
        expect(() => explainPriority('invalid' as unknown as ExplainInputs)).toThrow(ExplanationBuildError);

        try {
            explainPriority({
                findingId: 'finding-1',
                repo: 'payment-service',
                buildId: '128',
                kev: true,
                reachable: true,
                totalScore: Number.NaN,
            } as ExplainInputs);
            throw new Error('expected INVALID_INPUT');
        } catch (error) {
            expect(error).toBeInstanceOf(ExplanationBuildError);
            expect((error as ExplanationBuildError).code).toBe('INVALID_INPUT');
        }
    });

    it('throws INVALID_INPUT_RANGE for out-of-range inputs', () => {
        try {
            explainPriority(baseInput({ epss: 1.2 }));
            throw new Error('expected INVALID_INPUT_RANGE for epss');
        } catch (error) {
            expect(error).toBeInstanceOf(ExplanationBuildError);
            expect((error as ExplanationBuildError).code).toBe('INVALID_INPUT_RANGE');
        }

        try {
            explainPriority(baseInput({ blastRadius: -1 }));
            throw new Error('expected INVALID_INPUT_RANGE for blastRadius');
        } catch (error) {
            expect(error).toBeInstanceOf(ExplanationBuildError);
            expect((error as ExplanationBuildError).code).toBe('INVALID_INPUT_RANGE');
        }
    });

    it('throws INVALID_INPUT when totalScore is missing', () => {
        expect(() => explainPriority({
            findingId: 'finding-1',
            repo: 'payment-service',
            buildId: '128',
            kev: true,
            reachable: true,
        } as ExplainInputs)).toThrow(ExplanationBuildError);

        try {
            explainPriority({
                findingId: 'finding-1',
                repo: 'payment-service',
                buildId: '128',
                kev: true,
                reachable: true,
            } as ExplainInputs);
            throw new Error('expected INVALID_INPUT for missing totalScore');
        } catch (error) {
            expect(error).toBeInstanceOf(ExplanationBuildError);
            expect((error as ExplanationBuildError).code).toBe('INVALID_INPUT');
        }
    });

    it('always includes explanationVersion with default 1.0 when omitted', () => {
        const defaultVersion = explainPriority(baseInput({ explanationVersion: undefined }));
        const customVersion = explainPriority(baseInput({ explanationVersion: '1.1' }));

        expect(defaultVersion.explanationVersion).toBe('1.0');
        expect(customVersion.explanationVersion).toBe('1.1');
    });
});
