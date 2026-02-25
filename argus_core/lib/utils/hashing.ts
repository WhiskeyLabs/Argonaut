/**
 * Resilient Canonical Hashing — Task 4.3, Step 2
 *
 * Provides a deterministic SHA-256 hash from any plain object.
 * Uses canonical JSON (sorted keys) to guarantee that key insertion
 * order never affects the output.
 *
 * Environment strategy:
 *   1. Web Crypto API (crypto.subtle) — works in browsers & Workers
 *   2. Node.js `crypto` module — SSR / test / CI fallback
 *
 * ADR-008: Canonical Input Hashing for Context Reproducibility
 */

// ─── Canonical JSON ──────────────────────────────────────────────

/**
 * Produce a deterministic JSON string with **sorted keys** at every
 * nesting depth.  `undefined` values are dropped (same as JSON.stringify).
 */
export function stableStringify(obj: unknown): string {
    return JSON.stringify(obj, (_key, value) => {
        // Arrays: preserve order
        if (Array.isArray(value)) return value;

        // Plain objects: sort keys
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            return Object.keys(value)
                .sort()
                .reduce<Record<string, unknown>>((sorted, k) => {
                    sorted[k] = (value as Record<string, unknown>)[k];
                    return sorted;
                }, {});
        }

        return value;
    });
}

// ─── SHA-256 Hashing ─────────────────────────────────────────────

/**
 * Compute SHA-256 hex digest of any plain object using canonical JSON.
 * Works across Browser, Worker, Node, and SSR environments.
 */
export async function computeStableHash(obj: unknown): Promise<string> {
    const canonical = stableStringify(obj);

    // Strategy 1: Web Crypto API (browser / worker / edge runtime)
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
        const encoder = new TextEncoder();
        const data = encoder.encode(canonical);
        const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
        return bufferToHex(hashBuffer);
    }

    // Strategy 2: Node.js crypto (SSR / tests)
    try {
        const { createHash } = await import('crypto');
        return createHash('sha256').update(canonical).digest('hex');
    } catch {
        // Strategy 3: ultimate fallback — simple djb2-style hash (NOT cryptographic)
        // This should never be hit in practice but keeps the system functional.
        console.warn('[hashing] No crypto API available, using non-cryptographic fallback');
        return fallbackHash(canonical);
    }
}

// ─── Helpers ─────────────────────────────────────────────────────

function bufferToHex(buffer: ArrayBuffer): string {
    const byteArray = new Uint8Array(buffer);
    return Array.from(byteArray)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Non-cryptographic fallback (djb2 variant).
 * Only used if both Web Crypto AND Node crypto are unavailable.
 * Prefix with "fallback-" to make it obvious this isn't SHA-256.
 */
function fallbackHash(input: string): string {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
    }
    // Convert to positive hex string
    return `fallback-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
