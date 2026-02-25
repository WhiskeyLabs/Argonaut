import { createHash } from 'node:crypto';

import { stableStringify } from '../identity';
import { writeActions } from '../data_plane/writers';
import type {
    JiraActionClient,
    SlackDryRunActionResult,
    SlackDryRunOptions,
    SlackDryRunPayload,
    SlackDryRunReport,
    SlackFindingInput,
} from './types';
import {
    DEFAULT_JIRA_TOP_N,
    DEFAULT_SLACK_CHANNEL,
    SLACK_TEMPLATE_VERSION,
} from './types';

type UnknownRecord = Record<string, unknown>;

const DEFAULT_KIBANA_DRILLDOWN_BASE = 'https://kibana.local/app/dashboards#/view/argonaut-triage';

export async function generateSlackDryRunActions(
    client: JiraActionClient,
    findings: SlackFindingInput[],
    options: SlackDryRunOptions,
): Promise<SlackDryRunReport> {
    if ((options.dryRun ?? true) !== true) {
        throw new Error('Live Slack execution is disabled for hackathon dry-run mode.');
    }

    const repo = requireNonEmptyString(options.repo, 'repo');
    const buildId = requireNonEmptyString(options.buildId, 'buildId');
    const runId = normalizeString(options.runId) ?? `${repo}:${buildId}`;
    const templateVersion = normalizeString(options.templateVersion) ?? SLACK_TEMPLATE_VERSION;
    const channel = normalizeString(options.channel) ?? DEFAULT_SLACK_CHANNEL;
    const includeThreads = options.includeThreads ?? true;
    const topN = normalizeTopN(options.topN);
    const attempt = normalizeAttempt(options.attempt);
    const now = Number.isFinite(options.now) ? (options.now as number) : Date.now();
    const kibanaBaseUrl = normalizeString(options.kibanaBaseUrl) ?? DEFAULT_KIBANA_DRILLDOWN_BASE;

    const selected = findings
        .filter((finding) => finding.repo === repo && finding.buildId === buildId)
        .sort(compareRankedFindings)
        .slice(0, topN);

    const selectedFindingIds = selected.map((finding) => finding.findingId);
    const topNHash = sha256Hex(selectedFindingIds.join('|'));
    const existing = buildExistingIdempotencySet(client.list('argonaut_actions'));
    const results: SlackDryRunActionResult[] = [];
    const docsToWrite: UnknownRecord[] = [];

    const summaryPayload = buildSummaryPayload({
        repo,
        buildId,
        channel,
        templateVersion,
        findings: selected,
    });
    const summaryIdempotencyKey = deriveSlackSummaryIdempotencyKey({
        repo,
        buildId,
        topNHash,
        templateVersion,
    });

    pushActionResult({
        actionType: 'SLACK_SUMMARY',
        findingId: null,
        idempotencyKey: summaryIdempotencyKey,
        payload: summaryPayload,
        runId,
        repo,
        buildId,
        now,
        existing,
        results,
        docsToWrite,
        attempt,
        extraFields: {
            findingIds: [...selectedFindingIds].sort((left, right) => left.localeCompare(right)),
            topNHash,
        },
    });

    if (includeThreads) {
        for (const finding of selected) {
            const payload = buildThreadPayload({
                finding,
                channel,
                templateVersion,
                drilldownUrl: buildDrilldownUrl(kibanaBaseUrl, repo, buildId, finding.findingId),
                summaryActionId: summaryIdempotencyKey,
            });
            const idempotencyKey = deriveSlackThreadIdempotencyKey({
                repo,
                buildId,
                findingId: finding.findingId,
                templateVersion,
            });

            pushActionResult({
                actionType: 'SLACK_THREAD',
                findingId: finding.findingId,
                idempotencyKey,
                payload,
                runId,
                repo,
                buildId,
                now,
                existing,
                results,
                docsToWrite,
                attempt,
            });
        }
    }

    if (docsToWrite.length > 0) {
        const report = await writeActions(client, docsToWrite);
        if (report.failed > 0) {
            throw new Error(`Slack dry-run action write failed: ${report.failures.map((item) => item.message).join('; ')}`);
        }
    }

    return {
        repo,
        buildId,
        runId,
        templateVersion,
        attempt,
        generated: results,
    };
}

export function deriveSlackSummaryIdempotencyKey(input: {
    repo: string;
    buildId: string;
    topNHash: string;
    templateVersion: string;
}): string {
    const token =
        `type=SLACK_SUMMARY|repo=${input.repo}|buildId=${input.buildId}|topNHash=${input.topNHash}|templateVersion=${input.templateVersion}`;
    return sha256Hex(token);
}

export function deriveSlackThreadIdempotencyKey(input: {
    repo: string;
    buildId: string;
    findingId: string;
    templateVersion: string;
}): string {
    const token =
        `type=SLACK_THREAD|repo=${input.repo}|buildId=${input.buildId}|findingId=${input.findingId}|templateVersion=${input.templateVersion}`;
    return sha256Hex(token);
}

function pushActionResult(input: {
    actionType: 'SLACK_SUMMARY' | 'SLACK_THREAD';
    findingId: string | null;
    idempotencyKey: string;
    payload: SlackDryRunPayload;
    runId: string;
    repo: string;
    buildId: string;
    now: number;
    existing: Set<string>;
    results: SlackDryRunActionResult[];
    docsToWrite: UnknownRecord[];
    attempt: number;
    extraFields?: UnknownRecord;
}): void {
    const payloadHash = computePayloadHash(input.payload);
    const actionId = input.idempotencyKey;
    const duplicate = input.existing.has(input.idempotencyKey);
    const status = duplicate ? 'SKIPPED_DUPLICATE' : 'DRY_RUN_READY';

    if (!duplicate) {
        input.docsToWrite.push({
            actionId,
            runId: input.runId,
            findingId: input.findingId,
            actionType: input.actionType,
            status: 'DRY_RUN_READY',
            jiraKey: null,
            slackThread: null,
            idempotencyKey: input.idempotencyKey,
            payloadHash,
            error: null,
            createdAt: input.now,
            updatedAt: input.now,
            repo: input.repo,
            buildId: input.buildId,
            targetSystem: 'slack',
            targetKey: null,
            templateVersion: input.payload.templateVersion,
            payloadType: input.payload.payloadType,
            source: 'argonaut',
            attempt: input.attempt,
            payload: input.payload,
            ...(input.extraFields ?? {}),
        });
        input.existing.add(input.idempotencyKey);
    }

    input.results.push({
        actionId,
        idempotencyKey: input.idempotencyKey,
        payloadHash,
        attempt: input.attempt,
        status,
        duplicate,
        actionType: input.actionType,
        findingId: input.findingId,
        payload: input.payload,
    });
}

function buildSummaryPayload(input: {
    repo: string;
    buildId: string;
    channel: string;
    templateVersion: string;
    findings: SlackFindingInput[];
}): SlackDryRunPayload {
    const findingIds = input.findings.map((finding) => finding.findingId);

    const blocks = [
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: `Argonaut Dry-Run: ${input.repo} build ${input.buildId}`,
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `Top ${input.findings.length} findings (priorityScore DESC, findingId ASC).`,
            },
        },
        ...input.findings.map((finding) => ({
            type: 'section' as const,
            text: {
                type: 'mrkdwn' as const,
                text: `*${finding.findingId}*\\n${buildRationaleLine(finding)}`,
            },
        })),
        {
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: `templateVersion=${input.templateVersion}`,
                },
            ],
        },
    ];

    if (blocks.length > 12) {
        throw new Error(`Slack summary block budget exceeded: ${blocks.length} > 12`);
    }

    return {
        templateVersion: input.templateVersion,
        targetSystem: 'slack',
        dryRun: true,
        payloadType: 'SLACK_SUMMARY',
        channel: input.channel,
        threadTs: null,
        text: `Argonaut dry-run summary for ${input.repo} build ${input.buildId}`,
        blocks,
        context: {
            repo: input.repo,
            buildId: input.buildId,
            findingIds,
        },
    };
}

function buildThreadPayload(input: {
    finding: SlackFindingInput;
    channel: string;
    templateVersion: string;
    drilldownUrl: string;
    summaryActionId: string;
}): SlackDryRunPayload {
    const blocks = [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `Thread detail for *${input.finding.findingId}*`,
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: buildRationaleLine(input.finding),
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `Action intent: dry-run only, no outbound Slack call.`,
            },
        },
        {
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: `Drilldown: ${input.drilldownUrl}`,
                },
                {
                    type: 'mrkdwn',
                    text: `summaryActionId=${input.summaryActionId}`,
                },
            ],
        },
    ];

    if (blocks.length > 6) {
        throw new Error(`Slack thread block budget exceeded: ${blocks.length} > 6`);
    }

    return {
        templateVersion: input.templateVersion,
        targetSystem: 'slack',
        dryRun: true,
        payloadType: 'SLACK_THREAD',
        channel: input.channel,
        threadTs: input.summaryActionId,
        text: `Argonaut dry-run thread for ${input.finding.findingId}`,
        blocks,
        context: {
            repo: input.finding.repo,
            buildId: input.finding.buildId,
            findingIds: [input.finding.findingId],
        },
    };
}

function buildRationaleLine(finding: SlackFindingInput): string {
    const threat = finding.context?.threat ?? null;
    const reachability = finding.context?.reachability ?? null;

    const reachable = formatBoolean(firstBoolean(
        normalizeNullableBoolean(reachability?.reachable),
    ));
    const confidence = formatNumberOrNA(firstFinite(
        toFiniteNumber(reachability?.confidenceScore),
        toFiniteNumber(reachability?.confidence),
    ));
    const kev = formatBoolean(firstBoolean(
        normalizeNullableBoolean(threat?.kevFlag),
        normalizeNullableBoolean(threat?.kev),
    ));
    const epss = formatNumberOrNA(firstFinite(
        toFiniteNumber(threat?.epssScore),
        toFiniteNumber(threat?.epss),
    ));
    const cve = fallbackText(firstString(normalizeString(finding.cve), normalizeString(threat?.cve)));
    const analysisVersion = fallbackText(normalizeString(reachability?.analysisVersion));

    return `Score ${finding.priorityScore} | Reachable=${reachable} (conf=${confidence}) | KEV=${kev} | EPSS=${epss} | CVE=${cve} | AV=${analysisVersion}`;
}

function buildDrilldownUrl(base: string, repo: string, buildId: string, findingId: string): string {
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}repo=${encodeURIComponent(repo)}&buildId=${encodeURIComponent(buildId)}&findingId=${encodeURIComponent(findingId)}`;
}

function computePayloadHash(payload: SlackDryRunPayload): string {
    const normalized = normalizePayloadValue(payload);
    const canonicalJson = stableStringify(normalized);
    return sha256Hex(canonicalJson);
}

function normalizePayloadValue(value: unknown): unknown {
    if (typeof value === 'string') {
        return normalizeMultiline(value);
    }

    if (Array.isArray(value)) {
        return value.map((entry) => normalizePayloadValue(entry));
    }

    if (value && typeof value === 'object') {
        const record = value as UnknownRecord;
        const keys = Object.keys(record).sort((left, right) => left.localeCompare(right));
        return keys.reduce<UnknownRecord>((acc, key) => {
            acc[key] = normalizePayloadValue(record[key]);
            return acc;
        }, {});
    }

    return value;
}

function buildExistingIdempotencySet(actions: Array<{ id: string; source: UnknownRecord }>): Set<string> {
    const output = new Set<string>();

    for (const action of actions) {
        const fromSource = normalizeString(action.source.idempotencyKey);
        if (fromSource) {
            output.add(fromSource);
            continue;
        }

        const fromId = normalizeString(action.id);
        if (fromId) {
            output.add(fromId);
        }
    }

    return output;
}

function compareRankedFindings(left: SlackFindingInput, right: SlackFindingInput): number {
    if (left.priorityScore !== right.priorityScore) {
        return right.priorityScore - left.priorityScore;
    }

    return left.findingId.localeCompare(right.findingId);
}

function normalizeTopN(value: number | undefined): number {
    if (!Number.isFinite(value)) {
        return DEFAULT_JIRA_TOP_N;
    }

    const parsed = Math.trunc(value as number);
    if (parsed <= 0) {
        return DEFAULT_JIRA_TOP_N;
    }

    return parsed;
}

function normalizeAttempt(value: number | undefined): number {
    if (!Number.isFinite(value)) {
        return 1;
    }

    const parsed = Math.trunc(value as number);
    if (parsed <= 0) {
        throw new Error('attempt must be a positive integer.');
    }

    return parsed;
}

function normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function normalizeNullableBoolean(value: unknown): boolean | null {
    if (typeof value !== 'boolean') {
        return null;
    }

    return value;
}

function toFiniteNumber(value: unknown): number | null {
    if (!Number.isFinite(value)) {
        return null;
    }

    return value as number;
}

function firstFinite(...values: Array<number | null>): number | null {
    for (const value of values) {
        if (value !== null) {
            return value;
        }
    }

    return null;
}

function firstBoolean(...values: Array<boolean | null>): boolean | null {
    for (const value of values) {
        if (value !== null) {
            return value;
        }
    }

    return null;
}

function firstString(...values: Array<string | null>): string | null {
    for (const value of values) {
        if (value) {
            return value;
        }
    }

    return null;
}

function fallbackText(value: unknown): string {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? `${value}` : 'N/A';
    }

    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }

    const normalized = normalizeString(value);
    return normalized ?? 'N/A';
}

function formatBoolean(value: boolean | null): string {
    if (value === null) {
        return 'N/A';
    }

    return value ? 'true' : 'false';
}

function formatNumberOrNA(value: number | null): string {
    if (value === null) {
        return 'N/A';
    }

    return `${value}`;
}

function normalizeMultiline(value: string): string {
    const withNewlines = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return withNewlines
        .split('\n')
        .map((line) => line.replace(/[ \t]+$/g, ''))
        .join('\n');
}

function requireNonEmptyString(value: string, field: string): string {
    const normalized = normalizeString(value);
    if (!normalized) {
        throw new Error(`${field} must be a non-empty string.`);
    }

    return normalized;
}

function sha256Hex(input: string): string {
    return createHash('sha256').update(input, 'utf8').digest('hex');
}
