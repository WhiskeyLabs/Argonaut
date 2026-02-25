'use client';

import { db } from '@/lib/db';

/**
 * Removes locally stored analysis/session artifacts.
 * Settings are intentionally preserved so privacy preferences survive reset.
 */
export async function purgeLocalAnalysisData(): Promise<void> {
    await db.transaction(
        'rw',
        db.findings,
        db.sessions,
        db.projects,
        db.session_artifacts,
        db.recent_artifacts,
        db.derived_graph_indices,
        db.events,
        db.finding_events,
        db.threat_intel,
        db.ti_meta,
        db.fix_suggestions,
        async () => {
            await db.findings.clear();
            await db.sessions.clear();
            await db.projects.clear();
            await db.session_artifacts.clear();
            await db.recent_artifacts.clear();
            await db.derived_graph_indices.clear();
            await db.events.clear();
            await db.finding_events.clear();
            await db.threat_intel.clear();
            await db.ti_meta.clear();
            await db.fix_suggestions.clear();
        }
    );
}
