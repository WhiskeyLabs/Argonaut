/**
 * Fix Engine Types (Epic 7 Task 7.8)
 *
 * Defines the canonical FixInput_v1 for deterministic patch generation.
 */

import { ResearchContext } from './research';

export interface FixInput_v1 {
    findingId: string;
    // Finding doc fields needed for fix
    identity: {
        cveId: string | null;
        packageName: string | null;
        packageVersion: string | null;
        tool: string;
        ruleId: string;
    };
    location: {
        path: string | null;
        startLine: number | null;
        endLine: number | null;
    };
    snippet: {
        normalized: string | null;
    };
    // Reachability evidence (minimal path/call chain)
    reachability: {
        status: string;
        selectedPathNodeIds: string[];
    };
    // Dependency/lockfile evidence
    dependencyEvidence: {
        lockfileVersion?: number;
        vulnerableDependency?: string;
    };
}

/**
 * Construct the canonical FixInput_v1 from a ResearchContext.
 * Explicitly excludes non-deterministic fields like threat intel or timestamps.
 */
export function buildFixInput(context: ResearchContext): FixInput_v1 {
    return {
        findingId: context.meta.findingId,
        identity: {
            cveId: context.identity.cveId,
            packageName: context.identity.packageName,
            packageVersion: context.identity.packageVersion,
            tool: context.identity.tool,
            ruleId: context.identity.ruleId,
        },
        location: {
            path: context.location.path,
            startLine: context.location.startLine,
            endLine: context.location.endLine,
        },
        snippet: {
            normalized: context.snippet.normalized,
        },
        reachability: {
            status: context.reachability?.status || 'UNKNOWN',
            selectedPathNodeIds: context.reachability?.selectedPathNodeIds || [],
        },
        dependencyEvidence: {
            lockfileVersion: context.dependencyAnalysis?.lockfileVersion,
            vulnerableDependency: context.identity.packageName || undefined,
        },
    };
}
