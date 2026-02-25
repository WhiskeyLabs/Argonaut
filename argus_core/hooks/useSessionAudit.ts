import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { EventType, AppEvent } from '@/lib/types/events';
import { useMemo } from 'react';

export interface AuditLogItem {
    id: string;
    timestamp: number;
    type: EventType;
    message: string;
    isError?: boolean;
    count?: number; // For collapsed events
    milestone?: boolean;
}

const MAX_DISPLAY_EVENTS = 50;

/**
 * Maps raw AppEvents to user-friendly AuditLogItems.
 * Implements the "Session Flight Recorder" logic (Filtering & Formatting).
 */
function processEvent(event: AppEvent): AuditLogItem | null {
    const { type, payload, timestamp, id } = event;

    // 1. Always Show
    if (type === EventType.SESSION_STARTED) { // Derived event
        return { id, timestamp, type, message: 'Session started', milestone: true };
    }
    if (type === EventType.INGESTION_COMPLETED) {
        return {
            id, timestamp, type,
            message: `Ingested ${payload.fileCount ?? '?'} files • ${payload.duration ?? 0}ms`, // duration usually ms
            milestone: true
        };
    }
    if (type === EventType.INGESTION_FAILED) {
        return { id, timestamp, type, message: `Ingestion failed • ${payload.error || 'Unknown error'}`, isError: true };
    }
    if (type === EventType.DEPENDENCY_SWEEP_FAILED) {
        return { id, timestamp, type, message: `Dependency analysis failed • ${payload.error || 'Unknown error'}`, isError: true };
    }
    if (type === EventType.AI_TOGGLED) {
        return { id, timestamp, type, message: `AI Assistant ${payload.enabled ? 'Enabled' : 'Disabled'}` };
    }

    // 2. Milestones
    if (type === EventType.DEPENDENCY_SWEEP_COMPLETED) {
        return {
            id, timestamp, type,
            message: `Dependency analysis: ${payload.linked ?? 0}/${payload.total ?? 0} linked • lockfile v${payload.lockfileVersion ?? 2}`,
            milestone: true
        };
    }

    // 3. Show & Collapse (Base formatting, collapsing handled in hook)
    if (type === EventType.FINDING_STATUS_CHANGED) {
        // Payload: findingId, previousStatus, newStatus
        const action = payload.newStatus === 'IGNORED' ? 'Ignored' :
            payload.newStatus === 'FIXED' ? 'Fixed' :
                'Updated'; // default
        return { id, timestamp, type, message: `${action} [${payload.findingId}]` }; // Placeholder for collapse
    }
    if (type === EventType.FINDING_OVERRIDE_SET) {
        return { id, timestamp, type, message: `Override set on [${payload.findingId}]` };
    }

    // 4. Conditional / Batch
    if (type === EventType.AI_ANALYSIS_COMPLETED) {
        // Only show if it looks like a batch operation or significant.
        // For now, per CTO feedback: "Show only when it's user-intentful at session level".
        // If we don't distinguish batch vs single yet, we might want to hide purely single ones to avoid noise.
        // But let's show them for now and rely on future batch logic or simply hide if too noisy.
        // CTO said: "Hide implicit single-finding analysis". 
        // Assuming current implementation is mostly single-finding manual triggers (or implicit).
        // Safest: Hide unless we can detect batch. 
        // OR: Show but rely on collapsing.
        // Let's HIDE by default given the instruction "Hide implicit single-finding analysis"
        return null;
    }

    // 5. Explicit Hide (Noise)
    if (
        type === EventType.DEPENDENCY_SWEEP_REQUESTED ||
        type === EventType.AI_ANALYSIS_REQUESTED ||
        type === EventType.GRAPH_BUILD_REQUESTED ||
        type === EventType.GRAPH_BUILD_COMPLETED ||
        type === EventType.REACHABILITY_COMPUTED
    ) {
        return null;
    }

    // 6. Contextual Errors
    if (type === EventType.GRAPH_BUILD_FAILED) {
        // "Red only if blocking". Hard to know if blocking here. 
        // Plan says: "Reachability graph failed • {errorShort}"
        return { id, timestamp, type, message: `Reachability graph failed • ${payload.error || 'Error'}`, isError: true };
    }

    // Default fallback (useful for debugging new events, or just hide)
    return null;
}

/**
 * Collapses consecutive events of similar intent.
 */
function collapseLogs(items: AuditLogItem[]): AuditLogItem[] {
    if (items.length === 0) return [];

    const collapsed: AuditLogItem[] = [];
    let current = items[0];
    let count = 1;

    // Iterate starting from second item
    for (let i = 1; i < items.length; i++) {
        const next = items[i];

        // Check for collapsibility: Same Type AND close in time (e.g., < 10s) 
        // AND specific types (Status Change, override)
        const isCollapsableType =
            current.type === EventType.FINDING_STATUS_CHANGED ||
            current.type === EventType.FINDING_OVERRIDE_SET;

        const isProximity = Math.abs(current.timestamp - next.timestamp) < 10000; // 10s window

        if (isCollapsableType && current.type === next.type && isProximity) {
            count++;
            // Keep the 'current' (latest) timestamp, but maybe update message later
        } else {
            // Push current
            if (count > 1) {
                // Re-format message based on count
                if (current.type === EventType.FINDING_STATUS_CHANGED) {
                    current.message = `Status updated: ${count} findings`;
                } else if (current.type === EventType.FINDING_OVERRIDE_SET) {
                    current.message = `Overrides applied: ${count} findings`;
                }
                current.count = count;
            }
            collapsed.push(current);

            // Reset
            current = next;
            count = 1;
        }
    }

    // Push last
    if (count > 1) {
        if (current.type === EventType.FINDING_STATUS_CHANGED) {
            current.message = `Status updated: ${count} findings`;
        } else if (current.type === EventType.FINDING_OVERRIDE_SET) {
            current.message = `Overrides applied: ${count} findings`;
        }
        current.count = count;
    }
    collapsed.push(current);

    return collapsed;
}

export function useSessionAudit(sessionId?: string) {
    // 1. Fetch raw events
    const rawEvents = useLiveQuery(async () => {
        if (!sessionId) return [];
        return await db.events
            .where('sessionId').equals(sessionId)
            .reverse() // Newest first
            .sortBy('timestamp');
    }, [sessionId], []);

    // 2. Process & Memoize
    const auditLog = useMemo(() => {
        if (!rawEvents) return [];

        // Filter and Map
        const processed = rawEvents
            .map(processEvent)
            .filter((e): e is AuditLogItem => e !== null);

        // Collapse
        const collapsed = collapseLogs(processed);

        // Limit
        return collapsed.slice(0, MAX_DISPLAY_EVENTS);
    }, [rawEvents]);

    return auditLog;
}
