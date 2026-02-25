/**
 * Argus Local AI Client — Task 4.4
 *
 * Connects to a standard OpenAI-compatible endpoint (e.g., llama.cpp, vLLM).
 * Configurable model/temperature/timeout. Supports AbortSignal for cancellation.
 */
import { getEffectivePrivacyPolicyFromDb } from '@/lib/privacy/policy';

export interface AIResponse {
    content: string;
    model?: string;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
    };
}

export interface AIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface CompletionOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
    timeoutMs?: number;
}

const DEFAULT_ENDPOINT = '/api/ai';
// Single source of truth for browser-side default model selection.
// Must match GPU deployment default (scripts/deploy_gpu.sh -> AI_MODEL).
const DEFAULT_MODEL = process.env.NEXT_PUBLIC_AI_MODEL || 'Qwen/Qwen2.5-Coder-7B-Instruct';
const DEFAULT_TEMPERATURE = 0.3; // Low temp for deterministic JSON output
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_TIMEOUT_MS = 30_000;

export class LocalAIClient {
    private endpoint: string;

    constructor(endpoint: string = DEFAULT_ENDPOINT) {
        this.endpoint = endpoint;
    }

    /** Default model name for provenance tracking */
    get defaultModel(): string {
        return DEFAULT_MODEL;
    }

    /**
     * Check if the local AI server is reachable.
     */
    async isAvailable(): Promise<boolean> {
        try {
            const policy = await getEffectivePrivacyPolicyFromDb();
            if (!policy.canUseCloudAI) return false;
            const res = await fetch(this.endpoint.replace('/chat/completions', '/models'), {
                method: 'GET',
                headers: { 'x-argus-privacy-intent': 'ai-cloud-assistance' },
                signal: AbortSignal.timeout(2000),
            });
            return res.ok;
        } catch {
            return false;
        }
    }

    /**
     * Generate a completion for a given prompt.
     */
    async complete(messages: AIMessage[], opts: CompletionOptions = {}): Promise<AIResponse> {
        const policy = await getEffectivePrivacyPolicyFromDb();
        if (!policy.canUseCloudAI) {
            throw new Error('Privacy policy blocks hosted AI assistance.');
        }

        const {
            model = DEFAULT_MODEL,
            temperature = DEFAULT_TEMPERATURE,
            maxTokens = DEFAULT_MAX_TOKENS,
            signal,
            timeoutMs = DEFAULT_TIMEOUT_MS,
        } = opts;

        // Combine user-provided abort signal with timeout
        const timeoutSignal = AbortSignal.timeout(timeoutMs);
        const combinedSignal = signal
            ? AbortSignal.any([signal, timeoutSignal])
            : timeoutSignal;

        try {
            const res = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-argus-privacy-intent': 'ai-cloud-assistance',
                    'x-argus-ai-allow-snippets': policy.canSendCodeSnippets ? '1' : '0',
                },
                body: JSON.stringify({
                    messages,
                    model,
                    temperature,
                    max_tokens: maxTokens,
                    stream: false,
                }),
                signal: combinedSignal,
            });

            if (!res.ok) {
                throw new Error(`AI Server responded with ${res.status}: ${res.statusText}`);
            }

            const data = await res.json();
            return {
                content: data.choices[0].message.content,
                model: data.model || model,
                usage: data.usage,
            };
        } catch (error) {
            console.error('[LocalAIClient] Error:', error);
            throw error;
        }
    }
}

export const aiClient = new LocalAIClient();
