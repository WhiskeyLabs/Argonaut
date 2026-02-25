/**
 * Research / Deep Dive Analysis Data Contracts
 * Epic 3 - Locked Definitions + Epic 4 Task 4.3 Context Engine
 */

import { ReachabilityResult } from './reachability';

// ... (keep existing imports if any, but we are top of file so ...)

// ─── Max constants ───────────────────────────────────────────────
/** Maximum normalized snippet length in characters (~4 KB) */
export const MAX_SNIPPET_LENGTH = 4096;

// ─── Normalized Severity (uppercase canonical) ──────────────────
export type NormalizedSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type NormalizedStatus = "OPEN" | "IGNORED" | "FIXED" | "RISK_ACCEPTED" | "FALSE_POSITIVE" | "IN_PROGRESS";

// ─── Sub-interfaces ─────────────────────────────────────────────

/** Identity block — fields that describe WHAT the finding is */
export interface ContextIdentity {
    tool: string;                  // e.g. "semgrep", "eslint"
    ruleId: string;                // Scanner-specific rule ID
    normalizedSeverity: NormalizedSeverity;
    cveId: string | null;          // CVE ID if applicable
    packageName: string | null;    // For SCA findings
    packageVersion: string | null; // e.g. "4.17.15"
    tags: string[];                // Rule tags (e.g. ["security", "OWASP"])
}

/** Location block — WHERE in the codebase */
export interface ContextLocation {
    path: string | null;
    startLine: number | null;
    endLine: number | null;        // included in hash when available
}

/** Snippet block — the raw + normalized code context */
export interface ContextSnippet {
    raw: string | null;            // Original snippet from scanner
    normalized: string | null;     // Trimmed, \r\n→\n, capped to MAX_SNIPPET_LENGTH
}

/** Meta block — session-level provenance */
export interface ContextMeta {
    sessionId: string;
    findingId: string;
    ingestionTimestamp: number;    // epoch ms — when finding was first ingested
    toolVersion: string | null;    // Scanner version if available
}

/** Availability map — explicit "what data do we actually have?" */
export interface ContextAvailability {
    hasSnippet: boolean;
    hasEndLine: boolean;
    hasCve: boolean;
    hasPackage: boolean;
    hasLockfile: boolean;          // Future: lockfile analysis
}

/**
 * ResearchContext — The single structured input to the "Brain".
 *
 * Design principles (ADR-008):
 *  - `input_hash` is computed from identity + location + normalized snippet
 *  - Events are EXCLUDED from the hash (state ≠ identity)
 *  - Availability map prevents "silent simulation" of missing data
 */
export interface ResearchContext {
    // ─── Core identity ────────────────────────────────────────
    identity: ContextIdentity;
    location: ContextLocation;
    snippet: ContextSnippet;
    meta: ContextMeta;
    availability: ContextAvailability;

    // ─── Provenance ───────────────────────────────────────────
    /** SHA-256 of canonical JSON(identity + location + snippetNormalized) */
    input_hash: string;

    // ─── Backward-compat display fields (used by existing UI) ─
    title: string;
    severity: NormalizedSeverity;
    status: NormalizedStatus;
    tool: string;               // alias of identity.tool
    cve: string | null;         // alias of identity.cveId
    packageName: string | null; // alias of identity.packageName
    stableHash: string;         // original dedupeKey from finding
    description: string;        // Finding message or rule description
    tags: string[];             // alias of identity.tags

    // ─── Reachability / Dependency Graph (Task 4.5) ──────────
    reachability?: ReachabilityResult;

    // ─── Live Analysis (Task 4.7) ──────────
    dependencyAnalysis?: {
        status: "REAL" | "UNAVAILABLE" | "ERROR";
        pathsFound: number;
        matchStrategy: "exact" | "closest_to_root" | "ambiguous" | "not_found";
        lockfileVersion?: number;
        computedAt: number;
    };

    // ─── User Overrides (Task 4.7.4) ──────────
    userOverride?: {
        priority?: "p0" | "p1" | "p2" | "p3";
        severityOverride?: "critical" | "high" | "medium" | "low" | "info";
        tags?: string[];
        classification?: "needs_review" | "false_positive" | "accepted_risk" | "compensating_control";
        rationale?: string;
        updatedAt: number;
    };

    // ─── Remediation (Task 4.7.3) ─────────────
    fixAction?: "upgrade_libraries" | "sanitize_inputs" | "config_changes" | "review_code" | "other";
    fixActionLabel?: string;

}

// REMOVED LEGACY ReachabilityGraphData, ReachabilityNode, ReachabilityEdge
// to force migration to lib/types/reachability.ts

export interface FindingRisk {
    severityScore: number; // 0.0 - 10.0
    severityLabel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
    reachability: "CONFIRMED" | "LIKELY" | "UNKNOWN" | "UNREACHABLE";
    exploitability: "KNOWN_EXPLOIT" | "NO_KNOWN_EXPLOIT" | "UNKNOWN";
    confidence: number; // 0 - 100
}

export interface ReachabilityImpact {
    entryPoint: "Internet" | "Internal" | "CI";
    vulnerableComponent: string;
    impactedServices: string[];
    controlsPresent: {
        waf?: boolean;
        auth?: boolean;
        networkSegmentation?: boolean;
    };
}


export interface FixRecommendation {
    id: string;
    type: "Upgrade" | "Config" | "Code";
    summary: string;
    patch: {
        before: string;
        after: string;
    };
    source: {
        type: "GENERAI_MODEL" | "STATIC_RULE" | "CVE_ADVISORY";
        ref: string; // Model name or Rule ID
    };
    confidence: number;
}
