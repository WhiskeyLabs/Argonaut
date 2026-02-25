
import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { ResearchContext } from '@/lib/types/research';
import { UniversalFinding } from '@/lib/types/finding';
import { contextService } from '@/lib/services/contextService';
import { reachabilityService } from '@/lib/services/reachabilityService';
import { ReachabilityResult } from '@/lib/types/reachability';

interface UseFindingResearchResult {
    context: ResearchContext | null;
    finding: UniversalFinding | undefined | null;
    loading: boolean;
    error: Error | null;
}

/**
 * Hook to load a finding's full ResearchContext via the ContextService.
 * Enriches the context with Reachability Graph (Task 4.5).
 */
export function useFindingResearch(sessionId: string, findingId: string): UseFindingResearchResult {
    const [context, setContext] = useState<ResearchContext | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [loading, setLoading] = useState(true);

    // Live query to detect finding existence & session updates (lockfiles)
    const [finding, session] = useLiveQuery(
        async () => {
            const f = await db.findings.where('id').equals(findingId).first();
            const s = await db.sessions.get(sessionId);
            return [f, s];
        },
        [findingId, sessionId],
        [undefined, undefined]
    );

    useEffect(() => {
        let cancelled = false;

        async function load() {
            if (finding === null) return; // Loading from DB

            if (finding === undefined) {
                // Not found
                if (!cancelled) {
                    setContext(null);
                    setError(new Error('Finding not found'));
                    setLoading(false);
                }
                return;
            }

            try {
                // 1. Load Core Context
                if (!cancelled) setLoading(true);
                const ctx = await contextService.getDetailedContext(findingId, sessionId);

                if (cancelled) return;

                // Set initial context (without graph) to show UI ASAP
                setContext(ctx);

                // 2. Load Reachability Graph (Async Enrichment)
                if (ctx) {
                    try {
                        console.log('[useFindingResearch] Building graph for context:', ctx);
                        const reachability = await reachabilityService.buildGraph(ctx);
                        console.log('[useFindingResearch] Graph build result:', reachability);
                        if (!cancelled) {
                            setContext(prev => prev ? { ...prev, reachability } : null);
                        }
                    } catch (graphErr) {
                        console.error('[useFindingResearch] Graph build failed', graphErr);
                        console.error('[useFindingResearch] Context at failure:', ctx);
                        // We don't fail the whole context, just missing graph
                    }
                }

                if (!cancelled) {
                    setError(null);
                    setLoading(false);
                }

            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err : new Error(String(err)));
                    setContext(null);
                    setLoading(false);
                }
            }
        }

        load();

        return () => { cancelled = true; };
    }, [finding, findingId, sessionId, session?.activeLockfileArtifactId]);

    return { context, finding, loading, error };
}
