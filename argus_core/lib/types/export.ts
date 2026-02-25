import { FindingStatusV2, Resolution, Severity, UniversalFinding } from './finding';

export type ExportScope = 'SESSION' | 'CURRENT_VIEW';
export type PdfType = 'EXECUTIVE' | 'ENGINEER';

export interface FunnelMetricsV1 {
    metricsDefinitionVersion: 'metrics.v1';
    scope: ExportScope;
    totalFindings: number;
    vulnerableCount: number;        // severity in {critical, high}
    actionableCount: number;        // dependencyAnalysis.status === 'REAL'
    noiseCount: number;             // resolution-based
    noisePercent: number;           // noiseCount/totalFindings*100 rounded to 1 decimal
    remediationReady: number;       // has fixAction OR has fixArtifact
    computedAt: number;             // export time
}

export interface BoundedAuditLogItem {
    timestamp: number;
    action: string;
    actor: string;
    reason?: string;
    diff?: Record<string, any>;
}

export interface ExportModel {
    schemaVersion: 'export.v1';
    projectId?: string;
    sessionId: string;
    exportedAt: number;
    argusVersion: string;

    view: {
        scope: ExportScope;
        filters: any; // Opaque for now, matches UI filter state
        sort: any;
    };

    funnelMetrics: {
        session: FunnelMetricsV1;
        currentView?: FunnelMetricsV1;
    };

    findings: UniversalFinding[];

    // Bounded audit logs: Map findingId -> last N events
    auditSummary: Record<string, BoundedAuditLogItem[]>;

    sourceSarif: {
        filename: string;
        sha256: string;
        artifactType: 'SARIF';
    };
}
