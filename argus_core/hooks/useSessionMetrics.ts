import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { UniversalFinding } from '@/lib/types/finding';

export interface SessionMetrics {
    totalFindings: number;
    criticalParams: {
        count: number;
        delta: number; // Placeholder for now, can be computed from history later
    };
    dependencyLinked: {
        count: number;
        percent: number;
    };
    noiseReduction: {
        count: number;
        percent: number;
    };
    remediation: {
        ready: number;
        applied: number;
    };
    vulnerableCount: number; // High + Critical
}

export function useSessionMetrics(sessionId?: string) {
    const metrics = useLiveQuery(async () => {
        if (!sessionId) return null;

        const findings = await db.findings.where('sessionId').equals(sessionId).toArray();
        if (!findings) return null;

        const total = findings.length;

        // 1. Critical
        const criticalCount = findings.filter(f => f.severity === 'critical').length;

        // 2. Dependency Linked (Real)
        const linkedCount = findings.filter(f =>
            f.dependencyAnalysis?.status === 'REAL'
        ).length;

        // 3. Noise (Ignored, False Positive, Risk Accepted)
        const noiseCount = findings.filter(f =>
            ['ignored', 'false_positive', 'risk_accepted'].includes(f.status)
        ).length;

        // 4. Vulnerable (High + Critical) for Funnel
        const vulnerableCount = findings.filter(f =>
            f.severity === 'critical' || f.severity === 'high'
        ).length;

        // 5. Remediation (Has fixAction)
        const remediationReady = findings.filter(f => !!f.fixAction).length;

        return {
            totalFindings: total,
            criticalParams: {
                count: criticalCount,
                delta: 0 // Not yet implemented
            },
            dependencyLinked: {
                count: linkedCount,
                percent: total > 0 ? Math.round((linkedCount / total) * 100) : 0
            },
            noiseReduction: {
                count: noiseCount,
                percent: total > 0 ? Math.round((noiseCount / total) * 100) : 0
            },
            remediation: {
                ready: remediationReady,
                applied: 0 // Not yet implemented
            },
            vulnerableCount
        };
    }, [sessionId]);

    return metrics || {
        totalFindings: 0,
        criticalParams: { count: 0, delta: 0 },
        dependencyLinked: { count: 0, percent: 0 },
        noiseReduction: { count: 0, percent: 0 },
        remediation: { ready: 0, applied: 0 },
        vulnerableCount: 0
    };
}
