import { UniversalFinding } from '../types/finding';
import { FunnelMetricsV1, ExportScope } from '../types/export';

/**
 * Hardened metrics.v1 logic for Argus Reporting.
 * Pure function, decoupled from UI hooks.
 */
export function computeFunnelMetrics(
    findings: UniversalFinding[],
    scope: ExportScope,
    fixArtifactIds: Set<string> = new Set()
): FunnelMetricsV1 {
    const population = findings;
    const totalFindings = population.length;

    // 1. Vulnerable (Critical + High)
    const vulnerableCount = population.filter(f =>
        f.severity === 'critical' || f.severity === 'high'
    ).length;

    // 2. Actionable (Reachability Check)
    const actionableCount = population.filter(f =>
        f.dependencyAnalysis?.status === 'REAL'
    ).length;

    /**
     * 3. Toil Filtered (Noise Count)
     * Hardened Taxonomy: resolution-first.
     * resolution ∈ {FALSE_POSITIVE, ACCEPTED_RISK, SUPPRESSED}
     * Note: WONT_FIX is excluded in metrics.v1 per CTO spec.
     */
    const noiseCount = population.filter(f => {
        // Priority: V2 Resolution
        if (f.state?.resolution) {
            return ['FALSE_POSITIVE', 'ACCEPTED_RISK', 'SUPPRESSED'].includes(f.state.resolution);
        }

        // Fallback: Legacy Status Shim
        // status mapping: ignored -> SUPPRESSED, risk_accepted -> ACCEPTED_RISK
        return ['ignored', 'risk_accepted', 'false_positive'].includes(f.status);
    }).length;

    // 4. Noise Reduction % (1 decimal precision)
    const noisePercent = totalFindings > 0
        ? Math.round((noiseCount / totalFindings) * 100 * 10) / 10
        : 0;

    /**
     * 5. Remediation Ready
     * logic: !!f.fixAction OR presence in fixArtifactIds Set
     */
    const remediationReady = population.filter(f =>
        !!f.fixAction || fixArtifactIds.has(f.id)
    ).length;

    return {
        metricsDefinitionVersion: 'metrics.v1',
        scope,
        totalFindings,
        vulnerableCount,
        actionableCount,
        noiseCount,
        noisePercent,
        remediationReady,
        computedAt: Date.now()
    };
}
