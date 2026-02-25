export interface RankedFinding {
    findingId: string;
    repo: string;
    buildId: string;
    priorityScore: number;
    explanationId: string;
    reasonCodes: string[];
}

export interface ScoreReport {
    processed: number;
    topN: RankedFinding[];
    joinWarnings: string[];
}
