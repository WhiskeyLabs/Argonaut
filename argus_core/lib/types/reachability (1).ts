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
    | "DIRECT_DEP"
    | "TRANSITIVE_DEP"
    | "VULNERABLE_PACKAGE"
    | "ENTRY_SURFACE_PLACEHOLDER"; // Visual anchor for Gen2 (UNAVAILABLE)

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

    // Detailed evidence on hover/click
    evidence?: {
        version?: string;
        pathDepth?: number;
        isDevDependency?: boolean;
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

    // High-level Status (for badges/metrics)
    status: ReachabilityStatus;

    // Detailed Evidence (for drawer/audit)
    evidence: ReachabilityEvidence;

    // Timestamp
    createdAt: number;
}
