import { db } from '@/lib/db';
import { UniversalFinding, Severity, FindingStatus } from '@/lib/types/finding';

export function useFindingTriage() {

    const updateSeverity = async (finding: UniversalFinding, newSeverity: Severity) => {
        await db.findings.update(finding.id, {
            severity: newSeverity,
            userOverride: {
                ...finding.userOverride,
                severityOverride: newSeverity,
                updatedAt: Date.now()
            }
        });
    };

    const updateStatus = async (finding: UniversalFinding, newStatus: FindingStatus) => {
        let classification: "needs_review" | "false_positive" | "accepted_risk" | "compensating_control" | undefined = undefined;

        if (newStatus === 'false_positive') classification = 'false_positive';
        if (newStatus === 'risk_accepted') classification = 'accepted_risk';
        if (newStatus === 'in_progress') classification = 'needs_review';

        await db.findings.update(finding.id, {
            status: newStatus,
            userOverride: {
                ...finding.userOverride,
                classification: classification,
                updatedAt: Date.now()
            }
        });
    };

    return {
        updateSeverity,
        updateStatus
    };
}
