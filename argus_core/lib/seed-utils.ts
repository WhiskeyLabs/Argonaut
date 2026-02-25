import { db } from './db/index';
import { UniversalFinding, Severity, FindingStatus } from './types/finding';
import { v4 as uuidv4 } from 'uuid';

export async function seedDemoSession(sessionId: string) {
    const findings: UniversalFinding[] = [];
    const tools = ['eslint', 'semgrep', 'trivy', 'gitleaks'];

    // Create 100 mock findings
    for (let i = 0; i < 100; i++) {
        const severityStr = ['critical', 'high', 'medium', 'low', 'info'][i % 5] as Severity;
        const statusStr = ['open', 'fixed', 'ignored', 'snoozed'][i % 4] as FindingStatus;
        const tool = tools[i % tools.length];

        // Severity Rank
        const ranks: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

        findings.push({
            id: uuidv4(),
            ruleId: `RULE-${1000 + i}`,
            title: `Mock Vulnerability ${i}: ${tool.toUpperCase()} Issue`,
            description: `This is a simulated finding to test the grid virtualization and reachability grouping logic. Index: ${i}`,
            severity: severityStr,
            status: statusStr,
            sessionId: sessionId,
            packageName: i % 3 === 0 ? 'react' : 'express',
            dedupeKey: `dedupe-${i}`,
            messageFingerprint: `fingerprint-${i}`,
            toolId: tool,
            severityRank: ranks[severityStr],
            location: {
                filepath: `src/components/Component${i % 10}.tsx`,
                startLine: 10 + i,
                endLine: 15 + i
            },
            tool: tool,
            tags: ['mock', 'security', 'demo'],
            // Mock Reachability signals for Epic 2.5
            reachability: i % 10 === 0 ? 'reachable' : 'unreachable',
            // Action grouping for Dashboard
            fixAction: (['Upgrade Libraries', 'Sanitize Inputs', 'Config Changes', 'Review Code'] as const)[i % 4]
        });
    }

    // Clear existing for this session to avoid dups if re-seeded
    await db.findings.where('sessionId').equals(sessionId).delete();

    // Bulk Add
    await db.findings.bulkAdd(findings);
    console.log(`Seeded ${findings.length} findings for session ${sessionId}`);
}
