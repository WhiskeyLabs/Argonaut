import type { ArgonautIndexName } from '../mappings';

export type ArtifactType = 'sarif' | 'lockfile' | 'sbom' | 'other';

export interface BundleArtifact {
    filename: string;
    filePath: string;
    content: string;
    checksum: string;
    type: ArtifactType;
    sourceTool: string;
}

export type PipelineStageName =
    | 'artifacts'
    | 'dependencies'
    | 'sbom'
    | 'findings'
    | 'reachability'
    | 'threatIntel'
    | 'actions';

export interface StageResult {
    stage: PipelineStageName;
    status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
    written: number;
    errors: string[];
}

export interface AcquireOptions {
    repo: string;
    buildId: string;
    bundlePath: string;
    runId?: string;
    dryRun?: boolean;
    verbose?: boolean;
}

export interface AcquireSummary {
    bundleId: string;
    runId: string;
    status: 'SUCCESS' | 'FAILED';
    stageResults: StageResult[];
    counts: Record<ArgonautIndexName, number>;
    startedAt?: number;
    finishedAt?: number;
}
