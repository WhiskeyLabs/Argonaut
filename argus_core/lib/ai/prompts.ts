/**
 * Prompt Registry — Task 4.4, Step 1
 *
 * Versioned prompt templates for AI analysis.
 * Each template produces messages compatible with the OpenAI chat API.
 *
 * Design rules:
 *   - input_hash is NEVER included in prompts (prevents model echo pollution)
 *   - System prompt enforces JSON-only output matching target schema
 *   - Each template has an immutable version string for Provenance tracking
 */

import { ResearchContext } from '../types/research';

// ─── Types ──────────────────────────────────────────────────────

export interface PromptTemplate {
    id: string;
    version: string;
    description: string;
    buildMessages(context: ResearchContext, options?: PromptBuildOptions): PromptMessage[];
}

export interface PromptMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface PromptBuildOptions {
    includeCodeSnippet?: boolean;
    includeFilePath?: boolean;
}

// ─── SUGGESTED_FIX_V1 ──────────────────────────────────────────

const SUGGESTED_FIX_SYSTEM = `You are a security engineering assistant. Your job is to analyze a vulnerability finding and suggest a concrete fix.

RULES:
1. Respond with valid JSON ONLY. No markdown, no explanation, no code fences.
2. Your response MUST match this exact schema:

{
  "type": "Upgrade" | "Config" | "Code",
  "summary": "Brief human-readable description of the fix",
  "patch": {
    "before": "The vulnerable code/config snippet",
    "after": "The fixed code/config snippet"
  },
  "confidence": 0-100
}

3. "type" must be one of: "Upgrade" (dependency version bump), "Config" (configuration change), or "Code" (source code change).
4. "patch.before" should reflect the vulnerable state. "patch.after" should be the fixed version.
5. "confidence" is your self-assessed confidence in the fix (0-100).
6. If you cannot determine a fix, respond with: {"type":"Code","summary":"Unable to determine fix from available context","patch":{"before":"","after":""},"confidence":0}
7. Do NOT include any text outside the JSON object.`;

function buildSuggestedFixUserPrompt(ctx: ResearchContext, options: PromptBuildOptions = {}): string {
    const includeCodeSnippet = options.includeCodeSnippet ?? true;
    const includeFilePath = options.includeFilePath ?? true;
    const parts: string[] = [];

    parts.push(`## Finding`);
    parts.push(`- **Title**: ${ctx.title}`);
    parts.push(`- **Tool**: ${ctx.identity.tool}`);
    parts.push(`- **Rule**: ${ctx.identity.ruleId}`);
    parts.push(`- **Severity**: ${ctx.severity}`);

    if (ctx.identity.cveId) {
        parts.push(`- **CVE**: ${ctx.identity.cveId}`);
    }

    if (ctx.identity.packageName) {
        parts.push(`- **Package**: ${ctx.identity.packageName}${ctx.identity.packageVersion ? `@${ctx.identity.packageVersion}` : ''}`);
    }

    if (ctx.location.path && includeFilePath) {
        parts.push(`\n## Location`);
        parts.push(`- **File**: ${ctx.location.path}`);
        if (ctx.location.startLine !== null) {
            parts.push(`- **Line**: ${ctx.location.startLine}${ctx.location.endLine ? `-${ctx.location.endLine}` : ''}`);
        }
    }

    if (ctx.snippet.raw && includeCodeSnippet) {
        parts.push(`\n## Code Snippet`);
        parts.push(ctx.snippet.raw);
    }

    parts.push(`\nAnalyze this finding and provide a suggested fix as JSON.`);

    return parts.join('\n');
}

export const SUGGESTED_FIX_V1: PromptTemplate = {
    id: 'SUGGESTED_FIX',
    version: 'v1',
    description: 'Generate a FixRecommendation from a ResearchContext',
    buildMessages(context: ResearchContext, options?: PromptBuildOptions): PromptMessage[] {
        return [
            { role: 'system', content: SUGGESTED_FIX_SYSTEM },
            { role: 'user', content: buildSuggestedFixUserPrompt(context, options) },
        ];
    },
};

// ─── ACTION_GROUPING_V1 (Stub) ─────────────────────────────────

export const ACTION_GROUPING_V1: PromptTemplate = {
    id: 'ACTION_GROUPING',
    version: 'v1',
    description: 'Categorize a finding into a fixAction group (future use)',
    buildMessages(context: ResearchContext): PromptMessage[] {
        return [
            {
                role: 'system',
                content: 'You categorize security findings into action groups. Respond with JSON only: {"action":"upgrade_libraries"|"sanitize_inputs"|"fix_configuration"|"update_permissions"|"other","confidence":0-100}',
            },
            {
                role: 'user',
                content: `Finding: ${context.title}\nTool: ${context.identity.tool}\nRule: ${context.identity.ruleId}`,
            },
        ];
    },
};

// ─── GENERATE_PATCH_V1 ─────────────────────────────────────────

const GENERATE_PATCH_SYSTEM = `You are a specialized code patch generator. Your job is to output a strictly formatted JSON object containing a unified diff to fix a vulnerability.

RULES:
1. Output valid JSON ONLY.
2. The schema MUST match:
{
  "patch_id": "UUID",
  "type": "dependency_update" | "code_fix",
  "summary": "Short description",
  "risk": { "level": "low"|"medium"|"high", "notes": ["..."] },
  "changes": [
    { "path": "filename", "diff": "unified diff content" }
  ]
}
3. The "diff" field MUST be a valid unified diff (starting with ---/+++ headers if possible, or @@ headers).
4. Ensure the diff is context-rich enough to apply cleanly.
`;

export const GENERATE_PATCH_V1: PromptTemplate = {
    id: 'GENERATE_PATCH',
    version: 'v1',
    description: 'Generate a downloadable PatchBundle',
    buildMessages(context: ResearchContext, options?: PromptBuildOptions): PromptMessage[] {
        return [
            { role: 'system', content: GENERATE_PATCH_SYSTEM },
            { role: 'user', content: buildSuggestedFixUserPrompt(context, options) }, // Reuse existing context builder
        ];
    },
};

// ─── Registry ───────────────────────────────────────────────────

export const PROMPT_REGISTRY: Record<string, PromptTemplate> = {
    SUGGESTED_FIX: SUGGESTED_FIX_V1,
    ACTION_GROUPING: ACTION_GROUPING_V1,
    GENERATE_PATCH: GENERATE_PATCH_V1,
};

/** Convenience: get a prompt by ID or throw */
export function getPrompt(id: string): PromptTemplate {
    const template = PROMPT_REGISTRY[id];
    if (!template) {
        throw new Error(`[PromptRegistry] Unknown prompt: ${id}`);
    }
    return template;
}
