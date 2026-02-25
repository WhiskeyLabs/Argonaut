/**
 * useAIAnalysis - Task 4.4, Step 4
 *
 * Hook for driving the AI Analysis Service from the UI.
 * Handles lifecycle:
 *   - Auto-triggers analysis when context is ready + AI enabled
 *   - Implements scoped caching (module-level) to survive navigation
 *   - Exposes retry() for error recovery
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ResearchContext } from '../lib/types/research';
import {
    AIAnalysisResult,
    AIAnalysisState
} from '../lib/ai/types';
import { fixService } from '../lib/services/FixService';
import { db, FixSuggestionArtifact } from '../lib/db';

interface UseAIAnalysisResult {
    result: FixSuggestionArtifact | null;
    state: AIAnalysisState;
    generateFix: (forceRefresh?: boolean) => Promise<FixSuggestionArtifact | null | undefined>;
    retry: () => void;
}

export function useAIAnalysis(
    context: ResearchContext | null,
    aiEnabled: boolean
): UseAIAnalysisResult {
    // 1. Reactive query for the latest result - Source of Truth
    const result = useLiveQuery(
        async () => {
            if (!context) return null;
            return await db.fix_suggestions
                .where('[findingId+isLatestForFinding]')
                .equals([context.meta.findingId, 1])
                .first() || null;
        },
        [context?.meta.findingId]
    );

    // 2. Derive state from query result
    // result === undefined means the query is still in flight (loading)
    const state: AIAnalysisState = (function () {
        if (!context) return 'idle';
        if (result === undefined) return 'loading';
        if (!result) return 'idle';

        if (result.status === 'READY') return 'success';
        if (result.status === 'FAILED') return 'error';
        return 'loading'; // PENDING
    })();

    const generateFix = useCallback(async (forceRefresh = false) => {
        if (!context) return;
        try {
            return await fixService.getOrGenerateFix(context, forceRefresh);
        } catch (err) {
            console.error('[useAIAnalysis] Generation failed:', err);
            // State will automatically become 'error' if fixService updates the row to FAILED
        }
    }, [context]);

    // 3. Auto-trigger analysis if enabled and no result exists
    useEffect(() => {
        // Only trigger if we've confirmed there's truly no result (result === null, not undefined)
        if (aiEnabled && state === 'idle' && context && result === null) {
            generateFix();
        }
    }, [aiEnabled, state, context, generateFix, result]);

    const retry = useCallback(() => {
        generateFix(true);
    }, [generateFix]);

    return { result: result || null, state, generateFix, retry };
}
