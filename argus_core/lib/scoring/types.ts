export type ExplanationReasonCode =
    | 'KEV_PRESENT'
    | 'KEV_ABSENT'
    | 'EPSS_HIGH'
    | 'EPSS_MEDIUM'
    | 'EPSS_LOW'
    | 'EPSS_MISSING'
    | 'REACHABLE_TRUE'
    | 'REACHABLE_FALSE'
    | 'EXPOSED_TRUE'
    | 'EXPOSED_FALSE'
    | 'EXPOSED_MISSING'
    | 'CONFIDENCE_HIGH'
    | 'CONFIDENCE_MEDIUM'
    | 'CONFIDENCE_LOW'
    | 'CONFIDENCE_MISSING'
    | 'BLAST_RADIUS_HIGH'
    | 'BLAST_RADIUS_MEDIUM'
    | 'BLAST_RADIUS_LOW'
    | 'BLAST_RADIUS_MISSING';

export interface ExplainWeights {
    exploitWeight: number;
    reachabilityWeight: number;
    exposureWeight: number;
}

export interface ExplainInputs {
    findingId: string;
    repo: string;
    buildId: string;
    kev: boolean;
    epss?: number | null;
    reachable: boolean;
    internetExposed?: boolean | null;
    confidenceScore?: number | null;
    blastRadius?: number | null;
    weights?: ExplainWeights;
    totalScore: number;
    explanationVersion?: string;
}

export interface ExplanationFactors {
    kev: boolean;
    epss: number | null;
    reachable: boolean;
    internetExposed: boolean | null;
    confidenceScore: number | null;
    blastRadius: number | null;
}

export interface ExplanationScoreBreakdown {
    exploitWeight: number;
    reachabilityWeight: number;
    exposureWeight: number;
    totalScore: number;
}

export interface Explanation {
    explanationId: string;
    findingId: string;
    repo: string;
    buildId: string;
    summary: string;
    factors: ExplanationFactors;
    scoreBreakdown: ExplanationScoreBreakdown;
    reasonCodes: ExplanationReasonCode[];
    explanationVersion: string;
    createdAt: number;
}
