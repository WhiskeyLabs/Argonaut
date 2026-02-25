import { UniversalFinding, Severity, FindingStatus, FindingType, FindingState, FindingStatusV2, Scope } from '../lib/types/finding';
import { SarifLogSchema } from '../lib/schemas/sarif';
import { workerBulkIngest, ScanSession } from '../lib/db';
import {
    InputErrorCode,
    StructuredInputError,
    buildStructuredInputError,
    detectErrorCodeFromMessage,
} from '../lib/errors/inputErrorGuidance';

// Message Types
type WorkerMessage =
    | { type: 'PARSE'; fileContent: string; fileName: string; sessionId: string; projectId?: string }
    | { type: 'PING' };

type WorkerResponse =
    | { type: 'SUCCESS'; stats: { count: number; duration: number; warnings: string[] } }
    | ({ type: 'ERROR'; error: string } & StructuredInputError)
    | { type: 'PONG' };

function isStructuredInputError(value: unknown): value is StructuredInputError {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<StructuredInputError>;
    return typeof candidate.code === 'string'
        && typeof candidate.userMessage === 'string'
        && Array.isArray(candidate.recoverySteps)
        && typeof candidate.retryable === 'boolean';
}

function normalizeWorkerInputError(err: unknown): StructuredInputError {
    if (isStructuredInputError(err)) return err;

    const raw = err as { name?: string; message?: string };
    const name = raw?.name || '';
    const detail = raw?.message || String(err || 'Unknown ingest error');

    let code: InputErrorCode = detectErrorCodeFromMessage(detail);
    if (code === 'UNKNOWN' && name === 'SyntaxError') {
        code = 'INVALID_JSON';
    }

    return buildStructuredInputError(code, detail);
}

// Helpers
function mapSeverity(level?: 'error' | 'warning' | 'note' | 'none'): { severity: Severity, rank: number } {
    switch (level) {
        case 'error': return { severity: 'critical', rank: 4 };
        case 'warning': return { severity: 'medium', rank: 2 }; // Default warning to medium
        case 'note': return { severity: 'info', rank: 0 };
        case 'none': return { severity: 'info', rank: 0 };
        default: return { severity: 'medium', rank: 2 };
    }
}

// Better Hash (cyrb53-like) for short strings
function stableHash(str: string): string {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

// Helper to guess Fix Action
function guessFixAction(text: string): UniversalFinding['fixAction'] {
    const t = text.toLowerCase();
    if (t.includes('upgrade') || t.includes('update') || t.includes('bump')) return 'upgrade_libraries';
    if (t.includes('sanitize') || t.includes('escape') || t.includes('validate')) return 'sanitize_inputs';
    if (t.includes('config') || t.includes('setting') || t.includes('enable') || t.includes('disable')) return 'config_changes';
    if (t.includes('review') || t.includes('check') || t.includes('audit')) return 'review_code';
    return 'other';
}

// --- Task 6.2.3.1: Derived Field Helpers ---

function computeCveId(ruleId: string): string | undefined {
    const m = ruleId.match(/^(CVE-\d{4}-\d{4,})$/i);
    return m ? m[1].toUpperCase() : undefined;
}

function computeReachabilityRank(r?: string): number {
    switch (r) {
        case 'reachable': return 0;
        case 'potentially_reachable': return 1;
        case 'unreachable': return 2;
        default: return 3; // unknown
    }
}

function computeEvidencePeek(finding: Partial<UniversalFinding>): UniversalFinding['evidencePeek'] {
    const snippet = finding.location?.snippet;
    if (snippet) return { kind: 'snippet', text: snippet.slice(0, 120) };
    if (finding.packageName) {
        return { kind: 'dependency', text: `${finding.packageName}@${finding.packageVersion || '?'}` };
    }
    return undefined;
}

function computeEvidenceScore(finding: Partial<UniversalFinding>): number {
    if (finding.location?.snippet) return 1;
    if (finding.evidencePeek?.text) return 1;
    return 0;
}

function isCveOrGhsa(id: string): boolean {
    return /^CVE-\d{4}-\d{4,}$/i.test(id) || /^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i.test(id);
}

function normalizeToolName(name: string): string {
    return (name || '').trim();
}

function classifyFinding(toolName: string, res: any, ruleId: string, messageText: string): FindingType {
    // 1) explicit hint if present
    const ft = res.properties?.findingType;
    if (typeof ft === 'string') {
        const v = ft.toLowerCase();
        if (v.includes('sca') || v.includes('dependency')) return 'SCA';
        if (v.includes('sast') || v.includes('code')) return 'SAST';
        if (v.includes('secret')) return 'SECRET';
        if (v.includes('iac') || v.includes('terraform') || v.includes('k8s')) return 'IAC';
    }

    // 2) ruleId patterns
    if (typeof ruleId === 'string' && isCveOrGhsa(ruleId)) return 'SCA';

    // 3) presence of package identity hints
    const p = res.properties || {};
    if (typeof p.purl === 'string' || typeof p.packageName === 'string' || typeof p.packageVersion === 'string' || typeof p.package === 'string') {
        return 'SCA';
    }

    // 4) tool-name hints (lightweight; keep conservative)
    const t = toolName.toLowerCase();
    if (t.includes('trivy') || t.includes('snyk') || t.includes('dependency')) return 'SCA';
    if (t.includes('codeql') || t.includes('semgrep') || t.includes('checkmarx')) return 'SAST';

    // 5) message heuristics (very light)
    const m = (messageText || '').toLowerCase();
    if (m.includes('vulnerable dependency') || (m.includes('package') && m.includes('cve-'))) return 'SCA';

    return 'OTHER';
}

function extractPackageIdentity(params: {
    toolName: string;
    findingType: FindingType;
    res: any;
    filepath: string;
}): { packageName?: string; packageVersion?: string; purl?: string; identitySource?: string } {
    const { toolName, findingType, res, filepath } = params;
    const props = res.properties || {};

    // Prefer purl if present
    if (typeof props.purl === 'string' && props.purl.trim()) {
        // Example: pkg:npm/lodash@4.17.21
        const purl = props.purl.trim();
        // Try to derive name/version from npm purl (best-effort)
        const m = purl.match(/^pkg:npm\/([^@]+(?:\/[^@]+)?)@(.+)$/);
        if (m) {
            return { packageName: decodeURIComponent(m[1]), packageVersion: decodeURIComponent(m[2]), purl, identitySource: 'properties.purl' };
        }
        return { purl, identitySource: 'properties.purl' };
    }

    // Direct common fields
    const packageName = typeof props.packageName === 'string' ? props.packageName : undefined;
    const packageVersion = typeof props.packageVersion === 'string' ? props.packageVersion : undefined;
    if (packageName) return { packageName, packageVersion, identitySource: 'properties.packageName' };

    // Handle package as string (name@version)
    if (typeof props.package === 'string' && props.package.includes('@')) {
        const lastAtIndex = props.package.lastIndexOf('@');
        if (lastAtIndex > 0) {
            const name = props.package.substring(0, lastAtIndex);
            const version = props.package.substring(lastAtIndex + 1);
            return { packageName: name, packageVersion: version, identitySource: 'properties.package (string)' };
        }
    }

    // A couple common vendor-ish patterns
    const comp = props.component || props.dependency || props.package;
    if (comp && typeof comp === 'object') {
        const n = typeof comp.name === 'string' ? comp.name : undefined;
        const v = typeof comp.version === 'string' ? comp.version : undefined;
        if (n) return { packageName: n, packageVersion: v, identitySource: 'properties.component|dependency|package' };
    }

    // Conditional filepath heuristic
    const t = (toolName || '').toLowerCase();
    const allowNodeModulesHeuristic =
        findingType === 'SCA' || t.includes('trivy') || t.includes('snyk');

    if (allowNodeModulesHeuristic && filepath.includes('node_modules/')) {
        const parts = filepath.split('node_modules/');
        if (parts[1]) {
            const pkgParts = parts[1].split('/');
            const nm = pkgParts[0].startsWith('@') ? `${pkgParts[0]}/${pkgParts[1]}` : pkgParts[0];
            return { packageName: nm, identitySource: 'filepath.node_modules' };
        }
    }

    return {};
}

// Logic
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB Safety Guard

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
    const start = performance.now();
    const { type } = e.data;
    const warnings: string[] = []; // Phase 2: Collect Warnings

    if (type === 'PING') {
        self.postMessage({ type: 'PONG' });
        return;
    }

    if (type === 'PARSE') {
        try {
            console.log('[Worker] Starting parsing...');
            const { fileContent, sessionId, fileName, projectId } = e.data;

            // 1. Safety Guard
            if (fileContent.length > MAX_FILE_SIZE) {
                throw buildStructuredInputError(
                    'INPUT_TOO_LARGE',
                    `File exceeds 100MB limit for Gen 1 Ingestion. sizeBytes=${fileContent.length}`
                );
            }

            const json = JSON.parse(fileContent);

            let findings: UniversalFinding[] = [];

            if (fileName.endsWith('package-lock.json')) {
                // Explicitly ignore package-lock.json if it somehow got here as a scan file
                throw new Error('package-lock.json cannot be parsed as a findings file.');
            }

            if (Array.isArray(json) || (json.findings && Array.isArray(json.findings)) || (json.Results && Array.isArray(json.Results))) {
                // HANDLING RAW JSON (Synthetic) OR TRIVY JSON
                let rawFindings: any[] = [];
                let isTrivy = false;

                if (Array.isArray(json)) {
                    rawFindings = json;
                } else if (json.findings) {
                    rawFindings = json.findings;
                } else if (json.Results) {
                    // TRIVY FORMAT
                    // Trivy groups by Target (Artifact), each Target has 'Vulnerabilities' array
                    isTrivy = true;
                    rawFindings = json.Results.flatMap((target: any) =>
                        (target.Vulnerabilities || []).map((v: any) => ({
                            ...v,
                            _trivyTarget: target.Target // Preserve target for filename
                        }))
                    );
                }

                // We re-normalize to ensure v4 fields (toolId, severityRank) are present
                findings = rawFindings.map((f: any) => {
                    // TRIVY MAPPING SPECIFIC
                    if (isTrivy) {
                        const severity = (f.Severity || 'UNKNOWN').toLowerCase();
                        const { rank, severity: normalizedSev } = mapSeverity(
                            severity === 'critical' ? 'error' :
                                severity === 'high' ? 'error' :
                                    severity === 'medium' ? 'warning' : 'note'
                        );

                        const title = f.Title || f.VulnerabilityID || 'Unknown Vulnerability';
                        const description = f.Description || '';

                        const trivyRuleId = f.VulnerabilityID || '';
                        const trivyReachability = 'unknown';
                        const trivyFinding: Partial<UniversalFinding> = {
                            id: stableHash(`${sessionId}::trivy::${trivyRuleId}::${f.PkgName}`),
                            title,
                            description,
                            ruleId: trivyRuleId,
                            tool: 'trivy',
                            toolId: 'trivy',
                            severity: normalizedSev,
                            severityRank: rank,
                            status: 'open',
                            sessionId,
                            packageName: f.PkgName,
                            location: {
                                filepath: f._trivyTarget || 'unknown',
                                startLine: 0
                            },
                            tags: f.References || [],
                            fixAction: guessFixAction(title + ' ' + description),
                            projectId,
                            cveId: computeCveId(trivyRuleId),
                            reachability: trivyReachability as any,
                            reachabilityRank: computeReachabilityRank(trivyReachability),
                            threatRank: 3, // Default; enriched later by TI service
                            evidenceScore: 0,
                            state: {
                                status: 'OPEN',
                                scope: 'INSTANCE'
                            } as FindingState
                        };
                        trivyFinding.evidencePeek = computeEvidencePeek(trivyFinding);
                        return trivyFinding as UniversalFinding;
                    }

                    // GENERIC / SYNTHETIC MAPPING (Existing Logic)
                    // Ensure Tool ID - safely handle if tool is object (SARIF structure) or string
                    const toolRaw = typeof f.tool === 'string' ? f.tool : (f.tool?.driver?.name || f.tool?.name || 'unknown');
                    const toolId = f.toolId || toolRaw.toLowerCase().replace(/[^a-z0-9]/g, '');

                    // Ensure Rank & Severity Mapping
                    let { rank, severity } = { rank: 0, severity: 'info' as Severity };

                    // Handle possibly uppercase severity from synthetic data
                    const rawSeverity = (f.severity || 'info').toLowerCase();

                    if (f.severityRank !== undefined) {
                        rank = f.severityRank;
                        severity = rawSeverity as Severity;
                    } else {
                        // Recalculate if missing or if rawSeverity was uppercase
                        const mapped = mapSeverity(
                            rawSeverity === 'critical' || rawSeverity === 'high' ? 'error' :
                                rawSeverity === 'medium' ? 'warning' : 'note'
                        );
                        rank = mapped.rank;
                        severity = mapped.severity;
                    }

                    // Handle Location Helper (Synthetic has location.path, we use location.filepath)
                    const location = {
                        filepath: f.location?.filepath || f.location?.path || 'unknown-file',
                        startLine: f.location?.startLine || 0,
                        endLine: f.location?.endLine,
                        snippet: f.location?.snippet
                    };

                    // Ensure Title/Desc exist (Synthetic data uses 'message' sometimes, or omits title)
                    const msg = f.message || f.description || '';
                    const title = f.title || f.ruleId || 'Untitled Finding';
                    const description = f.description || msg || f.ruleId || '';

                    // Ensure Status is lowercase (Synthetic has 'OPEN', we want 'open')
                    const status = (f.status || 'open').toLowerCase();

                    const genericReachability = f.reachability || 'unknown';
                    const genericFinding: Partial<UniversalFinding> = {
                        ...f,
                        id: f.id || stableHash(`${sessionId}::${toolId}::${f.ruleId}::${location.filepath}`),
                        toolId,
                        severity,
                        severityRank: rank,
                        status: status as FindingStatus,
                        title: title.slice(0, 200),
                        description,
                        sessionId,
                        location,
                        fixAction: f.fixAction || guessFixAction(title + ' ' + description),
                        projectId,
                        cveId: computeCveId(f.ruleId || ''),
                        reachability: genericReachability,
                        reachabilityRank: computeReachabilityRank(genericReachability),
                        threatRank: 3,
                        evidenceScore: typeof f.evidenceScore === 'number' ? f.evidenceScore : undefined,
                        state: {
                            status: 'OPEN',
                            scope: 'INSTANCE'
                        } as FindingState
                    };
                    genericFinding.evidencePeek = computeEvidencePeek(genericFinding);
                    genericFinding.evidenceScore = computeEvidenceScore(genericFinding);
                    return genericFinding as UniversalFinding;
                });

            } else {
                // HANDLING SARIF IMPORT
                const result = SarifLogSchema.safeParse(json);

                if (!result.success) {
                    throw new Error(`Invalid SARIF format (and not recognized as JSON/Trivy): ${result.error.issues[0]?.message || 'Unknown error'}`);
                }

                const log = result.data;

                for (let runIndex = 0; runIndex < log.runs.length; runIndex++) {
                    const run = log.runs[runIndex];
                    const toolName = normalizeToolName(run.tool?.driver?.name || 'unknown-tool');

                    if (!run.results) continue;

                    for (let resultIndex = 0; resultIndex < run.results.length; resultIndex++) {
                        const res = run.results[resultIndex];
                        const ruleId = res.ruleId || 'unknown-rule';

                        const location = res.locations?.[0]?.physicalLocation;
                        const filepath = location?.artifactLocation?.uri || 'unknown-file';
                        const startLine = location?.region?.startLine || 0;
                        const messageText = res.message?.text || '';

                        // 1) Classify
                        const findingType: FindingType = classifyFinding(toolName, res, ruleId, messageText);

                        // 2) Extract Identity
                        const ident = extractPackageIdentity({ toolName, findingType, res, filepath });
                        const packageName = ident.packageName;
                        const packageVersion = ident.packageVersion;
                        const purl = ident.purl;

                        // 3) Dedupe Strategy
                        const messageFingerprint = stableHash(messageText);
                        const scaIdentity = purl || `${packageName || 'nopkg'}@${packageVersion || 'noversion'}`;
                        const dedupeInput =
                            findingType === 'SCA'
                                ? `${toolName}::${ruleId}::${scaIdentity}`
                                : `${toolName}::${ruleId}::${filepath}::${startLine}`;

                        const dedupeKey = stableHash(dedupeInput);
                        // Keep dedupeKey stable for grouping/history, but keep each SARIF result row unique.
                        const id = stableHash(`${sessionId}::${dedupeKey}::run${runIndex}::result${resultIndex}`);

                        const { severity, rank } = mapSeverity(res.level);
                        const toolId = toolName.toLowerCase().replace(/[^a-z0-9]/g, '');

                        const tags: string[] = [];
                        if (typeof res.properties?.findingType === 'string') tags.push(res.properties.findingType);
                        if (typeof res.properties?.cve === 'string') tags.push(res.properties.cve);
                        if (isCveOrGhsa(ruleId)) tags.push(ruleId);

                        const sarifLocation = {
                            filepath,
                            startLine,
                            endLine: location?.region?.endLine,
                            snippet: location?.region?.snippet?.text
                        };
                        const sarifPartial: Partial<UniversalFinding> = {
                            id,
                            ruleId,
                            title: messageText.slice(0, 100) || ruleId,
                            description: messageText,
                            severity,
                            status: 'open',
                            tool: toolName,
                            toolId,
                            severityRank: rank,
                            sessionId,
                            packageName,
                            packageVersion,
                            purl,
                            findingType,
                            runIndex,
                            dedupeKey,
                            messageFingerprint,
                            tags,
                            location: sarifLocation,
                            fixAction: guessFixAction(messageText + ' ' + ruleId),
                            reachability: 'unknown',
                            reachabilityRank: computeReachabilityRank('unknown'),
                            threatRank: 3,
                            evidenceScore: 0,
                            cveId: computeCveId(ruleId),
                            projectId,
                            state: {
                                status: 'OPEN',
                                scope: 'INSTANCE'
                            } as FindingState
                        };
                        sarifPartial.evidencePeek = computeEvidencePeek(sarifPartial);
                        sarifPartial.evidenceScore = computeEvidenceScore(sarifPartial);
                        const finding = sarifPartial as UniversalFinding;
                        findings.push(finding);
                    }
                }
            }

            // 3. Compute Session Diagnostics
            const uniqueIdCount = new Set(findings.map(f => f.id)).size;
            if (uniqueIdCount !== findings.length) {
                warnings.push(
                    `ID collisions detected during ingest: ${findings.length - uniqueIdCount} duplicate rows were overwritten.`
                );
            }

            const toolsFound = Array.from(new Set(findings.map(f => f.tool)));
            const counts: Record<string, number> = {};
            findings.forEach(f => {
                const ft = f.findingType || 'OTHER';
                counts[ft] = (counts[ft] || 0) + 1;
            });

            // Count usable SCA identities (for match rate base)
            const scaWithId = findings.filter(f => f.findingType === 'SCA' && (f.purl || f.packageName)).length;

            const diagnostics: ScanSession['meta'] = {
                diagnostics: {
                    tools: toolsFound,
                    counts,
                    scaCount: scaWithId
                }
            };

            // 4. Direct DB Write (Transaction Safe)
            console.log(`[Worker] Bulk writing ${findings.length} findings to DB...`);
            await workerBulkIngest(sessionId, findings, diagnostics);
            console.log('[Worker] DB Write Complete.');

            const duration = performance.now() - start;

            self.postMessage({
                type: 'SUCCESS',
                stats: { count: findings.length, duration, warnings }
            } as WorkerResponse);

        } catch (err: any) {
            const normalized = normalizeWorkerInputError(err);
            self.postMessage({
                type: 'ERROR',
                error: normalized.userMessage,
                ...normalized
            } as WorkerResponse);
        }
    }
};
