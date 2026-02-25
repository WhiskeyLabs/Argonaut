export interface ParseSbomMeta {
    repo: string;
    buildId: string;
    createdAt?: number;
    sourceFile?: string;
    deriveEcosystemFromPurl?: boolean;
}

export interface SbomComponent {
    componentId: string;
    repo: string;
    buildId: string;
    component: string;
    version: string | null;
    license: string | null;
    supplier: string | null;
    hash: string | null;
    purl: string | null;
    bomRef: string | null;
    bomFormatVersion: string | null;
    ecosystem: string | null;
    sourceFile: string;
    createdAt: number;
}

export type SbomWarningCode = 'UNSUPPORTED_FORMAT' | 'UNSUPPORTED_VERSION' | 'UNSUPPORTED_STRUCTURE';
