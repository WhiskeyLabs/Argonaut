import { buildCanonicalHash } from '../../identity';
import { parseLockfile } from '../../ingest/lockfiles';
import { parseSarif } from '../../ingest/sarif';
import { parseSbom } from '../../ingest/sbom';
import { computeReachability } from '../../reachability';
import type { ElasticsearchBulkClientLike } from '../writers';
import {
    writeArtifacts,
    writeDependencies,
    writeFindings,
    writeReachability,
    writeSbom,
} from '../writers';
import { DEFAULT_THREAT_INTEL_SEED, seedThreatIntel } from '../threatintel/seed';
import { computeBundleId, loadBundleArtifacts } from './bundle';
import type { AcquireOptions, AcquireSummary, StageResult } from './types';

type UnknownRecord = Record<string, unknown>;

type ListableClient = ElasticsearchBulkClientLike & {
    count(index: 'argonaut_artifacts' | 'argonaut_findings' | 'argonaut_dependencies' | 'argonaut_sbom' | 'argonaut_reachability' | 'argonaut_threatintel' | 'argonaut_actions'): number | Promise<number>;
};

const STAGES: StageResult['stage'][] = [
    'artifacts',
    'dependencies',
    'sbom',
    'findings',
    'reachability',
    'threatIntel',
    'actions',
];

export async function runAcquirePipeline(client: ListableClient, options: AcquireOptions): Promise<AcquireSummary> {
    const startedAt = Date.now();

    const artifacts = loadBundleArtifacts(options.bundlePath);
    const bundleId = computeBundleId(options.repo, options.buildId, artifacts);
    const runId = options.runId ?? bundleId;

    const stageResults: StageResult[] = [];
    const dryRun = options.dryRun === true;

    const writeCounts = {
        artifacts: 0,
        dependencies: 0,
        sbom: 0,
        findings: 0,
        reachability: 0,
        threatIntel: 0,
    };

    const runRecord = buildRunRecord({
        bundleId,
        runId,
        options,
        stageResults,
        status: 'RUNNING',
        startedAt,
    });

    const artifactDocs = artifacts.map((artifact) => buildArtifactDoc(artifact, runId, options));

    const artifactStage = await executeStage('artifacts', async () => {
        if (dryRun) {
            return artifactDocs.length + 1;
        }

        const report = await writeArtifacts(client, [...artifactDocs, runRecord]);
        if (report.failed > 0) {
            throw new Error(report.failures.map((failure) => failure.message).join('; '));
        }

        return report.succeeded;
    });
    stageResults.push(artifactStage);
    writeCounts.artifacts = artifactStage.written;

    if (artifactStage.status === 'FAILED') {
        return finalize(client, options, bundleId, runId, stageResults, startedAt, dryRun);
    }

    const dependencyEdges = artifacts
        .filter((artifact) => artifact.type === 'lockfile')
        .flatMap((artifact) => parseLockfile(artifact.content, {
            repo: options.repo,
            buildId: options.buildId,
            sourceFile: artifact.filename,
        }))
        .map((edge) => ({
            ...edge,
            runId,
        }));

    const dependencyStage = await executeStage('dependencies', async () => {
        if (dryRun) {
            return dependencyEdges.length;
        }

        const report = await writeDependencies(client, dependencyEdges);
        if (report.failed > 0) {
            throw new Error(report.failures.map((failure) => failure.message).join('; '));
        }

        return report.succeeded;
    });
    stageResults.push(dependencyStage);
    writeCounts.dependencies = dependencyStage.written;

    if (dependencyStage.status === 'FAILED') {
        pushSkippedStages(stageResults, 'sbom');
        return finalize(client, options, bundleId, runId, stageResults, startedAt, dryRun);
    }

    const sbomComponents = artifacts
        .filter((artifact) => artifact.type === 'sbom')
        .flatMap((artifact) => parseSbom(artifact.content, {
            repo: options.repo,
            buildId: options.buildId,
            sourceFile: artifact.filename,
        }))
        .map((component) => ({
            ...component,
            runId,
        }));

    const sbomStage = await executeStage('sbom', async () => {
        if (dryRun) {
            return sbomComponents.length;
        }

        const report = await writeSbom(client, sbomComponents);
        if (report.failed > 0) {
            throw new Error(report.failures.map((failure) => failure.message).join('; '));
        }

        return report.succeeded;
    });
    stageResults.push(sbomStage);
    writeCounts.sbom = sbomStage.written;

    if (sbomStage.status === 'FAILED') {
        pushSkippedStages(stageResults, 'findings');
        return finalize(client, options, bundleId, runId, stageResults, startedAt, dryRun);
    }

    const findings = artifacts
        .filter((artifact) => artifact.type === 'sarif')
        .flatMap((artifact) => parseSarif(artifact.content, {
            repo: options.repo,
            buildId: options.buildId,
            defaultFilePath: 'fallback/file.ts',
        }))
        .map((finding) => ({
            ...finding,
            runId,
        }));

    const findingsStage = await executeStage('findings', async () => {
        if (dryRun) {
            return findings.length;
        }

        const report = await writeFindings(client, findings);
        if (report.failed > 0) {
            throw new Error(report.failures.map((failure) => failure.message).join('; '));
        }

        return report.succeeded;
    });
    stageResults.push(findingsStage);
    writeCounts.findings = findingsStage.written;

    if (findingsStage.status === 'FAILED') {
        pushSkippedStages(stageResults, 'reachability');
        return finalize(client, options, bundleId, runId, stageResults, startedAt, dryRun);
    }

    const reachability = findings.map((finding) => computeReachability({
        findingId: finding.findingId,
        repo: finding.repo,
        buildId: finding.buildId,
        targetPackage: finding.package ?? '__unknown__',
        targetVersion: finding.version,
        dependencyEdges,
        analysisVersion: '1.0',
    })).map((record) => ({
        ...record,
        runId,
    }));

    const reachabilityStage = await executeStage('reachability', async () => {
        if (dryRun) {
            return reachability.length;
        }

        const report = await writeReachability(client, reachability);
        if (report.failed > 0) {
            throw new Error(report.failures.map((failure) => failure.message).join('; '));
        }

        return report.succeeded;
    });
    stageResults.push(reachabilityStage);
    writeCounts.reachability = reachabilityStage.written;

    if (reachabilityStage.status === 'FAILED') {
        pushSkippedStages(stageResults, 'threatIntel');
        return finalize(client, options, bundleId, runId, stageResults, startedAt, dryRun);
    }

    const threatStage = await executeStage('threatIntel', async () => {
        if (dryRun) {
            return DEFAULT_THREAT_INTEL_SEED.length;
        }

        const seeded = await seedThreatIntel(client, DEFAULT_THREAT_INTEL_SEED, deterministicThreatIntelTimestamp(bundleId));
        return seeded.count;
    });
    stageResults.push(threatStage);
    writeCounts.threatIntel = threatStage.written;

    if (threatStage.status === 'FAILED') {
        pushSkippedStages(stageResults, 'actions');
        return finalize(client, options, bundleId, runId, stageResults, startedAt, dryRun);
    }

    stageResults.push({
        stage: 'actions',
        status: 'SKIPPED',
        written: 0,
        errors: [],
    });

    return finalize(client, options, bundleId, runId, stageResults, startedAt, dryRun);
}

function buildArtifactDoc(artifact: ReturnType<typeof loadBundleArtifacts>[number], runId: string, options: AcquireOptions): UnknownRecord {
    return {
        artifactId: buildCanonicalHash({
            repo: options.repo,
            buildId: options.buildId,
            runId,
            filename: artifact.filename,
            checksum: artifact.checksum,
        }),
        runId,
        repo: options.repo,
        buildId: options.buildId,
        type: artifact.type,
        sourceTool: artifact.sourceTool,
        filename: artifact.filename,
        checksum: artifact.checksum,
        ingestStatus: 'accepted',
        timestamp: Date.now(),
    };
}

function buildRunRecord(input: {
    bundleId: string;
    runId: string;
    options: AcquireOptions;
    stageResults: StageResult[];
    status: 'RUNNING' | 'SUCCESS' | 'FAILED';
    startedAt: number;
    finishedAt?: number;
}): UnknownRecord {
    return {
        artifactId: `${input.bundleId}:run`,
        runId: input.runId,
        repo: input.options.repo,
        buildId: input.options.buildId,
        type: 'bundle_run',
        sourceTool: 'acquire_pipeline',
        filename: 'bundle-run-record',
        checksum: input.bundleId,
        ingestStatus: input.status,
        timestamp: input.finishedAt ?? input.startedAt,
        bundleId: input.bundleId,
        stageResults: input.stageResults,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt ?? null,
    };
}

async function finalize(
    client: ListableClient,
    options: AcquireOptions,
    bundleId: string,
    runId: string,
    stageResults: StageResult[],
    startedAt: number,
    dryRun: boolean,
): Promise<AcquireSummary> {
    const finishedAt = Date.now();
    const status = stageResults.some((stage) => stage.status === 'FAILED') ? 'FAILED' : 'SUCCESS';

    if (!dryRun) {
        const runRecord = buildRunRecord({
            bundleId,
            runId,
            options,
            stageResults,
            status,
            startedAt,
            finishedAt,
        });

        const report = await writeArtifacts(client, [runRecord]);
        if (report.failed > 0) {
            throw new Error(`Unable to finalize run record: ${report.failures.map((failure) => failure.message).join('; ')}`);
        }
    }

    const counts = {
        argonaut_artifacts: dryRun ? 0 : await resolveCount(client.count('argonaut_artifacts')),
        argonaut_findings: dryRun ? 0 : await resolveCount(client.count('argonaut_findings')),
        argonaut_dependencies: dryRun ? 0 : await resolveCount(client.count('argonaut_dependencies')),
        argonaut_sbom: dryRun ? 0 : await resolveCount(client.count('argonaut_sbom')),
        argonaut_reachability: dryRun ? 0 : await resolveCount(client.count('argonaut_reachability')),
        argonaut_threatintel: dryRun ? 0 : await resolveCount(client.count('argonaut_threatintel')),
        argonaut_actions: dryRun ? 0 : await resolveCount(client.count('argonaut_actions')),
    };

    const summary: AcquireSummary = {
        bundleId,
        runId,
        status,
        stageResults,
        counts,
    };

    if (options.verbose) {
        summary.startedAt = startedAt;
        summary.finishedAt = finishedAt;
    }

    return summary;
}

async function executeStage(stage: StageResult['stage'], action: () => Promise<number>): Promise<StageResult> {
    try {
        const written = await action();
        return {
            stage,
            status: 'SUCCESS',
            written,
            errors: [],
        };
    } catch (error) {
        return {
            stage,
            status: 'FAILED',
            written: 0,
            errors: [error instanceof Error ? error.message : 'unknown stage failure'],
        };
    }
}

function pushSkippedStages(stageResults: StageResult[], startStage: StageResult['stage']): void {
    const startIndex = STAGES.indexOf(startStage);
    for (let i = startIndex; i < STAGES.length; i += 1) {
        const stage = STAGES[i];
        if (stageResults.some((result) => result.stage === stage)) {
            continue;
        }

        stageResults.push({
            stage,
            status: 'SKIPPED',
            written: 0,
            errors: [],
        });
    }
}

function deterministicThreatIntelTimestamp(bundleId: string): number {
    const seed = bundleId.slice(0, 12);
    const numeric = Number.parseInt(seed, 16);

    if (!Number.isFinite(numeric) || Number.isNaN(numeric)) {
        return 1700000000000;
    }

    return 1700000000000 + (numeric % 1000000);
}

async function resolveCount(value: number | Promise<number>): Promise<number> {
    return Promise.resolve(value);
}
