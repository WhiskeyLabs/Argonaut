/**
 * AI Analysis Types — Task 4.4
 *
 * Type definitions for the AI analysis pipeline.
 */

import { ModelStatus } from '../types/modelStatus';
import { FixRecommendation } from '../types/research';

// ─── Analysis Result ────────────────────────────────────────────

export interface AIAnalysisResult {
    /** Parsed fix recommendation, or null if analysis failed/unavailable */
    fix: FixRecommendation | null;
    /** Structured patch bundle for automated fixing */
    patch?: import('../types/patch').PatchBundle;
    /** Full model status with provenance for UI badge rendering */
    modelStatus: ModelStatus;
    /** Raw LLM output for error disclosure (only populated on parse failure) */
    raw?: string;
}

// ─── Analysis State (for hooks) ─────────────────────────────────

export type AIAnalysisState = 'idle' | 'loading' | 'success' | 'error' | 'unavailable';

// ─── LLM Response Shape (what we expect from the model) ─────────

/** The JSON schema we instruct the LLM to produce */
export interface LLMFixResponse {
    type: 'Upgrade' | 'Config' | 'Code';
    summary: string;
    patch: {
        before: string;
        after: string;
    };
    confidence: number; // 0-100
}

// ─── Validation ─────────────────────────────────────────────────

/**
 * Validate that a parsed object matches the LLMFixResponse schema.
 * Returns the validated object or null if validation fails.
 */
export function validateFixResponse(obj: unknown): LLMFixResponse | null {
    if (!obj || typeof obj !== 'object') return null;

    const o = obj as Record<string, unknown>;

    // Required fields
    if (!o.type || !['Upgrade', 'Config', 'Code'].includes(o.type as string)) return null;
    if (typeof o.summary !== 'string') return null;
    if (!o.patch || typeof o.patch !== 'object') return null;

    const patch = o.patch as Record<string, unknown>;
    if (typeof patch.before !== 'string') return null;
    if (typeof patch.after !== 'string') return null;

    // Confidence: coerce to number, clamp 0-100
    const confidence = typeof o.confidence === 'number'
        ? Math.max(0, Math.min(100, o.confidence))
        : 50; // Default if missing

    return {
        type: o.type as LLMFixResponse['type'],
        summary: o.summary as string,
        patch: {
            before: patch.before as string,
            after: patch.after as string,
        },
        confidence,
    };
}

/**
 * Strip common LLM artifacts from JSON output.
 * Handles: code fences, leading/trailing whitespace, markdown wrapping.
 */
export function cleanJsonResponse(raw: string): string {
    let cleaned = raw.trim();

    // Strip ```json ... ``` fences
    const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)```\s*$/);
    if (fenceMatch) {
        cleaned = fenceMatch[1].trim();
    }

    // Strip leading/trailing markdown artifacts
    cleaned = cleaned.replace(/^```\s*/gm, '').replace(/\s*```$/gm, '');

    return cleaned;
}

/**
 * Validate that a parsed object matches the PatchBundle schema.
 */
export function validatePatchBundle(obj: unknown): import('../types/patch').PatchBundle | null {
    if (!obj || typeof obj !== 'object') return null;
    const o = obj as Record<string, unknown>;

    // Basic structure
    if (typeof o.summary !== 'string') return null;
    if (!['dependency_update', 'code_fix'].includes(o.type as string)) return null;

    // Changes array
    if (!Array.isArray(o.changes)) return null;
    for (const change of o.changes) {
        if (typeof change.path !== 'string') return null;
        if (typeof change.diff !== 'string') return null;
    }

    // Risk object
    if (!o.risk || typeof o.risk !== 'object') return null;
    const risk = o.risk as Record<string, unknown>;
    if (!['low', 'medium', 'high'].includes(risk.level as string)) return null;

    return o as unknown as import('../types/patch').PatchBundle;
}
