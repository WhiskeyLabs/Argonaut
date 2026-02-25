import { db } from '@/lib/db';

export interface SessionDeleteResult {
    deletedFindings: number;
    deletedArtifacts: number;
    deletedEvents: number;
    deletedFixSuggestions: number;
}

export const SessionService = {
    async deleteSessionCascade(sessionId: string): Promise<SessionDeleteResult> {
        const findingIds = await db.findings.where('sessionId').equals(sessionId).primaryKeys() as string[];
        const artifactIds = await db.session_artifacts.where('sessionId').equals(sessionId).primaryKeys();
        const eventIds = await db.events.where('sessionId').equals(sessionId).primaryKeys();
        const fixSuggestionIds = await db.fix_suggestions.where('sessionId').equals(sessionId).primaryKeys();

        await db.transaction(
            'rw',
            db.sessions,
            db.findings,
            db.session_artifacts,
            db.derived_graph_indices,
            db.events,
            db.finding_events,
            db.fix_suggestions,
            async () => {
                await db.findings.where('sessionId').equals(sessionId).delete();
                await db.session_artifacts.where('sessionId').equals(sessionId).delete();
                await db.derived_graph_indices.where('sessionId').equals(sessionId).delete();
                await db.events.where('sessionId').equals(sessionId).delete();
                await db.fix_suggestions.where('sessionId').equals(sessionId).delete();

                if (findingIds.length > 0) {
                    await db.finding_events.where('findingId').anyOf(findingIds).delete();
                }

                await db.sessions.delete(sessionId);
            }
        );

        return {
            deletedFindings: findingIds.length,
            deletedArtifacts: artifactIds.length,
            deletedEvents: eventIds.length,
            deletedFixSuggestions: fixSuggestionIds.length,
        };
    },
};
