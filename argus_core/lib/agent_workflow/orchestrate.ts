import { generateJiraDryRunActions, generateSlackDryRunActions } from '../actions';
import { validateToolSchemas } from '../agent_tools';
import { enrichFindingsContext, runAcquirePipeline } from '../data_plane/pipeline';
import { scoreAndWriteback } from '../data_plane/scoring';
import type { AgentWorkflowClient, AgentWorkflowOptions, ScoreStageOutput, WorkflowActionSummary, WorkflowErrorCode, WorkflowRunSummary, WorkflowStageContext, WorkflowStageName, WorkflowStageTrace } from './types';

type UnknownRecord = Record<string, unknown>;

const STAGE_ORDER: WorkflowStageName[] = ['Acquire', 'Enrich', 'Score', 'Act'];
const DEFAULT_TOP_N = 5;

export async function runAgentWorkflow(client: AgentWorkflowClient, options: AgentWorkflowOptions): Promise<WorkflowRunSummary> {
    const startedAt = Date.now();
    const runId = normalizeString(options.runId) ?? `${options.repo}:${options.buildId}`;
    const topN = normalizeTopN(options.topN);

    const stageContext: WorkflowStageContext = {
        repo: options.repo,
        buildId: options.buildId,
        runId,
        startedAt,
    };

    const traces: WorkflowStageTrace[] = [];
    const actions: WorkflowActionSummary[] = [];
    let topFindings: Array<{ findingId: string; priorityScore: number }> = [];

    if (options.validateTools ?? true) {
        const toolFailures = validateToolSchemas();
        if (toolFailures.length > 0) {
            const failed = buildFailedStage(stageContext, 'Acquire', 'acquire', 'E_TOOL_SCHEMA_INVALID', toolFailures.join('; '), {});
            traces.push(failed);
            traces.push(...buildSkippedStages(stageContext, 'Enrich'));
            return finalize(stageContext, 'FAILED', traces, topFindings, actions);
        }
    }

    const acquireResult = await runAcquireStage(client, options, stageContext);
    traces.push(acquireResult.trace);
    if (acquireResult.trace.status === 'FAILED') {
        traces.push(...buildSkippedStages(stageContext, 'Enrich'));
        return finalize(stageContext, 'FAILED', traces, topFindings, actions);
    }

    const enrichResult = await runEnrichStage(client, stageContext);
    traces.push(enrichResult.trace);
    if (enrichResult.trace.status === 'FAILED') {
        traces.push(...buildSkippedStages(stageContext, 'Score'));
        return finalize(stageContext, 'FAILED', traces, topFindings, actions);
    }

    const scoreResult = await runScoreStage(client, stageContext, topN);
    traces.push(scoreResult.trace);
    if (scoreResult.trace.status === 'FAILED' || !scoreResult.output) {
        traces.push(...buildSkippedStages(stageContext, 'Act'));
        return finalize(stageContext, 'FAILED', traces, topFindings, actions);
    }

    topFindings = scoreResult.output.topN
        .map((item) => ({
            findingId: item.findingId,
            priorityScore: item.priorityScore,
        }))
        .sort(compareTopFindings);

    const actResult = await runActStage(client, stageContext, {
        topFindings: scoreResult.output.topN,
        dryRun: options.dryRun ?? true,
        includeSlackThreads: options.includeSlackThreads ?? true,
        topN,
        now: options.now,
        kibanaBaseUrl: options.kibanaBaseUrl,
    });
    traces.push(actResult.trace);
    actions.push(...actResult.actions);

    if (actResult.trace.status === 'FAILED') {
        return finalize(stageContext, 'FAILED', traces, topFindings, actions);
    }

    return finalize(stageContext, 'SUCCESS', traces, topFindings, actions);
}

async function runAcquireStage(client: AgentWorkflowClient, options: AgentWorkflowOptions, context: WorkflowStageContext): Promise<{ trace: WorkflowStageTrace }> {
    const startedAt = Date.now();

    try {
        const summary = await runAcquirePipeline(client, {
            repo: options.repo,
            buildId: options.buildId,
            runId: context.runId,
            bundlePath: options.bundlePath,
            // Workflow orchestration requires indexed state for downstream stages.
            // Keep Acquire deterministic but persisted, while action stage remains dry-run by default.
            dryRun: false,
            verbose: false,
        });

        if (summary.status !== 'SUCCESS') {
            return {
                trace: buildFailedStage(context, 'Acquire', 'acquire', 'E_ACQUIRE_PIPELINE_FAILED', 'Acquire pipeline returned FAILED status.', {
                    artifacts: summary.counts.argonaut_artifacts,
                }, startedAt),
            };
        }

        const stageWritten = (name: 'artifacts' | 'findings' | 'dependencies' | 'sbom' | 'reachability' | 'threatIntel') => {
            const matched = summary.stageResults.find((stage) => stage.stage === name);
            return matched?.written ?? 0;
        };

        const artifactsCount = summary.counts.argonaut_artifacts > 0
            ? summary.counts.argonaut_artifacts
            : stageWritten('artifacts');

        if (artifactsCount <= 0) {
            return {
                trace: buildFailedStage(context, 'Acquire', 'acquire', 'E_ACQUIRE_MISSING_ARTIFACTS', 'No artifacts indexed for workflow run.', {
                    artifacts: artifactsCount,
                }, startedAt),
            };
        }

        const trace = buildSuccessStage(context, 'Acquire', 'acquire', {
            artifacts: artifactsCount,
            findings: summary.counts.argonaut_findings > 0 ? summary.counts.argonaut_findings : stageWritten('findings'),
            dependencies: summary.counts.argonaut_dependencies > 0 ? summary.counts.argonaut_dependencies : stageWritten('dependencies'),
            sbom: summary.counts.argonaut_sbom > 0 ? summary.counts.argonaut_sbom : stageWritten('sbom'),
            reachability: summary.counts.argonaut_reachability > 0 ? summary.counts.argonaut_reachability : stageWritten('reachability'),
            threatIntel: summary.counts.argonaut_threatintel > 0 ? summary.counts.argonaut_threatintel : stageWritten('threatIntel'),
        }, [summary.bundleId, summary.runId], startedAt);

        return { trace };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown acquire pipeline failure';
        return {
            trace: buildFailedStage(context, 'Acquire', 'acquire', 'E_ACQUIRE_PIPELINE_FAILED', message, {}, startedAt),
        };
    }
}

async function runEnrichStage(client: AgentWorkflowClient, context: WorkflowStageContext): Promise<{ trace: WorkflowStageTrace }> {
    const startedAt = Date.now();

    try {
        const summary = await enrichFindingsContext(client);

        const reachabilityDocs = client.list('argonaut_reachability')
            .map((item) => item.source)
            .filter((item) => normalizeString(item.repo) === context.repo && normalizeString(item.buildId) === context.buildId);

        if (reachabilityDocs.length === 0) {
            return {
                trace: buildFailedStage(context, 'Enrich', 'enrich', 'E_ENRICH_NO_REACHABILITY', 'No reachability records found for repo/build.', {
                    processed: summary.processed,
                }, startedAt),
            };
        }

        const findingIds = client.list('argonaut_findings')
            .map((entry) => entry.source)
            .filter((item) => normalizeString(item.repo) === context.repo && normalizeString(item.buildId) === context.buildId)
            .map((item) => normalizeString(item.findingId))
            .filter((value): value is string => value !== null)
            .sort((left, right) => left.localeCompare(right))
            .slice(0, 10);

        const trace = buildSuccessStage(context, 'Enrich', 'enrich', {
            processed: summary.processed,
            warnings: summary.warnings.length,
            reachabilityDocs: reachabilityDocs.length,
        }, findingIds, startedAt);

        return { trace };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown enrich failure';
        return {
            trace: buildFailedStage(context, 'Enrich', 'enrich', 'E_ENRICH_NO_REACHABILITY', message, {}, startedAt),
        };
    }
}

async function runScoreStage(client: AgentWorkflowClient, context: WorkflowStageContext, topN: number): Promise<{ trace: WorkflowStageTrace; output: ScoreStageOutput | null }> {
    const startedAt = Date.now();

    try {
        const summary = await scoreAndWriteback(client, topN);
        const scopedRanked = client.list('argonaut_findings')
            .map((entry) => entry.source)
            .filter((item) => normalizeString(item.repo) === context.repo && normalizeString(item.buildId) === context.buildId)
            .map((item) => {
                const findingId = normalizeString(item.findingId);
                const priorityScore = normalizeNumber(item.priorityScore);
                const explanation = toRecord(item.priorityExplanation);
                if (!findingId || priorityScore === null) {
                    return null;
                }

                const reasonCodes = Array.isArray(explanation?.reasonCodes)
                    ? explanation.reasonCodes
                        .map((value) => normalizeString(value))
                        .filter((value): value is string => value !== null)
                    : [];

                return {
                    findingId,
                    repo: context.repo,
                    buildId: context.buildId,
                    priorityScore,
                    explanationId: normalizeString(explanation?.explanationId),
                    reasonCodes,
                } satisfies ScoreStageOutput['topN'][number];
            })
            .filter((item): item is ScoreStageOutput['topN'][number] => item !== null)
            .sort((left, right) => {
                if (left.priorityScore !== right.priorityScore) {
                    return right.priorityScore - left.priorityScore;
                }

                return left.findingId.localeCompare(right.findingId);
            });

        const scopedTopN = scopedRanked.slice(0, topN);

        if (scopedTopN.length === 0) {
            return {
                trace: buildFailedStage(context, 'Score', 'score', 'E_SCORE_EMPTY_RANKING', 'Score stage returned empty ranking.', {
                    processed: scopedRanked.length,
                }, startedAt),
                output: null,
            };
        }

        const trace = buildSuccessStage(context, 'Score', 'score', {
            processed: scopedRanked.length,
            topN: scopedTopN.length,
            joinWarnings: summary.joinWarnings.length,
        }, scopedTopN.map((item) => item.findingId), startedAt);

        return {
            trace,
            output: {
                processed: scopedRanked.length,
                topN: scopedTopN,
                joinWarnings: summary.joinWarnings,
            },
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown score failure';
        return {
            trace: buildFailedStage(context, 'Score', 'score', 'E_SCORE_EMPTY_RANKING', message, {}, startedAt),
            output: null,
        };
    }
}

async function runActStage(
    client: AgentWorkflowClient,
    context: WorkflowStageContext,
    options: {
        topFindings: ScoreStageOutput['topN'];
        dryRun: boolean;
        includeSlackThreads: boolean;
        topN: number;
        now?: number;
        kibanaBaseUrl?: string;
    },
): Promise<{ trace: WorkflowStageTrace; actions: WorkflowActionSummary[] }> {
    const startedAt = Date.now();

    try {
        const findingLookup = buildFindingLookup(client, context);
        const findingInputs = options.topFindings
            .map((ranked) => findingLookup.get(ranked.findingId))
            .filter((value): value is UnknownRecord => value !== undefined);

        if (findingInputs.length === 0) {
            return {
                trace: buildFailedStage(context, 'Act', 'jira,slack', 'E_ACTION_WRITE_BLOCKED', 'No findings available for action stage.', {}, startedAt),
                actions: [],
            };
        }

        const jiraReport = await generateJiraDryRunActions(client, findingInputs.map(toJiraFindingInput), {
            repo: context.repo,
            buildId: context.buildId,
            runId: context.runId,
            dryRun: options.dryRun,
            topN: options.topN,
            now: options.now,
        });

        const slackReport = await generateSlackDryRunActions(client, findingInputs.map(toSlackFindingInput), {
            repo: context.repo,
            buildId: context.buildId,
            runId: context.runId,
            dryRun: options.dryRun,
            includeThreads: options.includeSlackThreads,
            topN: options.topN,
            now: options.now,
            kibanaBaseUrl: options.kibanaBaseUrl,
        });

        const actions = [
            ...jiraReport.generated.map<WorkflowActionSummary>((item) => ({
                actionId: item.actionId,
                findingId: item.findingId,
                actionType: 'JIRA_CREATE',
                status: item.status,
            })),
            ...slackReport.generated.map<WorkflowActionSummary>((item) => ({
                actionId: item.actionId,
                findingId: item.findingId,
                actionType: item.actionType,
                status: item.status,
            })),
        ].sort(compareActions);

        const trace = buildSuccessStage(context, 'Act', 'jira,slack', {
            jiraActions: jiraReport.generated.length,
            slackActions: slackReport.generated.length,
            totalActions: actions.length,
        }, actions.map((item) => item.actionId), startedAt);

        return {
            trace,
            actions,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown action stage failure';
        return {
            trace: buildFailedStage(context, 'Act', 'jira,slack', 'E_ACTION_WRITE_BLOCKED', message, {}, startedAt),
            actions: [],
        };
    }
}

function buildFindingLookup(client: AgentWorkflowClient, context: WorkflowStageContext): Map<string, UnknownRecord> {
    const map = new Map<string, UnknownRecord>();

    for (const entry of client.list('argonaut_findings')) {
        const finding = entry.source;
        if (normalizeString(finding.repo) !== context.repo || normalizeString(finding.buildId) !== context.buildId) {
            continue;
        }

        const findingId = normalizeString(finding.findingId);
        if (!findingId) {
            continue;
        }

        map.set(findingId, finding);
    }

    return map;
}

function toJiraFindingInput(finding: UnknownRecord) {
    return {
        findingId: requiredString(finding.findingId, 'findingId'),
        repo: requiredString(finding.repo, 'repo'),
        buildId: requiredString(finding.buildId, 'buildId'),
        severity: normalizeString(finding.severity) ?? 'UNKNOWN',
        ruleId: normalizeString(finding.ruleId) ?? 'UNKNOWN_RULE',
        package: normalizeString(finding.package),
        version: normalizeString(finding.version),
        cve: normalizeString(finding.cve),
        priorityScore: normalizeNumber(finding.priorityScore) ?? 0,
        priorityExplanation: toPriorityExplanation(finding.priorityExplanation),
        tool: normalizeString(finding.tool),
        filePath: normalizeString(finding.filePath),
        lineNumber: normalizeInteger(finding.lineNumber),
        context: toActionContext(finding.context),
    };
}

function toSlackFindingInput(finding: UnknownRecord) {
    return {
        findingId: requiredString(finding.findingId, 'findingId'),
        repo: requiredString(finding.repo, 'repo'),
        buildId: requiredString(finding.buildId, 'buildId'),
        priorityScore: normalizeNumber(finding.priorityScore) ?? 0,
        cve: normalizeString(finding.cve),
        context: toActionContext(finding.context),
    };
}

function toPriorityExplanation(value: unknown): { summary?: string | null } | null {
    const record = toRecord(value);
    if (!record) {
        return null;
    }

    return {
        summary: normalizeString(record.summary),
    };
}

function toActionContext(value: unknown): { threat?: UnknownRecord | null; reachability?: UnknownRecord | null } | null {
    const record = toRecord(value);
    if (!record) {
        return null;
    }

    return {
        threat: toRecord(record.threat),
        reachability: toRecord(record.reachability),
    };
}

function buildSuccessStage(
    context: WorkflowStageContext,
    name: WorkflowStageName,
    toolCallLabel: string,
    counts: Record<string, number>,
    keyIds: string[],
    startedAt = Date.now(),
): WorkflowStageTrace {
    return {
        name,
        attempt: 1,
        status: 'SUCCESS',
        errorCode: null,
        message: null,
        counts,
        keyIds: sortUniqueStrings(keyIds),
        toolCalls: sortUniqueStrings(toolCallLabel.split(',').map((value) => value.trim()).filter((value) => value.length > 0)),
        startedAt,
        finishedAt: Date.now(),
    };
}

function buildFailedStage(
    context: WorkflowStageContext,
    name: WorkflowStageName,
    toolCallLabel: string,
    errorCode: WorkflowErrorCode,
    message: string,
    counts: Record<string, number>,
    startedAt = Date.now(),
): WorkflowStageTrace {
    return {
        name,
        attempt: 1,
        status: 'FAILED',
        errorCode,
        message,
        counts,
        keyIds: [],
        toolCalls: sortUniqueStrings(toolCallLabel.split(',').map((value) => value.trim()).filter((value) => value.length > 0)),
        startedAt,
        finishedAt: Date.now(),
    };
}

function buildSkippedStages(context: WorkflowStageContext, fromStage: WorkflowStageName): WorkflowStageTrace[] {
    const fromIndex = STAGE_ORDER.indexOf(fromStage);
    if (fromIndex < 0) {
        return [];
    }

    return STAGE_ORDER.slice(fromIndex).map((name) => ({
        name,
        attempt: 0,
        status: 'SKIPPED',
        errorCode: null,
        message: null,
        counts: {},
        keyIds: [],
        toolCalls: [],
        startedAt: Date.now(),
        finishedAt: Date.now(),
    }));
}

function finalize(
    context: WorkflowStageContext,
    status: 'SUCCESS' | 'FAILED',
    stages: WorkflowStageTrace[],
    topFindings: Array<{ findingId: string; priorityScore: number }>,
    actions: WorkflowActionSummary[],
): WorkflowRunSummary {
    return {
        runId: context.runId,
        repo: context.repo,
        buildId: context.buildId,
        status,
        stages,
        topFindings: [...topFindings].sort(compareTopFindings),
        actions: [...actions].sort(compareActions),
        startedAt: context.startedAt,
        finishedAt: Date.now(),
    };
}

function compareActions(left: WorkflowActionSummary, right: WorkflowActionSummary): number {
    const byType = left.actionType.localeCompare(right.actionType);
    if (byType !== 0) {
        return byType;
    }

    const leftFinding = left.findingId ?? '';
    const rightFinding = right.findingId ?? '';
    const byFinding = leftFinding.localeCompare(rightFinding);
    if (byFinding !== 0) {
        return byFinding;
    }

    return left.actionId.localeCompare(right.actionId);
}

function compareTopFindings(left: { findingId: string; priorityScore: number }, right: { findingId: string; priorityScore: number }): number {
    if (left.priorityScore !== right.priorityScore) {
        return right.priorityScore - left.priorityScore;
    }

    return left.findingId.localeCompare(right.findingId);
}

function sortUniqueStrings(values: string[]): string[] {
    return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function normalizeTopN(value: number | undefined): number {
    if (!Number.isFinite(value)) {
        return DEFAULT_TOP_N;
    }

    const parsed = Math.trunc(value as number);
    return parsed >= 0 ? parsed : DEFAULT_TOP_N;
}

function requiredString(value: unknown, field: string): string {
    const normalized = normalizeString(value);
    if (!normalized) {
        throw new Error(`Missing required field: ${field}`);
    }

    return normalized;
}

function normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function normalizeNumber(value: unknown): number | null {
    if (!Number.isFinite(value)) {
        return null;
    }

    return value as number;
}

function normalizeInteger(value: unknown): number | null {
    if (!Number.isInteger(value)) {
        return null;
    }

    return value as number;
}

function toRecord(value: unknown): UnknownRecord | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }

    return value as UnknownRecord;
}
