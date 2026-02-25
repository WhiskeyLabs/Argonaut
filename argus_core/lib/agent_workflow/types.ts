import type { RankedFinding } from '../data_plane/scoring';
import type { ActionAuditStatus } from '../actions';

export type WorkflowStageName = 'Acquire' | 'Enrich' | 'Score' | 'Act';

export type WorkflowStageStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';

export type WorkflowErrorCode =
    | 'E_ACQUIRE_MISSING_ARTIFACTS'
    | 'E_ACQUIRE_PIPELINE_FAILED'
    | 'E_ENRICH_NO_REACHABILITY'
    | 'E_SCORE_EMPTY_RANKING'
    | 'E_ACTION_WRITE_BLOCKED'
    | 'E_TOOL_SCHEMA_INVALID';

export interface WorkflowStageTrace {
    name: WorkflowStageName;
    attempt: number;
    status: WorkflowStageStatus;
    errorCode: WorkflowErrorCode | null;
    message: string | null;
    counts: Record<string, number>;
    keyIds: string[];
    toolCalls: string[];
    startedAt: number;
    finishedAt: number;
}

export interface WorkflowActionSummary {
    actionId: string;
    findingId: string | null;
    actionType: 'JIRA_CREATE' | 'SLACK_SUMMARY' | 'SLACK_THREAD';
    status: ActionAuditStatus;
}

export interface WorkflowRunSummary {
    runId: string;
    repo: string;
    buildId: string;
    status: 'SUCCESS' | 'FAILED';
    stages: WorkflowStageTrace[];
    topFindings: Array<{
        findingId: string;
        priorityScore: number;
    }>;
    actions: WorkflowActionSummary[];
    startedAt: number;
    finishedAt: number;
}

export interface AgentWorkflowOptions {
    repo: string;
    buildId: string;
    bundlePath: string;
    runId?: string;
    topN?: number;
    dryRun?: boolean;
    includeSlackThreads?: boolean;
    now?: number;
    validateTools?: boolean;
    kibanaBaseUrl?: string;
}

export interface AgentWorkflowClient {
    count(index: 'argonaut_artifacts' | 'argonaut_findings' | 'argonaut_dependencies' | 'argonaut_sbom' | 'argonaut_reachability' | 'argonaut_threatintel' | 'argonaut_actions'): number;
    list(index: 'argonaut_findings' | 'argonaut_reachability' | 'argonaut_actions' | 'argonaut_artifacts' | 'argonaut_dependencies' | 'argonaut_sbom' | 'argonaut_threatintel'): Array<{ id: string; source: Record<string, unknown> }>;
    bulk(params: { operations: Array<Record<string, unknown>>; refresh?: 'true' | 'false' | 'wait_for' }): Promise<unknown>;
}

export interface WorkflowStageContext {
    repo: string;
    buildId: string;
    runId: string;
    startedAt: number;
}

export interface ScoreStageOutput {
    topN: RankedFinding[];
    processed: number;
    joinWarnings: string[];
}
