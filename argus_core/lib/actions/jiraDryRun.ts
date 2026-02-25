import { createHash } from 'node:crypto';

import { stableStringify } from '../identity';
import { writeActions } from '../data_plane/writers';
import type {
    JiraActionClient,
    JiraDryRunActionResult,
    JiraDryRunIssuePayload,
    JiraDryRunOptions,
    JiraDryRunReport,
    JiraFindingInput,
} from './types';
import {
    DEFAULT_JIRA_ISSUE_TYPE,
    DEFAULT_JIRA_PROJECT_KEY,
    DEFAULT_JIRA_TOP_N,
    JIRA_TEMPLATE_VERSION,
} from './types';

type UnknownRecord = Record<string, unknown>;

export async function generateJiraDryRunActions(
    client: JiraActionClient,
    findings: JiraFindingInput[],
    options: JiraDryRunOptions,
): Promise<JiraDryRunReport> {
    if ((options.dryRun ?? true) !== true) {
        throw new Error('Live Jira execution is disabled for hackathon dry-run mode.');
    }

    const repo = requireNonEmptyString(options.repo, 'repo');
    const buildId = requireNonEmptyString(options.buildId, 'buildId');
    const runId = normalizeString(options.runId) ?? `${repo}:${buildId}`;
    const templateVersion = normalizeString(options.templateVersion) ?? JIRA_TEMPLATE_VERSION;
    const projectKey = normalizeString(options.projectKey) ?? DEFAULT_JIRA_PROJECT_KEY;
    const issueType = normalizeString(options.issueType) ?? DEFAULT_JIRA_ISSUE_TYPE;
    const topN = normalizeTopN(options.topN);
    const attempt = normalizeAttempt(options.attempt);
    const now = Number.isFinite(options.now) ? (options.now as number) : Date.now();

    const selectedFindings = findings
        .filter((finding) => finding.repo === repo && finding.buildId === buildId)
        .sort(compareRankedFindings)
        .slice(0, topN);

    const existing = buildExistingIdempotencySet(client.list('argonaut_actions'));
    const results: JiraDryRunActionResult[] = [];
    const actionDocsToWrite: UnknownRecord[] = [];

    for (const finding of selectedFindings) {
        const payload = buildJiraDryRunPayload(finding, {
            projectKey,
            issueType,
            templateVersion,
        });
        const payloadHash = computePayloadHash(payload);
        const idempotencyKey = deriveJiraIdempotencyKey({
            repo,
            buildId,
            findingId: finding.findingId,
            templateVersion,
        });
        const actionId = idempotencyKey;
        const duplicate = existing.has(idempotencyKey);
        const status = duplicate ? 'SKIPPED_DUPLICATE' : 'DRY_RUN_READY';

        if (!duplicate) {
            actionDocsToWrite.push({
                actionId,
                runId,
                findingId: finding.findingId,
                actionType: 'JIRA_CREATE',
                status: 'DRY_RUN_READY',
                jiraKey: null,
                slackThread: null,
                idempotencyKey,
                payloadHash,
                error: null,
                createdAt: now,
                updatedAt: now,
                repo,
                buildId,
                targetSystem: 'jira',
                targetKey: null,
                templateVersion,
                payloadType: 'JIRA_ISSUE_CREATE',
                source: 'argonaut',
                attempt,
                payload,
            });
            existing.add(idempotencyKey);
        }

        results.push({
            findingId: finding.findingId,
            actionId,
            idempotencyKey,
            payloadHash,
            attempt,
            status,
            duplicate,
            payload,
        });
    }

    if (actionDocsToWrite.length > 0) {
        const report = await writeActions(client, actionDocsToWrite);
        if (report.failed > 0) {
            throw new Error(`Jira dry-run action write failed: ${report.failures.map((item) => item.message).join('; ')}`);
        }
    }

    return {
        repo,
        buildId,
        runId,
        templateVersion,
        attempt,
        projectKey,
        issueType,
        generated: results,
    };
}

export function deriveJiraIdempotencyKey(input: {
    repo: string;
    buildId: string;
    findingId: string;
    templateVersion: string;
}): string {
    const token =
        `type=JIRA_CREATE|repo=${input.repo}|buildId=${input.buildId}|findingId=${input.findingId}|templateVersion=${input.templateVersion}`;
    return sha256Hex(token);
}

function buildJiraDryRunPayload(
    finding: JiraFindingInput,
    options: {
        projectKey: string;
        issueType: string;
        templateVersion: string;
    },
): JiraDryRunIssuePayload {
    const summary = buildSummaryLine(finding);
    const description = buildDescription(finding);
    const labels = buildLabels(finding);

    return {
        templateVersion: options.templateVersion,
        targetSystem: 'jira',
        dryRun: true,
        issue: {
            projectKey: options.projectKey,
            issueType: options.issueType,
            summary,
            description,
            labels,
            assignee: null,
        },
        context: {
            findingId: finding.findingId,
            repo: finding.repo,
            buildId: finding.buildId,
        },
    };
}

function buildSummaryLine(finding: JiraFindingInput): string {
    const severity = normalizeSeverity(finding.severity);
    const packageName = normalizeString(finding.package) ?? 'unknown-package';
    const packageVersion = normalizeString(finding.version) ?? 'unknown-version';
    const ruleId = normalizeString(finding.ruleId) ?? 'unknown-rule';

    return `[${severity}] ${packageName}@${packageVersion} ${ruleId} (${finding.findingId})`;
}

function buildDescription(finding: JiraFindingInput): string {
    const threat = finding.context?.threat ?? null;
    const reachability = finding.context?.reachability ?? null;
    const confidenceValue = firstFinite(
        toFiniteNumber(reachability?.confidenceScore),
        toFiniteNumber(reachability?.confidence),
    );
    const epssValue = firstFinite(
        toFiniteNumber(threat?.epssScore),
        toFiniteNumber(threat?.epss),
    );
    const kevValue = firstBoolean(
        normalizeNullableBoolean(threat?.kevFlag),
        normalizeNullableBoolean(threat?.kev),
    );

    const sections = [
        [
            'Header',
            `findingId: ${finding.findingId}`,
            `repo: ${finding.repo}`,
            `buildId: ${finding.buildId}`,
            `severity: ${normalizeSeverity(finding.severity)}`,
            `priorityScore: ${formatNumeric(finding.priorityScore)}`,
        ],
        [
            'Evidence',
            `sourceTool: ${fallbackText(finding.tool)}`,
            `ruleId: ${fallbackText(finding.ruleId)}`,
            `filePath: ${fallbackText(finding.filePath)}`,
            `lineNumber: ${fallbackText(finding.lineNumber)}`,
        ],
        [
            'Reachability Context',
            `reachable: ${fallbackText(reachability?.reachable)}`,
            `confidenceScore: ${formatNumericOrNA(confidenceValue)}`,
            `status: ${fallbackText(reachability?.status)}`,
            `reason: ${fallbackText(reachability?.reason)}`,
            `evidencePath: ${formatPath(reachability?.evidencePath)}`,
            `analysisVersion: ${fallbackText(reachability?.analysisVersion)}`,
        ],
        [
            'Threat Context',
            `cve: ${fallbackText(firstString(normalizeString(finding.cve), normalizeString(threat?.cve)))}`,
            `epss: ${formatNumericOrNA(epssValue)}`,
            `kev: ${fallbackText(kevValue)}`,
        ],
        [
            'Score and Explanation Context',
            `priorityScore: ${formatNumeric(finding.priorityScore)}`,
            `priorityExplanation: ${fallbackText(normalizeString(finding.priorityExplanation?.summary))}`,
        ],
        [
            'Suggested Next Step',
            'Create patch/upgrade task, verify tests, and close with evidence link.',
        ],
    ];

    return normalizeMultiline(sections.map((section) => section.join('\n')).join('\n\n'));
}

function buildLabels(finding: JiraFindingInput): string[] {
    const labels = [
        'argonaut',
        `repo:${finding.repo}`,
        `build:${finding.buildId}`,
        `finding:${finding.findingId}`,
    ];

    const cve = normalizeString(finding.cve) ?? normalizeString(finding.context?.threat?.cve);
    if (cve) {
        labels.push(`cve:${cve.toUpperCase()}`);
    }

    const reachable = normalizeNullableBoolean(finding.context?.reachability?.reachable);
    if (reachable !== null) {
        labels.push(`reachable:${reachable ? 'true' : 'false'}`);
    }

    return labels;
}

function computePayloadHash(payload: JiraDryRunIssuePayload): string {
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

function compareRankedFindings(left: JiraFindingInput, right: JiraFindingInput): number {
    if (left.priorityScore !== right.priorityScore) {
        return right.priorityScore - left.priorityScore;
    }

    return left.findingId.localeCompare(right.findingId);
}

function normalizeSeverity(value: string): string {
    const normalized = value.trim().toUpperCase();
    return normalized.length > 0 ? normalized : 'UNKNOWN';
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

function formatPath(value: unknown): string {
    if (!Array.isArray(value) || value.length === 0) {
        return 'N/A';
    }

    const normalized = value
        .map((entry) => normalizeString(entry))
        .filter((entry): entry is string => entry !== null);

    if (normalized.length === 0) {
        return 'N/A';
    }

    return normalized.join(' -> ');
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

function formatNumeric(value: number): string {
    return Number.isFinite(value) ? `${value}` : 'N/A';
}

function formatNumericOrNA(value: number | null): string {
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
