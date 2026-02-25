import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const PIPELINE_VERSION = '6.4';

export type RunStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export type TaskStatus = 'STARTED' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
export type TaskStage = 'ACQUIRE' | 'NORMALIZE' | 'WRITE' | 'SCORE' | 'ACTIONS' | 'NOTIFY' | 'SYSTEM' | 'ENRICH';
export type StageTerminalStatus = Extract<TaskStatus, 'SUCCEEDED' | 'FAILED' | 'SKIPPED'>;

export interface RunLogClient {
    bulkUpsert(index: 'argonaut_runs' | 'argonaut_tasklogs', documents: unknown[]): Promise<{
        attempted: number;
        succeeded: number;
        failed: number;
    }>;
}

export function sha256(input: string | Buffer): string {
    return crypto.createHash('sha256').update(input).digest('hex');
}

export function computeCanonicalBundleHash(bundlePath: string): string {
    const files = fs.readdirSync(bundlePath)
        .map((entry) => path.join(bundlePath, entry))
        .filter((entry) => fs.statSync(entry).isFile())
        .sort((a, b) => a.localeCompare(b));

    const hashes = files
        .map((filePath) => sha256(fs.readFileSync(filePath)))
        .sort((a, b) => a.localeCompare(b));

    return sha256(hashes.join(''));
}

export function computeRunId(input: {
    repo: string;
    buildId: string;
    bundleId: string;
    canonicalBundleHash: string;
    pipelineVersion?: string;
}): string {
    const payload = [
        input.repo,
        input.buildId,
        input.bundleId,
        input.canonicalBundleHash,
        input.pipelineVersion ?? PIPELINE_VERSION,
    ].join('|');

    return sha256(payload);
}

export class EsRunLogger {
    private readonly client: RunLogClient;
    private readonly runId: string;
    private readonly repo: string;
    private readonly buildId: string;
    private readonly bundleId: string;
    private readonly executionMode: 'es' | 'memory';
    private readonly pipelineVersion: string;
    private seq = 0;

    constructor(params: {
        client: RunLogClient;
        runId: string;
        repo: string;
        buildId: string;
        bundleId: string;
        executionMode: 'es' | 'memory';
        pipelineVersion?: string;
    }) {
        this.client = params.client;
        this.runId = params.runId;
        this.repo = params.repo;
        this.buildId = params.buildId;
        this.bundleId = params.bundleId;
        this.executionMode = params.executionMode;
        this.pipelineVersion = params.pipelineVersion ?? PIPELINE_VERSION;
    }

    async writeRun(params: {
        status: RunStatus;
        startedAt: number;
        endedAt: number | null;
        stageSummary: Record<string, unknown>;
        counts: Record<string, unknown>;
        errorSummary: Record<string, unknown> | null;
    }): Promise<void> {
        const now = Date.now();
        const doc = {
            runId: this.runId,
            bundleId: this.bundleId,
            repo: this.repo,
            buildId: this.buildId,
            executionMode: this.executionMode,
            pipelineVersion: this.pipelineVersion,
            status: params.status,
            startedAt: new Date(params.startedAt).toISOString(),
            endedAt: params.endedAt === null ? null : new Date(params.endedAt).toISOString(),
            stageSummary: params.stageSummary,
            counts: params.counts,
            errorSummary: params.errorSummary,
            createdAt: new Date(now).toISOString(),
        };

        const report = await this.client.bulkUpsert('argonaut_runs', [doc]);
        if (report.failed > 0) {
            throw new Error(`Failed to write run header for runId=${this.runId}.`);
        }
    }

    async writeTask(params: {
        stage: TaskStage;
        taskType: 'FILE' | 'BATCH' | 'QUERY' | 'ACTION' | 'SYSTEM';
        taskKey: string;
        status: TaskStatus;
        message: string;
        startedAt: number;
        endedAt: number;
        refs?: Record<string, unknown>;
        error?: { code: string; message: string } | null;
    }): Promise<void> {
        await this.writeTaskInternal(params);
    }

    async writeStageStart(params: {
        stage: TaskStage;
        startedAt: number;
        refs?: Record<string, unknown>;
    }): Promise<void> {
        await this.writeTaskInternal({
            stage: params.stage,
            taskType: 'SYSTEM',
            taskKey: `${params.stage.toLowerCase()}.stage.start`,
            status: 'STARTED',
            message: `${params.stage} stage started`,
            startedAt: params.startedAt,
            endedAt: params.startedAt,
            refs: params.refs ?? {},
            error: null,
        });
    }

    async writeStageTerminal(params: {
        stage: TaskStage;
        status: StageTerminalStatus;
        startedAt: number;
        endedAt: number;
        refs?: Record<string, unknown>;
        error?: { code: string; message: string } | null;
    }): Promise<void> {
        await this.writeTaskInternal({
            stage: params.stage,
            taskType: 'SYSTEM',
            taskKey: `${params.stage.toLowerCase()}.stage.end`,
            status: params.status,
            message: `${params.stage} stage ${params.status.toLowerCase()}`,
            startedAt: params.startedAt,
            endedAt: params.endedAt,
            refs: params.refs ?? {},
            error: params.error ?? null,
        });
    }

    private async writeTaskInternal(params: {
        stage: TaskStage;
        taskType: 'FILE' | 'BATCH' | 'QUERY' | 'ACTION' | 'SYSTEM';
        taskKey: string;
        status: TaskStatus;
        message: string;
        startedAt: number;
        endedAt: number;
        refs?: Record<string, unknown>;
        error?: { code: string; message: string } | null;
    }): Promise<void> {
        this.seq += 1;
        const taskId = sha256([this.runId, params.stage, params.taskKey].join('|'));

        const doc = {
            runId: this.runId,
            seq: this.seq,
            stage: params.stage,
            taskType: params.taskType,
            taskKey: params.taskKey,
            taskId,
            status: params.status,
            startedAt: new Date(params.startedAt).toISOString(),
            endedAt: new Date(params.endedAt).toISOString(),
            durationMs: Math.max(0, params.endedAt - params.startedAt),
            message: params.message,
            refs: params.refs ?? {},
            error: params.error ?? { code: 'NONE', message: 'none' },
            createdAt: new Date(Date.now()).toISOString(),
        };

        const report = await this.client.bulkUpsert('argonaut_tasklogs', [doc]);
        if (report.failed > 0) {
            throw new Error(`Failed to write task log for runId=${this.runId} taskKey=${params.taskKey}.`);
        }
    }
}
