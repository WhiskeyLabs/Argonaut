import { db } from '../db';
import { UniversalFinding, FindingState, FindingStatus } from '../types/finding';
import { ProjectService } from './projectService';

export const RehydrationService = {
    /**
     * Try to match new findings against existing state in the project.
     * @param newFindings The fresh batch of findings (not yet inserted, or just inserted)
     * @param sessionId The current session ID
     * @param projectId The project ID
     */
    /**
     * Rehydrates a persisted session contents in-place.
     * Use this when findings are already in the DB (e.g. after worker ingest).
     */
    async rehydrateSession(sessionId: string, projectId: string): Promise<number> {
        console.log(`Starting rehydration for Session ${sessionId} (Project ${projectId})`);

        // 1. Build State Map
        const stateMap = await this.getProjectStateMap(projectId);
        if (stateMap.size === 0) return 0;

        // 2. Apply in-place
        // We use a transaction to ensure no UI weirdness during update
        let rehydratedCount = 0;

        await db.transaction('rw', db.findings, async () => {
            await db.findings.where({ sessionId }).modify(f => {
                const match = stateMap.get(f.dedupeKey!); // dedupeKey determines identity
                if (match) {
                    f.state = match;
                    // Legacy sync
                    f.status = match.status === 'RESOLVED' && match.resolution === 'FIXED' ? 'fixed' :
                        match.status === 'RESOLVED' && match.resolution === 'ACCEPTED_RISK' ? 'risk_accepted' :
                            match.status === 'RESOLVED' && match.resolution === 'FALSE_POSITIVE' ? 'false_positive' :
                                match.status === 'RESOLVED' && match.resolution === 'WONT_FIX' ? 'ignored' :
                                    'open';

                    // Count only matches
                    rehydratedCount++;
                }
                // Note: We do NOT reset to OPEN here because the worker
                // already initialized them as OPEN. We only overlay known state.
            });
        });

        console.log(`Rehydrated ${rehydratedCount} findings in Session ${sessionId}`);
        return rehydratedCount;
    },

    /**
     * Helper to build the state map from project history
     */
    async getProjectStateMap(projectId: string): Promise<Map<string, FindingState>> {
        const relevantStatuses = ['TRIAGED', 'IN_PROGRESS', 'RESOLVED'];
        const stateMap = new Map<string, FindingState>();

        // Query for each status
        // Note: This logic naively takes the *last seen* finding with this status.
        // ideally we want the *latest timestamp*, but Dexie doesn't sort by time easily across indices without compound.
        // For now, simple presence is enough for MVP.
        for (const status of relevantStatuses) {
            const findings = await db.findings
                .where('[projectId+state.status]')
                .equals([projectId, status])
                .toArray();

            for (const f of findings) {
                if (f.state && f.dedupeKey) {
                    // Overwrite matches - last one wins (usually insertion order, which approximates time)
                    stateMap.set(f.dedupeKey, f.state);
                }
            }
        }
        return stateMap;
    },

    /**
     * @deprecated Use rehydrateSession for post-ingest updates
     */
    async rehydrateFindings(
        newFindings: UniversalFinding[],
        projectId: string
    ): Promise<UniversalFinding[]> {
        const stateMap = await this.getProjectStateMap(projectId);

        let rehydratedCount = 0;
        const processedFindings = newFindings.map(f => {
            const match = stateMap.get(f.dedupeKey!);
            if (match) {
                rehydratedCount++;
                const legacyStatus: FindingStatus =
                    match.status === 'RESOLVED' && match.resolution === 'FIXED' ? 'fixed' :
                        match.status === 'RESOLVED' && match.resolution === 'ACCEPTED_RISK' ? 'risk_accepted' :
                            match.status === 'RESOLVED' && match.resolution === 'FALSE_POSITIVE' ? 'false_positive' :
                                match.status === 'RESOLVED' && match.resolution === 'WONT_FIX' ? 'ignored' :
                                    'open';

                return {
                    ...f,
                    projectId,
                    state: match,
                    status: legacyStatus
                };
            }
            // Default state
            return {
                ...f,
                projectId,
                state: {
                    status: 'OPEN',
                    scope: 'INSTANCE'
                } as FindingState,
                status: 'open' as FindingStatus
            };
        });

        console.log(`[Deprecated] Rehydrated ${rehydratedCount} findings for Project ${projectId}`);
        return processedFindings;
    }
};


