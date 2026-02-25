/**
 * ContextService — Task 4.3, Step 3
 *
 * The "Brain's Context Engine".  Aggregates data from the findings store,
 * sessions store into a single normalised ResearchContext
 * that any downstream logic (heuristic or AI) can consume deterministically.
 *
 * Design contract (ADR-008):
 *   - input_hash = SHA-256( canonical-JSON({ identity, location, snippetNormalized }) )
 *   - Availability map is explicit — no silent simulation of missing data
 */

import { db } from '../db';
import { UniversalFinding } from '../types/finding';
import {
    ResearchContext,
    ContextIdentity,
    ContextLocation,
    ContextSnippet,
    ContextMeta,
    ContextAvailability,
    NormalizedSeverity,
    NormalizedStatus,
    MAX_SNIPPET_LENGTH,
} from '../types/research';
import { computeStableHash } from '../utils/hashing';

// ─── Snippet Normalization ───────────────────────────────────────

/**
 * Normalize a code snippet for hashing stability:
 *   1. Trim leading/trailing whitespace
 *   2. Normalize line-endings (\r\n → \n)
 *   3. Cap at MAX_SNIPPET_LENGTH characters
 */
function normalizeSnippet(raw: string | null | undefined): string | null {
    if (!raw) return null;

    let normalized = raw
        .replace(/\r\n/g, '\n')  // Normalize Windows line-endings
        .replace(/\r/g, '\n')    // Normalize old Mac line-endings
        .trim();

    // Cap at max length
    if (normalized.length > MAX_SNIPPET_LENGTH) {
        normalized = normalized.substring(0, MAX_SNIPPET_LENGTH);
    }

    return normalized.length > 0 ? normalized : null;
}

// ─── Severity / Status Normalization ────────────────────────────

function normalizeSeverity(raw: string): NormalizedSeverity {
    const upper = raw.toUpperCase();
    const valid: NormalizedSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
    return valid.includes(upper as NormalizedSeverity)
        ? (upper as NormalizedSeverity)
        : 'INFO'; // safe default
}

function normalizeStatus(raw: string): NormalizedStatus {
    const upper = raw.toUpperCase();
    if (upper === 'FIXED') return 'FIXED';
    if (upper === 'IGNORED' || upper === 'RISK_ACCEPTED' || upper === 'FALSE_POSITIVE') return 'IGNORED';
    return 'OPEN'; // default for 'open', 'in_progress', anything else
}

// ─── Hash Input Shape ───────────────────────────────────────────

/**
 * The exact shape fed into computeStableHash.
 * This is the contract: if ANY of these fields change, the hash changes.
 * If none change, the hash is identical — regardless of event activity.
 */
interface HashInput {
    tool: string;
    ruleId: string;
    normalizedSeverity: NormalizedSeverity;
    cveId: string | null;
    packageName: string | null;
    path: string | null;
    startLine: number | null;
    endLine: number | null;
    snippetNormalized: string | null;
}

// ─── Public API ─────────────────────────────────────────────────

export class ContextService {

    /**
     * Build a complete ResearchContext for a finding.
     *
     * @throws {Error} if finding not found or session mismatch
     */
    async getDetailedContext(
        findingId: string,
        expectedSessionId?: string,
    ): Promise<ResearchContext> {
        // 1. Fetch the finding
        const finding = await db.findings.where('id').equals(findingId).first();
        if (!finding) {
            throw new Error(`[ContextService] Finding not found: ${findingId}`);
        }

        // 2. Optional session guard
        if (expectedSessionId && finding.sessionId !== expectedSessionId) {
            throw new Error(
                `[ContextService] Session mismatch: expected ${expectedSessionId}, got ${finding.sessionId}`,
            );
        }

        // 3. Build structured blocks
        const identity = this.buildIdentity(finding);
        const location = this.buildLocation(finding);
        const snippet = this.buildSnippet(finding);
        const meta = this.buildMeta(finding);

        // 4. Build availability map
        const availability = this.buildAvailability(snippet, location, identity);

        // 6. Compute input_hash (identity + location + normalized snippet only)
        const hashInput: HashInput = {
            tool: identity.tool,
            ruleId: identity.ruleId,
            normalizedSeverity: identity.normalizedSeverity,
            cveId: identity.cveId,
            packageName: identity.packageName,
            path: location.path,
            startLine: location.startLine,
            endLine: location.endLine,
            snippetNormalized: snippet.normalized,
        };
        const input_hash = await computeStableHash(hashInput);

        // 6. Assemble the full context
        const normalizedSeverity = identity.normalizedSeverity;
        const normalizedStatus = normalizeStatus(finding.status);

        return {
            // Structured blocks
            identity,
            location,
            snippet,
            meta,
            availability,

            // Provenance
            input_hash,

            // Backward-compat display fields
            title: finding.title,
            severity: normalizedSeverity,
            status: normalizedStatus,
            tool: identity.tool,
            cve: identity.cveId,
            packageName: identity.packageName,
            stableHash: finding.dedupeKey,
            description: finding.description || '',
            tags: identity.tags,

            // Live Analysis (Task 4.7)
            dependencyAnalysis: finding.dependencyAnalysis,
            userOverride: finding.userOverride,

            // Remediation
            fixAction: finding.fixAction,
            fixActionLabel: finding.fixActionLabel,
        };
    }

    // ─── Private builders ────────────────────────────────────

    private buildIdentity(f: UniversalFinding): ContextIdentity {
        return {
            tool: f.tool,
            ruleId: f.ruleId,
            normalizedSeverity: normalizeSeverity(f.severity),
            cveId: f.ruleId.startsWith('CVE') ? f.ruleId : null,
            packageName: f.packageName || null,
            packageVersion: f.packageVersion || null,
            tags: f.tags || [],
        };
    }

    private buildLocation(f: UniversalFinding): ContextLocation {
        return {
            path: f.location.filepath || null,
            startLine: f.location.startLine ?? null,
            endLine: f.location.endLine ?? null,
        };
    }

    private buildSnippet(f: UniversalFinding): ContextSnippet {
        const raw = f.location.snippet || null;
        return {
            raw,
            normalized: normalizeSnippet(raw),
        };
    }

    private buildMeta(f: UniversalFinding): ContextMeta {
        return {
            sessionId: f.sessionId,
            findingId: f.id,
            ingestionTimestamp: Date.now(), // TODO: persist actual ingestion time on UniversalFinding
            toolVersion: null,             // TODO: add toolVersion to UniversalFinding schema
        };
    }

    private buildAvailability(
        snippet: ContextSnippet,
        location: ContextLocation,
        identity: ContextIdentity,
    ): ContextAvailability {
        return {
            hasSnippet: snippet.normalized !== null,
            hasEndLine: location.endLine !== null,
            hasCve: identity.cveId !== null,
            hasPackage: identity.packageName !== null,
            hasLockfile: false, // Future capability
        };
    }
}

/** Singleton instance for convenience */
export const contextService = new ContextService();
