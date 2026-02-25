import { ExplanationBuildError } from './errors';
import { ExplainInputs, ExplainWeights, Explanation, ExplanationReasonCode } from './types';

type UnknownRecord = Record<string, unknown>;

type NormalizedInput = {
    findingId: string;
    repo: string;
    buildId: string;
    kev: boolean;
    epss: number | null;
    reachable: boolean;
    internetExposed: boolean | null;
    confidenceScore: number | null;
    blastRadius: number | null;
    weights: ExplainWeights;
    totalScore: number;
    explanationVersion: string;
};

const DEFAULT_WEIGHTS: ExplainWeights = {
    exploitWeight: 30,
    reachabilityWeight: 25,
    exposureWeight: 15,
};

export function explainPriority(inputs: ExplainInputs): Explanation {
    const normalized = normalizeInput(inputs);
    const reasonCodes = buildReasonCodes(normalized);

    const summary = buildSummary(normalized, reasonCodes);

    const explanationId = stableHash({
        repo: normalized.repo,
        buildId: normalized.buildId,
        findingId: normalized.findingId,
        kev: normalized.kev,
        epss: normalized.epss,
        reachable: normalized.reachable,
        internetExposed: normalized.internetExposed,
        confidenceScore: normalized.confidenceScore,
        blastRadius: normalized.blastRadius,
        exploitWeight: normalized.weights.exploitWeight,
        reachabilityWeight: normalized.weights.reachabilityWeight,
        exposureWeight: normalized.weights.exposureWeight,
        totalScore: normalized.totalScore,
        reasonCodes,
        explanationVersion: normalized.explanationVersion,
    });

    return {
        explanationId,
        findingId: normalized.findingId,
        repo: normalized.repo,
        buildId: normalized.buildId,
        summary,
        factors: {
            kev: normalized.kev,
            epss: normalized.epss,
            reachable: normalized.reachable,
            internetExposed: normalized.internetExposed,
            confidenceScore: normalized.confidenceScore,
            blastRadius: normalized.blastRadius,
        },
        scoreBreakdown: {
            exploitWeight: normalized.weights.exploitWeight,
            reachabilityWeight: normalized.weights.reachabilityWeight,
            exposureWeight: normalized.weights.exposureWeight,
            totalScore: normalized.totalScore,
        },
        reasonCodes,
        explanationVersion: normalized.explanationVersion,
        createdAt: Date.now(),
    };
}

function normalizeInput(input: ExplainInputs): NormalizedInput {
    if (!isRecord(input)) {
        throw new ExplanationBuildError('INVALID_INPUT', 'Explanation input must be an object.');
    }

    const findingId = normalizeRequiredString(input.findingId, 'findingId');
    const repo = normalizeRequiredString(input.repo, 'repo');
    const buildId = normalizeRequiredString(input.buildId, 'buildId');

    if (typeof input.kev !== 'boolean') {
        throw new ExplanationBuildError('INVALID_INPUT', 'kev must be a boolean.');
    }

    if (typeof input.reachable !== 'boolean') {
        throw new ExplanationBuildError('INVALID_INPUT', 'reachable must be a boolean.');
    }

    const epss = normalizeOptionalProbability(input.epss, 'epss');
    const internetExposed = normalizeOptionalBoolean(input.internetExposed, 'internetExposed');
    const confidenceScore = normalizeOptionalProbability(input.confidenceScore, 'confidenceScore');
    const blastRadius = normalizeOptionalBlastRadius(input.blastRadius, 'blastRadius');

    if (!Number.isFinite(input.totalScore)) {
        throw new ExplanationBuildError('INVALID_INPUT', 'totalScore is required and must be a finite number.');
    }

    const weights = normalizeWeights(input.weights);
    const explanationVersion = normalizeOptionalString(input.explanationVersion) ?? '1.0';

    return {
        findingId,
        repo,
        buildId,
        kev: input.kev,
        epss,
        reachable: input.reachable,
        internetExposed,
        confidenceScore,
        blastRadius,
        weights,
        totalScore: input.totalScore,
        explanationVersion,
    };
}

function normalizeWeights(value: ExplainInputs['weights']): ExplainWeights {
    if (value === undefined) {
        return DEFAULT_WEIGHTS;
    }

    if (!isRecord(value)) {
        throw new ExplanationBuildError('INVALID_INPUT', 'weights must be an object when provided.');
    }

    const exploitWeight = normalizeFiniteNumber(value.exploitWeight, 'weights.exploitWeight');
    const reachabilityWeight = normalizeFiniteNumber(value.reachabilityWeight, 'weights.reachabilityWeight');
    const exposureWeight = normalizeFiniteNumber(value.exposureWeight, 'weights.exposureWeight');

    return {
        exploitWeight,
        reachabilityWeight,
        exposureWeight,
    };
}

function buildReasonCodes(input: NormalizedInput): ExplanationReasonCode[] {
    const reasons: ExplanationReasonCode[] = [];

    reasons.push(input.kev ? 'KEV_PRESENT' : 'KEV_ABSENT');
    reasons.push(buildEpssReason(input.epss));
    reasons.push(input.reachable ? 'REACHABLE_TRUE' : 'REACHABLE_FALSE');
    reasons.push(buildExposureReason(input.internetExposed));
    reasons.push(buildConfidenceReason(input.confidenceScore));
    reasons.push(buildBlastRadiusReason(input.blastRadius));

    return reasons;
}

function buildEpssReason(epss: number | null): ExplanationReasonCode {
    if (epss === null) {
        return 'EPSS_MISSING';
    }

    if (epss >= 0.5) {
        return 'EPSS_HIGH';
    }

    if (epss >= 0.1) {
        return 'EPSS_MEDIUM';
    }

    return 'EPSS_LOW';
}

function buildExposureReason(internetExposed: boolean | null): ExplanationReasonCode {
    if (internetExposed === true) {
        return 'EXPOSED_TRUE';
    }

    if (internetExposed === false) {
        return 'EXPOSED_FALSE';
    }

    return 'EXPOSED_MISSING';
}

function buildConfidenceReason(confidenceScore: number | null): ExplanationReasonCode {
    if (confidenceScore === null) {
        return 'CONFIDENCE_MISSING';
    }

    if (confidenceScore >= 0.8) {
        return 'CONFIDENCE_HIGH';
    }

    if (confidenceScore >= 0.4) {
        return 'CONFIDENCE_MEDIUM';
    }

    return 'CONFIDENCE_LOW';
}

function buildBlastRadiusReason(blastRadius: number | null): ExplanationReasonCode {
    if (blastRadius === null) {
        return 'BLAST_RADIUS_MISSING';
    }

    if (blastRadius >= 10) {
        return 'BLAST_RADIUS_HIGH';
    }

    if (blastRadius >= 3) {
        return 'BLAST_RADIUS_MEDIUM';
    }

    return 'BLAST_RADIUS_LOW';
}

function buildSummary(input: NormalizedInput, reasonCodes: ExplanationReasonCode[]): string {
    const base = selectBaseSummary(input.kev, input.reachable);

    const epssReason = reasonCodes[1];
    const exposureReason = reasonCodes[3];
    const confidenceReason = reasonCodes[4];
    const blastRadiusReason = reasonCodes[5];

    const epssValue = formatProbability(input.epss);
    const confidenceValue = formatProbability(input.confidenceScore);
    const blastRadiusValue = input.blastRadius === null ? 'missing' : String(input.blastRadius);
    const totalScore = formatTotalScore(input.totalScore);

    return `${base} EPSS ${epssValue} (${labelFromReason(epssReason)}); exposure ${labelFromReason(exposureReason)}; confidence ${confidenceValue} (${labelFromReason(confidenceReason)}); blast radius ${blastRadiusValue} (${labelFromReason(blastRadiusReason)}); total score ${totalScore}.`;
}

function selectBaseSummary(kev: boolean, reachable: boolean): string {
    if (kev && reachable) {
        return 'Prioritized because KEV catalog context is present and dependency-closure reachability is true.';
    }

    if (kev && !reachable) {
        return 'Prioritized because KEV catalog context is present, while dependency-closure reachability is false.';
    }

    if (!kev && reachable) {
        return 'Prioritized because dependency-closure reachability is true even without KEV catalog context.';
    }

    return 'Prioritized from non-KEV signals with dependency-closure reachability set to false.';
}

function labelFromReason(reason: ExplanationReasonCode): string {
    switch (reason) {
        case 'EPSS_HIGH':
        case 'CONFIDENCE_HIGH':
        case 'BLAST_RADIUS_HIGH':
            return 'high';
        case 'EPSS_MEDIUM':
        case 'CONFIDENCE_MEDIUM':
        case 'BLAST_RADIUS_MEDIUM':
            return 'medium';
        case 'EPSS_LOW':
        case 'CONFIDENCE_LOW':
        case 'BLAST_RADIUS_LOW':
            return 'low';
        case 'EPSS_MISSING':
        case 'CONFIDENCE_MISSING':
        case 'BLAST_RADIUS_MISSING':
        case 'EXPOSED_MISSING':
            return 'missing';
        case 'EXPOSED_TRUE':
            return 'internet-facing';
        case 'EXPOSED_FALSE':
            return 'not-internet-facing';
        case 'KEV_PRESENT':
            return 'present';
        case 'KEV_ABSENT':
            return 'absent';
        case 'REACHABLE_TRUE':
            return 'reachable';
        case 'REACHABLE_FALSE':
            return 'not-reachable';
        default:
            return 'unknown';
    }
}

function formatProbability(value: number | null): string {
    if (value === null) {
        return 'missing';
    }

    return value.toFixed(2);
}

function formatTotalScore(value: number): string {
    return value.toFixed(1);
}

function normalizeOptionalProbability(value: unknown, field: string): number | null {
    if (value === undefined || value === null) {
        return null;
    }

    if (!Number.isFinite(value)) {
        throw new ExplanationBuildError('INVALID_INPUT', `${field} must be null or a finite number.`);
    }

    const numeric = value as number;

    if (numeric < 0 || numeric > 1) {
        throw new ExplanationBuildError('INVALID_INPUT_RANGE', `${field} must be within [0, 1].`);
    }

    return numeric;
}

function normalizeOptionalBlastRadius(value: unknown, field: string): number | null {
    if (value === undefined || value === null) {
        return null;
    }

    if (!Number.isFinite(value)) {
        throw new ExplanationBuildError('INVALID_INPUT', `${field} must be null or a finite number.`);
    }

    const numeric = value as number;

    if (!Number.isInteger(numeric) || numeric < 0) {
        throw new ExplanationBuildError('INVALID_INPUT_RANGE', `${field} must be an integer >= 0.`);
    }

    return numeric;
}

function normalizeOptionalBoolean(value: unknown, field: string): boolean | null {
    if (value === undefined || value === null) {
        return null;
    }

    if (typeof value !== 'boolean') {
        throw new ExplanationBuildError('INVALID_INPUT', `${field} must be boolean or null.`);
    }

    return value;
}

function normalizeFiniteNumber(value: unknown, field: string): number {
    if (!Number.isFinite(value)) {
        throw new ExplanationBuildError('INVALID_INPUT', `${field} must be a finite number.`);
    }

    return value as number;
}

function normalizeRequiredString(value: unknown, field: string): string {
    const normalized = normalizeOptionalString(value);
    if (normalized === null) {
        throw new ExplanationBuildError('INVALID_INPUT', `${field} must be a non-empty string.`);
    }

    return normalized;
}

function normalizeOptionalString(value: unknown): string | null {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function stableHash(value: unknown): string {
    const serialized = stableStringify(value);
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;

    for (let i = 0; i < serialized.length; i += 1) {
        const charCode = serialized.charCodeAt(i);
        h1 = Math.imul(h1 ^ charCode, 2654435761);
        h2 = Math.imul(h2 ^ charCode, 1597334677);
    }

    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

function stableStringify(value: unknown): string {
    return JSON.stringify(value, (_key, nestedValue) => {
        if (Array.isArray(nestedValue)) {
            return nestedValue;
        }

        if (nestedValue && typeof nestedValue === 'object') {
            return Object.keys(nestedValue as UnknownRecord)
                .sort((a, b) => a.localeCompare(b))
                .reduce<UnknownRecord>((accumulator, key) => {
                    accumulator[key] = (nestedValue as UnknownRecord)[key];
                    return accumulator;
                }, {});
        }

        return nestedValue;
    });
}

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
