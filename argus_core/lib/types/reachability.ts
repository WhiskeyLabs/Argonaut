/**
 * Reachability / Dependency Path Engine Contracts
 * Task 4.5 - Dependency Path Engine (REAL Graph)
 *
 * v0.7.5 Implementation:
 * - Focus: REAL dependency paths from package-lock.json
 * - Status: REAL | HEURISTIC | UNAVAILABLE | ERROR
 * - Provenance: Strict evidence of lockfile version & match strategy
 */

import { NormalizedSeverity } from "./research";

// ─── Core Truth Status ─────────────────────────────────────────

export type ReachabilityStatus =
    | "REAL"          // Verified path in lockfile
    | "HEURISTIC"     // Estimated via import proximity (no lockfile)
    | "NO_MATCH"      // Package not found in lockfile
    | "NO_PATH"       // Package found but no path to root
    | "UNAVAILABLE"   // No artifacts found
    | "ERROR";        // Lockfile exists but parse/query failed

export type MatchStrategy =
    | "EXACT"
    | "CLOSEST_TO_ROOT"
    | "AMBIGUOUS"
    | "NOT_FOUND";

// ─── Graph Grammar (v0.7.5) ────────────────────────────────────

export type ReachabilityNodeType =
    | "PROJECT_ROOT"
    | "DIRECT"
    | "TRANSITIVE"
    | "VULNERABLE_PACKAGE"
    | "ENTRY_POINT";

export type ReachabilityEdgeType =
    | "DEPENDS_ON"
    | "MISSING_EVIDENCE"; // Connects placeholders

export interface ReachabilityNode {
    id: string;
    type: ReachabilityNodeType;
    label: string;
    subLabel?: string;
    status: ReachabilityStatus;
    severity?: NormalizedSeverity | null; // Null for non-vuln nodes

    // Epic 6: High-fidelity metadata
    packageName?: string;
    version?: string;
    purl?: string;
    isPurlDerived?: boolean;
    depType?: 'prod' | 'dev' | 'optional';
    pathDepth?: number;
    isOnSelectedPath?: boolean;

    // Only for VULNERABLE_PACKAGE
    finding?: {
        advisoryId: string;
        severity: NormalizedSeverity;
        fixVersions?: string[];
    };

    // Detailed evidence (legacy/audit)
    evidence?: {
        version?: string;
        pathDepth?: number;
        isDevDependency?: boolean;
        isOptionalDependency?: boolean;
    };
}

export interface ReachabilityEdge {
    id: string;
    source: string;
    target: string;
    type: ReachabilityEdgeType;
    status: ReachabilityStatus;
}

// ─── Evidence & Result ─────────────────────────────────────────

export interface ReachabilityEvidence {
    // Artifact Provenance
    lockfilePresent: boolean;
    lockfileVersion?: number; // 1, 2, or 3
    lockfileHash?: string;

    // Logic Provenance
    matchStrategy: MatchStrategy;
    pathsFound: number;
    nodesAnalyzed: number;

    // Performance
    parseTimeMs: number;
    buildTimeMs: number;
    cacheHit: boolean;

    // Error Details
    error?: string;
    errorCode?: string;
}

export interface ReachabilityResult {
    // The Graph
    graph: {
        nodes: ReachabilityNode[];
        edges: ReachabilityEdge[];
    };

    // Canonical path from root → vulnerable (ordered Root -> Target)
    selectedPathNodeIds: string[];

    // Summarized counts for UI
    stats: {
        impactRadiusCount: number;
        pathLength: number;
        contextParentCount?: number;
        maxDepth?: number;
    };

    // High-level Status (for badges/metrics)
    status: ReachabilityStatus;

    // Detailed Evidence (for drawer/audit)
    evidence: ReachabilityEvidence;

    // Timestamp
    createdAt: number;
}

// ─── Research Graph ViewModel (Epic 6) ──────────────────────────

export interface DependencyGraphViewModel {
    nodes: ReachabilityNode[];
    edges: (ReachabilityEdge & {
        relationship: 'DIRECT' | 'TRANSITIVE';
        isPath: boolean;
    })[];

    metadata: {
        vulnerableNodeId: string;
        selectedPathNodeIds: string[];
        verifiedBy: 'LOCKFILE_V2' | 'LOCKFILE_V3' | 'INFERRED' | 'UNKNOWN';
        stats: {
            pathLength: number;
            maxDepth: number;
            totalNodes: number;
            impactRadiusCount: number;
        };
    };
}
