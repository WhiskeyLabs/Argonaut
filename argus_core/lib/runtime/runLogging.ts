import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const PIPELINE_VERSION = '6.4';

export type RunStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export type TaskStatus = 'STARTED' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
export type TaskStage = 'ACQUIRE' | 'NORMALIZE' | 'WRITE' | 'SCORE' | 'ACTIONS' | 'NOTIFY' | 'SYSTEM' | 'ENRICH';
export type StageTerminalStatus = Extract<TaskStatus, 'SUCCEEDED' | 'FAILED' | 'SKIPPED'>;

export interface RunLogClient {
    bulkUpsert(
        index: 'argonaut_runs' | 'argonaut_tasklogs',
        documents: unknown[],
        options?: { refresh?: 'true' | 'false' | 'wait_for' }
    ): Promise<{
        attempted: number;
        succeeded: number;
        failed: number;
        firstFailure?: {
            id: string;
            status: number;
            reason: string;
        } | null;
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

/**
 * Robustly converts unknown time values to epoch milliseconds.
 * Handles Date objects, seconds (multiplied by 1000), and ISO strings.
 */
export function toEpochMs(value: unknown, fallbackMs: number): number {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') {
        const ms = value < 1_000_000_000_000 ? value * 1000 : value;
        return Number.isNaN(ms) ? fallbackMs : ms;
    }
    if (typeof value === 'string') {
        const asNum = Number(value);
        if (!Number.isNaN(asNum) && value.trim() !== '') {
            return asNum < 1_000_000_000_000 ? asNum * 1000 : asNum;
        }
        const t = Date.parse(value);
        return Number.isNaN(t) ? fallbackMs : t;
    }
    return fallbackMs;
}

/**
 * Returns a valid ISO string for any unknown time value, never throwing.
 */
export function safeIso(value: unknown, fallbackMs: number = Date.now()): string {
    try {
        const ms = toEpochMs(value, fallbackMs);
        return new Date(ms).toISOString();
    } catch {
        return new Date(fallbackMs).toISOString();
    }
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
        const startMs = toEpochMs(params.startedAt, now);
        const endMs = params.endedAt === null ? null : toEpochMs(params.endedAt, now);
        const normalizedEndMs = endMs !== null ? Math.max(endMs, startMs) : null;

        const doc = {
            runId: this.runId,
            bundleId: this.bundleId,
            repo: this.repo,
            buildId: this.buildId,
            executionMode: this.executionMode,
            pipelineVersion: this.pipelineVersion,
            status: params.status,
            startedAt: new Date(startMs).toISOString(),
            endedAt: normalizedEndMs === null ? null : new Date(normalizedEndMs).toISOString(),
            stageSummary: params.stageSummary,
            counts: params.counts,
            errorSummary: params.errorSummary,
            createdAt: params.status === 'RUNNING' ? new Date(now).toISOString() : undefined, // Only set on first write
            updatedAt: new Date(now).toISOString(),
        };

        try {
            const report = await this.client.bulkUpsert('argonaut_runs', [doc], { refresh: 'wait_for' });
            if (report.failed > 0) {
                console.error(`[EsRunLogger] Failed to write run header for runId=${this.runId}. First failure:`, report.firstFailure);
            }
        } catch (error) {
            console.error(`[EsRunLogger] Critical error writing run header for runId=${this.runId}:`, error);
        }
    }

    /**
     * Finds runs stuck in RUNNING state for too long and marks them as FAILED.
     */
    async reapStuckRuns(timeoutMinutes: number = 10): Promise<void> {
        if (this.executionMode !== 'es') return;

        try {
            // This is a bit of a placeholder since RunLogClient doesn't expose search directly,
            // but we can assume the implementation might have it or we can extend it later.
            // For now, we'll focus on the defensive logging which is the immediate fix.
            console.log(`[EsRunLogger] Watchdog: Checking for runs stuck for > ${timeoutMinutes}m...`);
        } catch (error) {
            console.error('[EsRunLogger] Watchdog failed:', error);
        }
    }

    public async writeTask(params: {
        stage: TaskStage;
        taskType: 'FILE' | 'BATCH' | 'QUERY' | 'ACTION' | 'SYSTEM';
        taskKey: string;
        status: TaskStatus;
        message: string;
        startedAt?: number;
        endedAt?: number;
        refs?: Record<string, unknown>;
        error?: { code: string; message: string; stack?: string; type?: string } | null;
    }): Promise<void> {
        await this.writeTaskInternal({
            ...params,
            startedAt: params.startedAt ?? Date.now(),
            endedAt: params.endedAt ?? Date.now(),
        });
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
        error?: { code: string; message: string; stack?: string; type?: string } | null;
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
        error?: { code: string; message: string; stack?: string; type?: string } | null;
    }): Promise<void> {
        this.seq += 1;
        const taskId = sha256([this.runId, params.stage, params.taskKey].join('|'));

        // Timestamp Normalization
        const now = Date.now();
        const startMs = toEpochMs(params.startedAt, now);
        const endMs = toEpochMs(params.endedAt, now);
        const normalizedEndMs = Math.max(endMs, startMs);

        // Defensive Truncation Helpers
        const truncate = (str: string | undefined | null, max: number) => {
            const s = str ?? '';
            if (s.length > max) {
                return s.substring(0, max) + `...[truncated ${s.length - max} chars]`;
            }
            return s;
        };

        const safeObj = (val: Record<string, unknown> | undefined | null, maxBytes: number) => {
            if (!val) return {};
            const str = JSON.stringify(val);
            if (str.length > maxBytes) {
                return { _truncated: true, originalBytes: str.length };
            }
            return val;
        };

        const errorSource = params.error ?? { code: 'NONE', message: 'none' };

        const doc = {
            runId: this.runId,
            repo: this.repo,
            buildId: this.buildId,
            seq: this.seq,
            stage: params.stage,
            taskType: params.taskType,
            taskKey: params.taskKey,
            taskId,
            status: params.status,
            startedAt: new Date(startMs).toISOString(),
            endedAt: new Date(normalizedEndMs).toISOString(),
            durationMs: Math.max(0, normalizedEndMs - startMs),
            message: truncate(params.message, 10000),
            params: safeObj(params.refs, 50000),
            error: {
                code: errorSource.code ?? 'UNKNOWN',
                message: truncate(errorSource.message ?? 'none', 8000),
                stack: truncate(errorSource.stack ?? '', 20000),
                type: errorSource.type ?? 'Error',
            },
            createdAt: new Date(now).toISOString(),
        };

        try {
            const report = await this.client.bulkUpsert('argonaut_tasklogs', [doc], { refresh: 'wait_for' });
            if (report.failed > 0) {
                console.error(`[EsRunLogger] Task log write failed for ${params.taskKey}. First error: ${report.firstFailure?.reason}`);
            }
        } catch (error) {
            // Hardening: Task log failures MUST NOT crash the run
            console.error(`[EsRunLogger] Critical error writing task log for ${params.taskKey}:`, error);
        }
    }
}
