/**
 * Fix Agent Types
 *
 * Types for the Agent Builder AI Agent → Fix Worker pipeline.
 * Uses only existing argonaut_actions mapped fields.
 */

export type FixRequestStatus = 'NEW' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
export type FixBundleStatus = 'CREATED' | 'EXISTS' | 'FAILED';
export type FixRequestSource = 'agent_builder' | 'console';

/** Written by Console API when Agent Builder AI Agent (or user) requests fix generation */
export interface FixRequestAction {
    actionType: 'FIX_REQUEST';
    runId: string;
    findingIds: string[];
    status: FixRequestStatus;
    idempotencyKey: string;       // FIX_REQUEST:<runId>:<requestHash>
    payloadHash: string;          // <requestHash>
    source: FixRequestSource;     // agent attribution
    templateVersion: string;      // <agentId> when agent-triggered
    targetKey: string;            // <conversationId> or FIX_BUNDLE pointer
    targetSystem?: string;        // 'slack' optional
    error?: string;               // compact result: "created=3 exists=2 failed=0"
    createdAt: string;
    updatedAt: string;
}

/** POST /api/fixes/request body */
export interface FixRequestInput {
    runId: string;
    mode: 'single' | 'topN';
    findingId?: string;
    findingIds?: string[];
    topN?: number;
    filters?: {
        kevOnly?: boolean;
        reachableOnly?: boolean;
        minEpss?: number;
    };
    source?: FixRequestSource;
    agentId?: string;
    conversationId?: string;
}

/** Per-request outcome counts */
export interface FixOutcomeSummary {
    created: number;
    exists: number;
    failed: number;
}

export function formatOutcomeSummary(summary: FixOutcomeSummary): string {
    return `created=${summary.created} exists=${summary.exists} failed=${summary.failed}`;
}

/** Constants */
export const FIX_ENGINE_VERSION = '1.0.0-agent';
export const FIX_REQUEST_MAX_TOP_N = 10;
export const FIX_REQUEST_DEFAULT_TOP_N = 5;
