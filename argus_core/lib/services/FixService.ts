import { v4 as uuidv4 } from 'uuid';
import { db, FixSuggestionArtifact } from '../db';
import { aiAnalysisService } from '../ai/analysisService';
import { ResearchContext } from '../types/research';
import { PROMPT_REGISTRY } from '../ai/prompts';
import { aiClient } from '../ai/client';

/**
 * FixService
 * Centralizes AI artifact lifecycle management:
 * Cache Check -> Generation -> Persistence -> Consistency.
 */
class FixService {
    private inflight = new Map<string, Promise<FixSuggestionArtifact>>();

    /**
     * Generates or retrieves a cached fix suggestion.
     * Prioritizes cacheKey lookup.
     */
    async getOrGenerateFix(context: ResearchContext, forceRefresh = false): Promise<FixSuggestionArtifact> {
        const cacheKey = await this.computeCacheKey(context);

        // 1. In-flight Deduplication
        if (this.inflight.has(cacheKey) && !forceRefresh) {
            return this.inflight.get(cacheKey)!;
        }

        // 2. Database Cache Check
        if (!forceRefresh) {
            const cached = await db.fix_suggestions.where('cacheKey').equals(cacheKey).first();
            if (cached && cached.status === 'READY') {
                // Ensure it is marked as latest if we are returning it for this finding
                await this.markAsLatest(cached);
                return cached;
            }
        }

        // 3. Trigger New Generation
        const generationPromise = this.performGeneration(context, cacheKey);
        this.inflight.set(cacheKey, generationPromise);

        try {
            const result = await generationPromise;
            return result;
        } finally {
            this.inflight.delete(cacheKey);
        }
    }

    /**
     * Computes a SHA-256 hash of the context to use as a stable cache key.
     */
    private async computeCacheKey(context: ResearchContext): Promise<string> {
        const prompt = PROMPT_REGISTRY.SUGGESTED_FIX;
        const model = aiClient.defaultModel;
        const input = `${context.input_hash}|${prompt.id}|${prompt.version}|${model}`;

        // Simple stable hash for now, web crypto for production
        const encoder = new TextEncoder();
        const data = encoder.encode(input);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    private async performGeneration(context: ResearchContext, cacheKey: string): Promise<FixSuggestionArtifact> {
        // 1. Insert Pending Row
        const id = uuidv4();
        const newFix: FixSuggestionArtifact = {
            id,
            findingId: context.meta.findingId,
            sessionId: context.meta.sessionId,
            status: 'PENDING',
            type: 'Code',
            summary: 'Generating fix...',
            patch: { before: '', after: '' },
            confidence: 0,
            createdAt: Date.now(),
            isLatestForFinding: 1,
            updatedAt: Date.now(),
            source: {
                type: 'GENERAI_MODEL',
                ref: aiClient.defaultModel
            },
            cacheKey,
            promptId: PROMPT_REGISTRY.SUGGESTED_FIX.id,
            promptVersion: PROMPT_REGISTRY.SUGGESTED_FIX.version,
            modelName: aiClient.defaultModel,
            temperature: 0.3
        };

        await db.transaction('rw', db.fix_suggestions, async () => {
            // Mark others as not latest
            await db.fix_suggestions
                .where('[findingId+isLatestForFinding]')
                .equals([context.meta.findingId, 1])
                .modify({ isLatestForFinding: 0 });

            await db.fix_suggestions.add(newFix);
        });

        try {
            const analysisResult = await aiAnalysisService.analyzeFinding(context);

            if (analysisResult.modelStatus.status === 'MODEL_DERIVED' && analysisResult.fix) {
                const updatedFix: Partial<FixSuggestionArtifact> = {
                    status: 'READY',
                    type: analysisResult.fix.type,
                    summary: analysisResult.fix.summary,
                    patch: analysisResult.fix.patch,
                    confidence: analysisResult.fix.confidence,
                    updatedAt: Date.now()
                };

                await db.fix_suggestions.update(id, updatedFix);
                return { ...newFix, ...updatedFix } as FixSuggestionArtifact;
            } else {
                throw new Error(analysisResult.modelStatus.status);
            }
        } catch (err) {
            await db.fix_suggestions.update(id, { status: 'FAILED', summary: `Generation failed: ${err}` });
            throw err;
        }
    }

    private async markAsLatest(fix: FixSuggestionArtifact) {
        if (fix.isLatestForFinding === 1) return;

        await db.transaction('rw', db.fix_suggestions, async () => {
            await db.fix_suggestions
                .where('[findingId+isLatestForFinding]')
                .equals([fix.findingId, 1])
                .modify({ isLatestForFinding: 0 });

            await db.fix_suggestions.update(fix.id, { isLatestForFinding: 1 });
        });
    }
}

export const fixService = new FixService();
