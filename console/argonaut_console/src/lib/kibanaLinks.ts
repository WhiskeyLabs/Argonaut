/**
 * Utility functions for building Kibana links.
 *
 * Notes:
 * - Kibana uses Rison-like state in `_g` (global) and `_a` (app) query params.
 * - Do NOT encode the KQL string with encodeURIComponent inside `_a` — it will stop parsing as KQL.
 */

const KIBANA_URL = () => process.env.KIBANA_URL || "";

// Keep these configurable
const KIBANA_DEFAULT_TIME_FROM = () => process.env.KIBANA_DEFAULT_TIME_FROM || "now-24h";
const KIBANA_DEFAULT_TIME_TO = () => process.env.KIBANA_DEFAULT_TIME_TO || "now";
const KIBANA_AUTO_REFRESH_MS = () => Number(process.env.KIBANA_AUTO_REFRESH_MS || 5000);

// Dashboard you want the primary link to open
export const KIBANA_RUNS_DASHBOARD_ID = () =>
    process.env.KIBANA_RUNS_DASHBOARD_ID || "21b1af8f-6fbf-42cb-be9d-3eae5a92188a";

// If you have a dedicated data view / index pattern for task logs, use it here
export const KIBANA_TASKLOGS_INDEX_PATTERN_ID = () =>
    process.env.KIBANA_TASKLOGS_INDEX_PATTERN_ID || "argonaut_tasklogs*";

/**
 * Minimal escaping to keep the KQL string safe inside single-quoted Rison.
 * - Escape backslashes and single quotes for the surrounding quote context.
 * - Escape double quotes because we put runId in double quotes in KQL.
 */
function escapeForKqlInRison(value: string): string {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"');
}

function buildGlobalState(opts?: {
    timeFrom?: string;
    timeTo?: string;
    refreshMs?: number;
    pauseRefresh?: boolean;
}): string {
    const timeFrom = opts?.timeFrom ?? KIBANA_DEFAULT_TIME_FROM();
    const timeTo = opts?.timeTo ?? KIBANA_DEFAULT_TIME_TO();
    const refreshMs = opts?.refreshMs ?? KIBANA_AUTO_REFRESH_MS();
    const pause = opts?.pauseRefresh ?? false;

    // pause:!t means NOT paused (refresh running). pause:!f means paused.
    const pauseToken = pause ? "!f" : "!t";

    return `_g=(filters:!(),refreshInterval:(pause:${pauseToken},value:${refreshMs}),time:(from:${timeFrom},to:${timeTo}))`;
}

function buildAppQueryState(kql: string): string {
    // Important: do not encodeURIComponent here.
    return `_a=(query:(language:kuery,query:'${kql}'))`;
}

/**
 * Existing Discover URL builder (fixed).
 * - Accepts an index pattern id (or pattern string, depending on your deployment).
 * - Optional KQL query.
 */
export function getKibanaDiscoverUrl(indexPatternId: string, kql?: string): string {
    const g = buildGlobalState({ refreshMs: 0, pauseRefresh: true, timeFrom: "now-24h", timeTo: "now" });
    const a = kql ? `&${buildAppQueryState(kql)}` : "";
    return `${KIBANA_URL()}/app/discover#/?${g}&index=${indexPatternId}${a}`;
}

/**
 * Base dashboard URL (no filters).
 */
export function getKibanaDashboardUrl(dashboardId: string): string {
    return `${KIBANA_URL()}/app/dashboards#/view/${dashboardId}`;
}

/**
 * Primary hardened link: Run Console dashboard filtered to a runId.
 * If runId is missing or fails a basic sanity check, it returns an unfiltered dashboard link.
 */
export function buildKibanaRunDashboardUrl(
    runId: string | undefined,
    opts?: { timeFrom?: string; timeTo?: string; refreshMs?: number }
): string {
    const base = getKibanaDashboardUrl(KIBANA_RUNS_DASHBOARD_ID());
    const g = buildGlobalState({ timeFrom: opts?.timeFrom, timeTo: opts?.timeTo, refreshMs: opts?.refreshMs });

    // If runId is missing, open the dashboard unfiltered (still with _g).
    if (!runId) return `${base}?${g}`;

    // Optional: enforce a runId pattern so we don't generate broken URLs
    // (tune this if your runIds include other chars)
    const ok = /^[A-Za-z0-9._:-]+$/.test(runId);
    if (!ok) return `${base}?${g}`;

    const safeRunId = escapeForKqlInRison(runId);
    const a = buildAppQueryState(`runId:"${safeRunId}"`);
    return `${base}?${g}&${a}`;
}

/**
 * Secondary (debug) link: Discover filtered to runId on task logs only.
 */
export function buildKibanaRunLogsDiscoverUrl(
    runId: string | undefined,
    opts?: { timeFrom?: string; timeTo?: string }
): string {
    const timeFrom = opts?.timeFrom ?? KIBANA_DEFAULT_TIME_FROM();
    const timeTo = opts?.timeTo ?? KIBANA_DEFAULT_TIME_TO();

    const g = buildGlobalState({ refreshMs: 0, pauseRefresh: true, timeFrom, timeTo });

    if (!runId) {
        return `${KIBANA_URL()}/app/discover#/?${g}&index=${KIBANA_TASKLOGS_INDEX_PATTERN_ID()}`;
    }

    const ok = /^[A-Za-z0-9._:-]+$/.test(runId);
    const kql = ok ? `runId:"${escapeForKqlInRison(runId)}"` : undefined;
    const a = kql ? `&${buildAppQueryState(kql)}` : "";

    return `${KIBANA_URL()}/app/discover#/?${g}&index=${KIBANA_TASKLOGS_INDEX_PATTERN_ID()}${a}`;
}
