/**
 * FindingsActionService
 * 
 * Service layer for persisting finding state changes (Epic 5).
 * 
 * Responsibilities:
 * 1. Update finding state in db.findings (Rich State Model)
 * 2. Log audit events to db.finding_events
 * 3. Provide convenience wrappers for common actions
 * 4. Support Bulk Operations
 */

import { db } from '../db';
import { FindingStatus, FindingState, FindingStatusV2, FindingEvent } from '../types/finding';
import { EventType } from '../types/events';
import { v4 as uuidv4 } from 'uuid';

export interface StatusChangeResult {
    success: boolean;
    findingId: string;
    previousStatus: FindingStatus;
    newStatus: FindingStatus;
    error?: string;
}

export interface StateChangeResult {
    success: boolean;
    count: number;
    error?: string;
}

/**
 * Epic 5: Update Finding State (Rich State Model)
 */
export async function updateFindingState(
    findingId: string,
    updates: Partial<FindingState>,
    context: { actor: string; reason?: string; action?: FindingEvent['action'] }
): Promise<boolean> {
    return bulkUpdateFindingState([findingId], updates, context);
}

/**
 * Epic 5: Bulk Update Finding State
 */
export async function bulkUpdateFindingState(
    findingIds: string[],
    updates: Partial<FindingState>,
    context: { actor: string; reason?: string; action?: FindingEvent['action'] }
): Promise<boolean> {
    try {
        await db.transaction('rw', db.findings, db.finding_events, db.events, async () => {
            const now = Date.now();
            const events: FindingEvent[] = [];
            const timestamp = now;

            for (const findingId of findingIds) {
                const finding = await db.findings.get(findingId);
                if (!finding) continue;

                // Merge state
                const currentState = finding.state || {
                    status: 'OPEN',
                    scope: 'INSTANCE'
                };

                const newState: FindingState = {
                    ...currentState,
                    ...updates
                };

                // Create Audit Event
                events.push({
                    id: uuidv4(),
                    findingId,
                    sessionId: finding.sessionId,
                    actor: context.actor,
                    action: context.action || 'triage',
                    timestamp,
                    diff: { from: currentState, to: newState },
                    reason: context.reason
                });

                // Prepare Updates
                const dbUpdates: Record<string, any> = {
                    state: newState
                };

                // Backward Compat: Sync root status if changed
                if (updates.status) {
                    // Map V2 status to legacy status (simplistic map)
                    const legacyMap: Record<FindingStatusV2, FindingStatus> = {
                        'OPEN': 'open',
                        'TRIAGED': 'in_progress', // Triaged is actively being looked at
                        'IN_PROGRESS': 'in_progress',
                        'RESOLVED': newState.resolution === 'ACCEPTED_RISK' ? 'risk_accepted' :
                            newState.resolution === 'FALSE_POSITIVE' ? 'false_positive' :
                                newState.resolution === 'FIXED' ? 'fixed' : 'ignored'
                    };
                    dbUpdates['status'] = legacyMap[updates.status];
                }

                await db.findings.update(findingId, dbUpdates);
            }

            // Bulk Add Events
            if (events.length > 0) {
                await db.finding_events.bulkAdd(events);

                // FIX: Log high-level event to Session Audit (db.events)
                // We pick the first event's details for the summary, but count the total
                const distinctStatus = Array.from(new Set(events.map(e => e.diff.to.status)));
                const newStatusLabel = distinctStatus.length === 1 ? distinctStatus[0] : 'MIXED';

                await db.events.add({
                    id: uuidv4(),
                    sessionId: events[0].sessionId,
                    type: EventType.FINDING_STATUS_CHANGED,
                    timestamp: now,
                    payload: {
                        findingId: events[0].findingId, // Representative ID
                        previousStatus: 'VARIOUS',
                        newStatus: updates.status || 'UPDATED',
                        count: events.length
                    }
                });
            }
        });

        return true;
    } catch (error) {
        console.error("Failed to update finding state", error);
        return false;
    }
}

/**
 * LEGACY Support: Update a finding's status and log the event.
 * @deprecated Use updateFindingState
 */
export async function updateFindingStatus(
    findingId: string,
    newStatus: FindingStatus
): Promise<StatusChangeResult> {
    // Map legacy status to new state
    const stateUpdates: Partial<FindingState> = {};
    if (newStatus === 'open') stateUpdates.status = 'OPEN';
    else if (newStatus === 'in_progress') stateUpdates.status = 'IN_PROGRESS';
    else if (newStatus === 'fixed') { stateUpdates.status = 'RESOLVED'; stateUpdates.resolution = 'FIXED'; }
    else if (newStatus === 'risk_accepted') { stateUpdates.status = 'RESOLVED'; stateUpdates.resolution = 'ACCEPTED_RISK'; }
    else if (newStatus === 'false_positive') { stateUpdates.status = 'RESOLVED'; stateUpdates.resolution = 'FALSE_POSITIVE'; }
    else if (newStatus === 'ignored') { stateUpdates.status = 'RESOLVED'; stateUpdates.resolution = 'WONT_FIX'; }

    const success = await updateFindingState(findingId, stateUpdates, { actor: 'legacy_wrapper', action: 'triage' });

    return {
        success,
        findingId,
        previousStatus: 'open', // We don't fetch prev in this wrapper anymore to save generic perf
        newStatus
    };
}

/**
 * Convenience: Dismiss a finding (mark as ignored/noise).
 */
export async function dismissFinding(findingId: string, reason?: string): Promise<StatusChangeResult> {
    if (reason && reason.trim().length > 0) {
        const success = await updateFindingState(
            findingId,
            { status: 'RESOLVED', resolution: 'WONT_FIX' },
            { actor: 'research_triage_ui', action: 'triage', reason: reason.trim() }
        );

        return {
            success,
            findingId,
            previousStatus: 'open',
            newStatus: 'ignored'
        };
    }

    return updateFindingStatus(findingId, 'ignored');
}

/**
 * Convenience: Mark a finding as fixed.
 */
export async function applyFix(findingId: string): Promise<StatusChangeResult> {
    return updateFindingStatus(findingId, 'fixed');
}

/**
 * Convenience: Accept risk on a finding.
 */
export async function acceptRisk(findingId: string): Promise<StatusChangeResult> {
    return updateFindingStatus(findingId, 'risk_accepted');
}

/**
 * Convenience: Mark as false positive.
 */
export async function markFalsePositive(findingId: string): Promise<StatusChangeResult> {
    return updateFindingStatus(findingId, 'false_positive');
}

/**
 * Convenience: Reopen a finding (set back to open).
 */
export async function reopenFinding(findingId: string): Promise<StatusChangeResult> {
    return updateFindingStatus(findingId, 'open');
}

/**
 * Bulk Convenience: Update status for multiple findings.
 */
export async function bulkUpdateStatus(
    findingIds: string[],
    newStatus: FindingStatus
): Promise<StateChangeResult> {
    // Map legacy status to new state
    const stateUpdates: Partial<FindingState> = {};
    if (newStatus === 'open') stateUpdates.status = 'OPEN';
    else if (newStatus === 'in_progress') stateUpdates.status = 'IN_PROGRESS';
    else if (newStatus === 'fixed') { stateUpdates.status = 'RESOLVED'; stateUpdates.resolution = 'FIXED'; }
    else if (newStatus === 'risk_accepted') { stateUpdates.status = 'RESOLVED'; stateUpdates.resolution = 'ACCEPTED_RISK'; }
    else if (newStatus === 'false_positive') { stateUpdates.status = 'RESOLVED'; stateUpdates.resolution = 'FALSE_POSITIVE'; }
    else if (newStatus === 'ignored') { stateUpdates.status = 'RESOLVED'; stateUpdates.resolution = 'WONT_FIX'; }

    const success = await bulkUpdateFindingState(findingIds, stateUpdates, { actor: 'bulk_triage_ui', action: 'triage' });

    return {
        success,
        count: success ? findingIds.length : 0
    };
}
