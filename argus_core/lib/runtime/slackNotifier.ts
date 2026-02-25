import { buildCanonicalHash } from '../identity';
import { writeActions } from '../data_plane/writers';
import type { ElasticsearchBulkClientLike } from '../data_plane/writers';

type UnknownRecord = Record<string, unknown>;

export type SlackLifecycleEventType = 'created' | 'status_changed' | 'run.failed';

export interface SlackLifecycleEvent {
    eventType: SlackLifecycleEventType;
    runId: string;
    repo: string;
    buildId: string;
    stage?: string | null;
    status?: string | null;
    message?: string | null;
    pipelineVersion?: string | null;
    executionMode?: 'es' | 'memory' | null;
}

export interface SlackNotifierOptions {
    mode?: string;
    webhookUrl?: string | null;
    channel?: string;
    templateVersion?: string;
    attempt?: number;
    now?: () => number;
    fetchImpl?: typeof fetch;
}

export interface SlackNotifierResult {
    actionId: string;
    idempotencyKey: string;
    payloadHash: string;
    duplicate: boolean;
    posted: boolean;
    status: 'DRY_RUN_READY' | 'SKIPPED_DUPLICATE' | 'EXECUTED' | 'FAILED_VALIDATION';
    actionType: 'SLACK_LIFECYCLE';
}

type ReadableActionsClient = ElasticsearchBulkClientLike & {
    getById?: (index: 'argonaut_actions', id: string) => Promise<UnknownRecord | null>;
};

const DEFAULT_CHANNEL = '#argonaut-security';
const DEFAULT_TEMPLATE_VERSION = '1.0';

export class SlackNotifier {
    private readonly client: ReadableActionsClient;
    private readonly mode: 'dry-run' | 'enabled';
    private readonly webhookUrl: string | null;
    private readonly channel: string;
    private readonly templateVersion: string;
    private readonly attempt: number;
    private readonly now: () => number;
    private readonly fetchImpl: typeof fetch;

    constructor(client: ReadableActionsClient, options: SlackNotifierOptions = {}) {
        this.client = client;
        this.mode = normalizeMode(options.mode ?? process.env.SLACK_MODE);
        this.webhookUrl = normalizeNullableString(options.webhookUrl ?? process.env.SLACK_WEBHOOK_URL);
        this.channel = normalizeNullableString(options.channel ?? process.env.SLACK_CHANNEL) ?? DEFAULT_CHANNEL;
        this.templateVersion = normalizeNullableString(options.templateVersion) ?? DEFAULT_TEMPLATE_VERSION;
        this.attempt = Number.isInteger(options.attempt) && (options.attempt as number) > 0 ? (options.attempt as number) : 1;
        this.now = options.now ?? (() => Date.now());
        this.fetchImpl = options.fetchImpl ?? fetch;
    }

    async notifyLifecycle(event: SlackLifecycleEvent): Promise<SlackNotifierResult> {
        const normalizedEvent = normalizeEvent(event);
        const idempotencyKey = buildCanonicalHash({
            type: 'SLACK_LIFECYCLE',
            repo: normalizedEvent.repo,
            buildId: normalizedEvent.buildId,
            runId: normalizedEvent.runId,
            eventType: normalizedEvent.eventType,
            stage: normalizedEvent.stage,
            status: normalizedEvent.status,
            templateVersion: this.templateVersion,
        });

        const existing = await this.tryGetAction(idempotencyKey);
        if (existing) {
            return {
                actionId: idempotencyKey,
                idempotencyKey,
                payloadHash: normalizeNullableString(existing.payloadHash) ?? buildCanonicalHash({ existing: true, idempotencyKey }),
                duplicate: true,
                posted: false,
                status: 'SKIPPED_DUPLICATE',
                actionType: 'SLACK_LIFECYCLE',
            };
        }

        const payload = buildPayload(normalizedEvent, this.channel, this.templateVersion, this.mode === 'dry-run');
        const payloadHash = buildCanonicalHash(payload);
        const timestamp = this.now();

        let actionStatus: SlackNotifierResult['status'] = 'DRY_RUN_READY';
        let posted = false;
        let errorMessage: string | null = null;

        if (this.mode === 'enabled') {
            if (!this.webhookUrl) {
                actionStatus = 'FAILED_VALIDATION';
                errorMessage = 'SLACK_MODE=enabled requires SLACK_WEBHOOK_URL.';
            } else {
                await postWebhook(this.fetchImpl, this.webhookUrl, payload);
                actionStatus = 'EXECUTED';
                posted = true;
            }
        }

        const doc = {
            actionId: idempotencyKey,
            idempotencyKey,
            actionType: 'SLACK_LIFECYCLE',
            status: actionStatus,
            runId: normalizedEvent.runId,
            repo: normalizedEvent.repo,
            buildId: normalizedEvent.buildId,
            findingId: null,
            payloadHash,
            payloadType: 'SLACK_LIFECYCLE',
            targetSystem: 'slack',
            targetKey: this.mode === 'enabled' ? 'webhook' : null,
            source: 'argonaut',
            attempt: this.attempt,
            templateVersion: this.templateVersion,
            createdAt: timestamp,
            updatedAt: timestamp,
            error: errorMessage,
            payload,
        };

        const report = await writeActions(this.client, [doc]);
        if (report.failed > 0) {
            const message = report.failures.map((failure) => failure.message).join('; ');
            throw new Error(`Slack lifecycle action write failed: ${message}`);
        }

        return {
            actionId: idempotencyKey,
            idempotencyKey,
            payloadHash,
            duplicate: false,
            posted,
            status: actionStatus,
            actionType: 'SLACK_LIFECYCLE',
        };
    }

    private async tryGetAction(actionId: string): Promise<UnknownRecord | null> {
        if (!this.client.getById) {
            return null;
        }

        try {
            return await this.client.getById('argonaut_actions', actionId);
        } catch (_error) {
            return null;
        }
    }
}

async function postWebhook(fetchImpl: typeof fetch, webhookUrl: string, payload: UnknownRecord): Promise<void> {
    const response = await fetchImpl(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            text: payload.text,
            blocks: payload.blocks,
            channel: payload.channel,
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Slack webhook call failed: status=${response.status} body=${text}`);
    }
}

function normalizeEvent(event: SlackLifecycleEvent): Required<Omit<SlackLifecycleEvent, 'message' | 'pipelineVersion' | 'executionMode'>> & {
    message: string | null;
    pipelineVersion: string | null;
    executionMode: string | null;
} {
    const eventType = normalizeEventType(event.eventType);
    const runId = requireString(event.runId, 'runId');
    const repo = requireString(event.repo, 'repo');
    const buildId = requireString(event.buildId, 'buildId');

    return {
        eventType,
        runId,
        repo,
        buildId,
        stage: normalizeNullableString(event.stage) ?? null,
        status: normalizeNullableString(event.status) ?? null,
        message: normalizeNullableString(event.message) ?? null,
        pipelineVersion: normalizeNullableString(event.pipelineVersion) ?? null,
        executionMode: normalizeNullableString(event.executionMode) ?? null,
    };
}

function buildPayload(
    event: ReturnType<typeof normalizeEvent>,
    channel: string,
    templateVersion: string,
    dryRun: boolean,
): UnknownRecord {
    const summary = `[LIFECYCLE] ${event.eventType} run=${event.runId} stage=${event.stage ?? 'N/A'} status=${event.status ?? 'N/A'}`;

    return {
        templateVersion,
        targetSystem: 'slack',
        dryRun,
        payloadType: 'SLACK_LIFECYCLE',
        channel,
        text: summary,
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: summary,
                },
            },
            {
                type: 'context',
                elements: [
                    { type: 'mrkdwn', text: `repo=${event.repo}` },
                    { type: 'mrkdwn', text: `buildId=${event.buildId}` },
                    { type: 'mrkdwn', text: `event=${event.eventType}` },
                ],
            },
        ],
        context: {
            runId: event.runId,
            repo: event.repo,
            buildId: event.buildId,
            stage: event.stage,
            status: event.status,
            pipelineVersion: event.pipelineVersion,
            executionMode: event.executionMode,
            message: event.message,
        },
    };
}

function normalizeMode(value: string | undefined): 'dry-run' | 'enabled' {
    const normalized = normalizeNullableString(value);
    if (!normalized) {
        return 'dry-run';
    }

    return normalized.toLowerCase() === 'enabled' ? 'enabled' : 'dry-run';
}

function normalizeEventType(value: unknown): SlackLifecycleEventType {
    const normalized = normalizeNullableString(value);
    if (normalized === 'created' || normalized === 'status_changed' || normalized === 'run.failed') {
        return normalized;
    }

    throw new Error(`Unsupported Slack lifecycle event type: ${String(value)}`);
}

function requireString(value: unknown, field: string): string {
    const normalized = normalizeNullableString(value);
    if (!normalized) {
        throw new Error(`${field} is required.`);
    }

    return normalized;
}

function normalizeNullableString(value: unknown): string | null {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
