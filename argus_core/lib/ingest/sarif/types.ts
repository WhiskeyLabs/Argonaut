export type NormalizedSeverity =
    | 'CRITICAL'
    | 'HIGH'
    | 'MEDIUM'
    | 'LOW'
    | 'INFO'
    | 'UNKNOWN';

export interface ParseSarifMeta {
    repo: string;
    buildId: string;
    createdAt?: number;
    defaultFilePath?: string | null;
}

export interface NormalizedFinding {
    findingId: string;
    repo: string;
    buildId: string;
    ruleId: string;
    severity: NormalizedSeverity;
    cve: string | null;
    cves: string[];
    package: string | null;
    version: string | null;
    filePath: string | null;
    lineNumber: number | null;
    tool: string;
    fingerprint: string;
    createdAt: number;
}
