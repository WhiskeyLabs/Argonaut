import type { DependencyEdge } from '../ingest/lockfiles';

export type ReachabilityMethod = 'graph' | 'heuristic' | 'unavailable';

export type ReachabilityStatus = 'REACHABLE' | 'UNREACHABLE' | 'INSUFFICIENT_DATA';

export type ReachabilityReason =
    | 'PATH_FOUND'
    | 'NO_PATH'
    | 'NO_ROOT'
    | 'EMPTY_GRAPH'
    | 'TARGET_NOT_PRESENT'
    | 'VERSION_MISMATCH'
    | 'MISSING_VERSION_CONTEXT'
    | 'UNSUPPORTED_GRAPH_SHAPE';

export type ReachabilityWarningCode =
    | 'INSUFFICIENT_GRAPH_DATA'
    | 'UNSUPPORTED_GRAPH_SHAPE'
    | 'MISSING_VERSION_CONTEXT';

export interface ReachabilityInput {
    findingId: string;
    repo: string;
    buildId: string;
    targetPackage: string;
    targetVersion?: string | null;
    dependencyEdges: DependencyEdge[];
    analysisVersion?: string;
}

export interface ReachabilityResult {
    reachabilityId: string;
    findingId: string;
    repo: string;
    buildId: string;
    reachable: boolean;
    confidenceScore: number;
    confidence: number;
    evidencePath: string[];
    method: ReachabilityMethod;
    status: ReachabilityStatus;
    reason: ReachabilityReason;
    analysisVersion: string;
    computedAt: number;
}
