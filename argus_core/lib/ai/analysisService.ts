/**
 * AI Analysis Service — Task 4.4, Step 3
 *
 * Core orchestrator for AI-powered finding analysis.
 * Handles: Gating → Prompt Build → LLM Call → Parsing → Validation → Provenance → Logging.
 *
 * Design:
 *   - Fails fast if AI is disabled or LLM is unreachable (UNAVAILABLE status)
 *   - Enforces strict JSON structure on LLM output
 *   - Computes deterministic confidence based on response quality
 *   - Logs audit events with correlation IDs (request_id)
 */

import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db';
import { evidenceLog } from '@/lib/services/evidenceLog';
import { EventType } from '@/lib/types/events';
import { ResearchContext } from '@/lib/types/research';
import { ModelStatus, Provenance } from '@/lib/types/modelStatus';
import { aiClient } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import {
    AIAnalysisResult,
    cleanJsonResponse,
    validateFixResponse,
    validatePatchBundle
} from '@/lib/ai/types';
import { getEffectivePrivacyPolicyFromDb } from '@/lib/privacy/policy';

const AI_ENABLED_KEY = 'ai_enabled';

export class AIAnalysisService {

    /**
     * Analyze a finding context to generate a suggested fix.
     */
    async analyzeFinding(context: ResearchContext): Promise<AIAnalysisResult> {
        const requestId = uuidv4();
        const startTime = Date.now();

        // 1. Gating Check
        const setting = await db.settings.get(AI_ENABLED_KEY);
        // Demo/default behavior
        const aiEnabled = setting?.value ?? true;
        const privacyPolicy = await getEffectivePrivacyPolicyFromDb();

        if (!aiEnabled) {
            return this.createUnavailableResult(requestId, context, 'gated_off');
        }
        if (!privacyPolicy.canUseCloudAI) {
            return this.createUnavailableResult(requestId, context, 'policy_blocked');
        }

        // 2. Availability Check
        const isAvailable = await aiClient.isAvailable();
        if (!isAvailable) {
            return this.createUnavailableResult(requestId, context, 'llm_unreachable');
        }

        const promptTemplate = PROMPT_REGISTRY.SUGGESTED_FIX;
        const modelName = aiClient.defaultModel;

        // 3. Log Request
        await evidenceLog.log(context.sessionId, EventType.AI_ANALYSIS_REQUESTED, {
            request_id: requestId,
            finding_id: context.findingId,
            input_hash: context.input_hash,
            prompt_id: promptTemplate.id,
            prompt_version: promptTemplate.version,
            model_name: modelName
        });

        try {
            // 4. Build Prompt & Call LLM
            const messages = promptTemplate.buildMessages(context, {
                includeCodeSnippet: privacyPolicy.canSendCodeSnippets,
                includeFilePath: privacyPolicy.canSendCodeSnippets,
            });
            const response = await aiClient.complete(messages, {
                model: modelName,
                // temperature: default from client is fine (0.3)
            });

            const latencyMs = Date.now() - startTime;
            const rawContent = response.content;

            // 5. Parse & Validate
            const cleanedJson = cleanJsonResponse(rawContent);
            let parsedObj: unknown;
            try {
                parsedObj = JSON.parse(cleanedJson);
            } catch (e) {
                // JSON parse failed
                await this.logFailure(requestId, context.sessionId, 'json_parse_error', latencyMs);
                return this.createErrorResult(requestId, context, modelName, latencyMs, rawContent, 'Failed to parse AI response');
            }

            const validatedFix = validateFixResponse(parsedObj);
            if (!validatedFix) {
                // Schema validation failed
                await this.logFailure(requestId, context.sessionId, 'schema_validation_error', latencyMs);
                return this.createErrorResult(requestId, context, modelName, latencyMs, rawContent, 'AI response missing required fields');
            }

            // 6. Compute Confidence Heuristic
            // Start with model's self-reported confidence
            let confidenceScore: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';

            // Downgrade if model isn't confident
            if (validatedFix.confidence < 40) confidenceScore = 'LOW';

            // Upgrade if patch looks very complete (simple heuristic: has >2 lines of code change)
            const patchLines = validatedFix.patch.after.split('\n').length;
            if (validatedFix.confidence > 70 && patchLines > 2) {
                confidenceScore = 'HIGH';
            }

            // 7. Build Success Result
            const provenance: Provenance = {
                request_id: requestId,
                prompt_id: promptTemplate.id,
                prompt_version: promptTemplate.version,
                input_hash: context.input_hash,
                model_name: response.model || modelName,
                latency_ms: latencyMs,
                generated_at: new Date().toISOString(),
                method: 'llm_completion'
            };

            const result: AIAnalysisResult = {
                fix: {
                    id: uuidv4(),
                    type: validatedFix.type,
                    summary: validatedFix.summary,
                    patch: validatedFix.patch,
                    source: {
                        type: 'GENERAI_MODEL',
                        ref: provenance.model_name
                    },
                    confidence: validatedFix.confidence
                },
                modelStatus: {
                    status: 'MODEL_DERIVED',
                    confidence: confidenceScore,
                    provenance
                }
            };

            // 8. Log Success
            await evidenceLog.log(context.sessionId, EventType.AI_ANALYSIS_COMPLETED, {
                request_id: requestId,
                finding_id: context.findingId,
                latency_ms: latencyMs,
                confidence: confidenceScore,
                prompt_version: promptTemplate.version,
                snippet_shared: privacyPolicy.canSendCodeSnippets
            });

            return result;

        } catch (error: any) {
            const latencyMs = Date.now() - startTime;
            await this.logFailure(requestId, context.sessionId, 'llm_error', latencyMs, error.message);
            return this.createErrorResult(requestId, context, modelName, latencyMs, undefined, error.message);
        }
    }

    /**
     * Generate a structured patch bundle for a finding.
     */
    async generatePatch(context: ResearchContext): Promise<AIAnalysisResult> {
        const requestId = uuidv4();
        const startTime = Date.now();

        // 1. Gating Check
        const setting = await db.settings.get(AI_ENABLED_KEY);
        const aiEnabled = setting?.value ?? true;
        const privacyPolicy = await getEffectivePrivacyPolicyFromDb();

        if (!aiEnabled) {
            return this.createUnavailableResult(requestId, context, 'gated_off');
        }
        if (!privacyPolicy.canUseCloudAI) {
            return this.createUnavailableResult(requestId, context, 'policy_blocked');
        }

        // 2. Availability Check
        const isAvailable = await aiClient.isAvailable();
        if (!isAvailable) {
            return this.createUnavailableResult(requestId, context, 'llm_unreachable');
        }

        const promptTemplate = PROMPT_REGISTRY.GENERATE_PATCH;
        const modelName = aiClient.defaultModel;

        // 3. Log Request
        await evidenceLog.log(context.sessionId, EventType.AI_ANALYSIS_REQUESTED, { // Reuse event or add AI_PATCH_REQUESTED? Stick to ANALYSIS for now
            request_id: requestId,
            finding_id: context.findingId,
            input_hash: context.input_hash,
            prompt_id: promptTemplate.id,
            prompt_version: promptTemplate.version,
            model_name: modelName
        });

        try {
            // 4. Build Prompt & Call LLM
            const messages = promptTemplate.buildMessages(context, {
                includeCodeSnippet: privacyPolicy.canSendCodeSnippets,
                includeFilePath: privacyPolicy.canSendCodeSnippets,
            });
            const response = await aiClient.complete(messages, {
                model: modelName,
            });

            const latencyMs = Date.now() - startTime;
            const rawContent = response.content;

            // 5. Parse & Validate
            const cleanedJson = cleanJsonResponse(rawContent);
            let parsedObj: unknown;
            try {
                parsedObj = JSON.parse(cleanedJson);
            } catch (e) {
                await this.logFailure(requestId, context.sessionId, 'json_parse_error', latencyMs);
                return this.createErrorResult(requestId, context, modelName, latencyMs, rawContent, 'Failed to parse AI patch response');
            }

            const validatedPatch = validatePatchBundle(parsedObj);
            if (!validatedPatch) {
                await this.logFailure(requestId, context.sessionId, 'schema_validation_error', latencyMs);
                return this.createErrorResult(requestId, context, modelName, latencyMs, rawContent, 'AI patch missing required fields');
            }

            // 6. Compute Confidence (Heuristic)
            // Start with risk-based confidence? Or strict checking?
            const confidenceScore: 'HIGH' | 'MEDIUM' | 'LOW' = (validatedPatch.risk.level === 'high') ? 'LOW' : 'MEDIUM';
            // If risk is high, confidence in applying it safely is low? Or independent?
            // Let's stick to medium default.

            // 7. Build Result
            const provenance: Provenance = {
                request_id: requestId,
                prompt_id: promptTemplate.id,
                prompt_version: promptTemplate.version,
                input_hash: context.input_hash,
                model_name: response.model || modelName,
                latency_ms: latencyMs,
                generated_at: new Date().toISOString(),
                method: 'llm_completion'
            };

            const result: AIAnalysisResult = {
                fix: null, // No fix recommendation in this mode
                patch: validatedPatch,
                modelStatus: {
                    status: 'MODEL_DERIVED',
                    confidence: confidenceScore,
                    provenance
                }
            };

            // 8. Log Success
            await evidenceLog.log(context.sessionId, EventType.AI_ANALYSIS_COMPLETED, {
                request_id: requestId,
                finding_id: context.findingId,
                latency_ms: latencyMs,
                confidence: confidenceScore,
                prompt_version: promptTemplate.version,
                detail: 'patch_generated',
                snippet_shared: privacyPolicy.canSendCodeSnippets
            });

            return result;

        } catch (error: any) {
            const latencyMs = Date.now() - startTime;
            await this.logFailure(requestId, context.sessionId, 'llm_error', latencyMs, error.message);
            return this.createErrorResult(requestId, context, modelName, latencyMs, undefined, error.message);
        }
    }

    private createUnavailableResult(requestId: string, context: ResearchContext, reason: 'gated_off' | 'llm_unreachable' | 'policy_blocked'): AIAnalysisResult {
        return {
            fix: null,
            modelStatus: {
                status: 'UNAVAILABLE',
                confidence: 'NA',
                provenance: {
                    request_id: requestId,
                    input_hash: context.input_hash,
                    model_name: 'none',
                    latency_ms: 0,
                    generated_at: new Date().toISOString(),
                    method: reason
                }
            }
        };
    }

    private createErrorResult(
        requestId: string,
        context: ResearchContext,
        modelName: string,
        latencyMs: number,
        rawContent: string | undefined,
        errorMsg: string
    ): AIAnalysisResult {
        return {
            fix: null,
            raw: rawContent, // return raw content so UI can show it in debug/disclosure
            modelStatus: {
                status: 'ERROR',
                confidence: 'NA',
                provenance: {
                    request_id: requestId,
                    input_hash: context.input_hash,
                    model_name: modelName,
                    latency_ms: latencyMs,
                    generated_at: new Date().toISOString(),
                    method: 'llm_error'
                }
            }
        };
    }

    private async logFailure(requestId: string, sessionId: string, reason: string, latencyMs: number, errorDetail?: string) {
        await evidenceLog.log(sessionId, EventType.AI_ANALYSIS_FAILED, {
            request_id: requestId,
            reason,
            latency_ms: latencyMs,
            error: errorDetail
        });
    }
}

export const aiAnalysisService = new AIAnalysisService();
