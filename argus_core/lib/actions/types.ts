import type { ElasticsearchBulkClientLike } from '../data_plane/writers';

export const JIRA_TEMPLATE_VERSION = '1.0';
export const SLACK_TEMPLATE_VERSION = '1.0';
export const DEFAULT_JIRA_PROJECT_KEY = 'ARG';
export const DEFAULT_JIRA_ISSUE_TYPE = 'Bug';
export const DEFAULT_JIRA_TOP_N = 5;
export const DEFAULT_SLACK_CHANNEL = '#argonaut-security';

export type ActionAuditStatus = 'DRY_RUN_READY' | 'SKIPPED_DUPLICATE' | 'FAILED_VALIDATION';

export interface FindingThreatContext {
    kev?: boolean | null;
    kevFlag?: boolean | null;
    epss?: number | null;
    epssScore?: number | null;
    cve?: string | null;
}

export interface FindingReachabilityContext {
    reachable?: boolean | null;
    confidence?: number | null;
    confidenceScore?: number | null;
    status?: string | null;
    reason?: string | null;
    evidencePath?: string[] | null;
    analysisVersion?: string | null;
}

export interface JiraFindingInput {
    findingId: string;
    repo: string;
    buildId: string;
    severity: string;
    ruleId: string;
    package: string | null;
    version: string | null;
    cve: string | null;
    priorityScore: number;
    priorityExplanation?: { summary?: string | null } | null;
    tool?: string | null;
    filePath?: string | null;
    lineNumber?: number | null;
    context?: {
        threat?: FindingThreatContext | null;
        reachability?: FindingReachabilityContext | null;
    } | null;
}

export interface JiraDryRunIssuePayload {
    templateVersion: string;
    targetSystem: 'jira';
    dryRun: true;
    issue: {
        projectKey: string;
        issueType: string;
        summary: string;
        description: string;
        labels: string[];
        assignee: string | null;
    };
    context: {
        findingId: string;
        repo: string;
        buildId: string;
    };
}

export interface JiraDryRunActionResult {
    findingId: string;
    actionId: string;
    idempotencyKey: string;
    payloadHash: string;
    attempt: number;
    status: ActionAuditStatus;
    duplicate: boolean;
    payload: JiraDryRunIssuePayload;
}

export interface JiraDryRunReport {
    repo: string;
    buildId: string;
    runId: string;
    templateVersion: string;
    attempt: number;
    projectKey: string;
    issueType: string;
    generated: JiraDryRunActionResult[];
}

export interface JiraDryRunOptions {
    repo: string;
    buildId: string;
    runId?: string;
    templateVersion?: string;
    projectKey?: string;
    issueType?: string;
    dryRun?: boolean;
    topN?: number;
    attempt?: number;
    now?: number;
}

export interface SlackDryRunBlockText {
    type: 'mrkdwn' | 'plain_text';
    text: string;
}

export interface SlackDryRunBlock {
    type: 'header' | 'section' | 'context';
    text?: SlackDryRunBlockText;
    elements?: SlackDryRunBlockText[];
}

export interface SlackFindingInput {
    findingId: string;
    repo: string;
    buildId: string;
    priorityScore: number;
    cve: string | null;
    context?: {
        threat?: FindingThreatContext | null;
        reachability?: FindingReachabilityContext | null;
    } | null;
}

export interface SlackDryRunPayload {
    templateVersion: string;
    targetSystem: 'slack';
    dryRun: true;
    payloadType: 'SLACK_SUMMARY' | 'SLACK_THREAD';
    channel: string;
    threadTs: string | null;
    text: string;
    blocks: SlackDryRunBlock[];
    context: {
        repo: string;
        buildId: string;
        findingIds: string[];
    };
}

export interface SlackDryRunActionResult {
    actionId: string;
    idempotencyKey: string;
    payloadHash: string;
    attempt: number;
    status: ActionAuditStatus;
    duplicate: boolean;
    actionType: 'SLACK_SUMMARY' | 'SLACK_THREAD';
    findingId: string | null;
    payload: SlackDryRunPayload;
}

export interface SlackDryRunReport {
    repo: string;
    buildId: string;
    runId: string;
    templateVersion: string;
    attempt: number;
    generated: SlackDryRunActionResult[];
}

export interface SlackDryRunOptions {
    repo: string;
    buildId: string;
    runId?: string;
    templateVersion?: string;
    dryRun?: boolean;
    topN?: number;
    includeThreads?: boolean;
    attempt?: number;
    channel?: string;
    kibanaBaseUrl?: string;
    now?: number;
}

export interface ActionListEntry {
    id: string;
    source: Record<string, unknown>;
}

export interface JiraActionClient extends ElasticsearchBulkClientLike {
    list(index: 'argonaut_actions'): ActionListEntry[];
}
