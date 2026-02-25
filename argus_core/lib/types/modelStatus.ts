/**
 * Model Status & Provenance Types — Epic 4 Logic Plane
 *
 * Defines the attribution system for all inferred/computed data.
 * Every piece of non-raw data in the system must declare its
 * Status (how it was derived) and Confidence (how reliable it is).
 *
 * Task 4.4: Extended Provenance with full audit fields.
 */

export type ModelConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NA';

export type ModelStatusType = 'REAL' | 'HEURISTIC' | 'MODEL_DERIVED' | 'UNAVAILABLE' | 'ERROR';

/** Method that produced the status — used for consistent UI badge rendering */
export type ProvenanceMethod =
    | 'gated_off'        // AI toggle is OFF
    | 'llm_unreachable'  // LLM server not reachable
    | 'llm_error'        // LLM call or parse failed
    | 'llm_completion'   // Successful LLM analysis
    | 'heuristic'        // Rule-based computation
    | 'real';            // Direct/measured data

export interface Provenance {
    request_id?: string;       // UUID per analysis request
    prompt_id?: string;        // e.g. "SUGGESTED_FIX"
    prompt_version?: string;   // e.g. "v1"
    input_hash?: string;       // SHA-256 from ResearchContext
    model_name: string;        // e.g. "Qwen/Qwen2.5-Coder-7B-Instruct" or "heuristic"
    model_version?: string;    // If reported by endpoint
    temperature?: number;
    latency_ms: number;
    generated_at: string;      // ISO timestamp
    method: ProvenanceMethod;
}

export interface ModelStatus {
    status: ModelStatusType;
    confidence: ModelConfidence;
    provenance: Provenance;
}

// Re-export for easier imports
export type { ModelConfidence as Confidence };
