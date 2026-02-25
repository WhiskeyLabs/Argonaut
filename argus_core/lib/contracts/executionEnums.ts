export const STAGES = [
    "ACQUIRE",
    "NORMALIZE",
    "SCORE",
    "DEP_GRAPH",
    "THREAT_INTEL",
    "FIX_BUNDLES",
    "REPORT"
] as const;

export const STAGE_STATUS = [
    "NOT_STARTED",
    "RUNNING",
    "SUCCEEDED",
    "FAILED",
    "SKIPPED"
] as const;

export const TASK_STATUS = [
    "STARTED",
    "SUCCEEDED",
    "FAILED",
    "SKIPPED"
] as const;

export type Stage = typeof STAGES[number];
export type StageStatus = typeof STAGE_STATUS[number];
export type TaskStatus = typeof TASK_STATUS[number];
