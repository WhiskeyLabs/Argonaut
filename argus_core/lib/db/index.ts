import Dexie, { Table } from 'dexie';
import { UniversalFinding, Project, FindingEvent } from '../types/finding';
import { ThreatIntel, ThreatMeta } from '../types/threat';
import { AppEvent } from '../types/events';

export type SessionState = 'IMPORTING' | 'READY' | 'FAILED';

export interface ScanSession {
    id: string;             // UUID
    timestamp: number;
    filename: string;
    findingCount: number;
    tool: string;
    state: SessionState;
    schemaVersion: number;
    projectId?: string;     // Link to project context for history grouping
    activeLockfileArtifactId?: string; // Pointer to the currently active lockfile
    meta?: {
        diagnostics?: {
            tools: string[];
            counts: Record<string, number>; // counts.SCA, counts.SAST etc
            scaCount?: number;             // Number of SCA findings with usable package identity
            matchRate?: {
                matched: number;
                total: number;
                pct: number;
            };
        };
    };
}

export interface SettingsEntry {
    key: string;   // Primary key (e.g. 'ai_enabled')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any;
}

export type ArtifactType = 'NPM_LOCKFILE' | 'SARIF' | 'OTHER';

export interface SessionArtifact {
    artifactId: string;          // PK: hash(sessionId + filename + contentHash)
    sessionId: string;           // indexed
    artifactType: ArtifactType;  // indexed
    filename: string;            // required for lockfile UX
    contentHash: string;         // indexed
    sizeBytes: number;
    content: string | Blob;
    createdAt: number;
    meta?: { lockfileVersion?: number; detectedEcosystem?: 'npm' };
}

export interface FixSuggestionArtifact {
    id: string;              // PK: UUID
    findingId: string;       // indexed
    sessionId: string;       // indexed
    status: 'PENDING' | 'READY' | 'APPLIED' | 'FAILED';
    type: 'Upgrade' | 'Config' | 'Code';
    summary: string;
    patch: {
        before: string;
        after: string;
    };
    confidence: number;
    createdAt: number;
    updatedAt: number;       // indexed (Task 6.1.3)
    isLatestForFinding: number; // 1 or 0 (indexed)
    cacheKey: string;        // indexed (Task 6.1.3)
    source: {
        type: 'GENERAI_MODEL' | 'STATIC_RULE' | 'CVE_ADVISORY';
        ref: string;
    };
    promptId?: string;
    promptVersion?: string;
    modelName?: string;
    temperature?: number;
    modelStatus?: {
        provenance: {
            model_name: string;
            latency_ms: number;
        };
    };
}

export interface RecentArtifact {
    recentId: string;            // PK: hash(artifactType + filename + contentHash)
    artifactType: ArtifactType;  // indexed (filter to NPM_LOCKFILE)
    filename: string;
    contentHash: string;         // indexed
    sizeBytes: number;
    content: string | Blob;
    createdAt: number;
    lastUsedAt: number;          // indexed for LRU
    meta?: { lockfileVersion?: number; detectedEcosystem?: 'npm' };
}

export interface DerivedGraphIndex {
    indexId: string;             // PK: hash(sessionId + lockfileArtifactId + schemaVersion)
    sessionId: string;           // indexed
    lockfileArtifactId: string;  // indexed
    schemaVersion: number;       // for blob format
    lockfileVersion?: number;
    nodeCount: number;
    edgeCount: number;
    graphHash?: string;
    indexBlob: Blob;
    createdAt: number;
}

export class ArgusDatabase extends Dexie {
    findings!: Table<UniversalFinding, string>; // PK is id
    sessions!: Table<ScanSession, string>;      // PK is id
    projects!: Table<Project, string>;          // PK is id
    settings!: Table<SettingsEntry, string>;    // PK is key
    session_artifacts!: Table<SessionArtifact, string>; // PK is artifactId
    recent_artifacts!: Table<RecentArtifact, string>; // PK is recentId
    derived_graph_indices!: Table<DerivedGraphIndex, string>; // PK is indexId
    events!: Table<AppEvent, string>; // PK is id
    finding_events!: Table<FindingEvent, string>; // PK is id
    threat_intel!: Table<ThreatIntel, string>; // PK is cveId
    ti_meta!: Table<ThreatMeta, string>; // PK is source
    fix_suggestions!: Table<FixSuggestionArtifact, string>; // PK is id

    constructor() {
        super('ArgusStartDB');

        // Consolidating schema to version 21: Fixing Research page crash by adding missing index.
        // Version 22/23 - AI Result Caching & Recovery from dropped tables
        // Version 24 - Adding [findingId+isLatestForFinding] index for efficient retrieval
        // Version 25 - Full sortable-index coverage for triage grid performance
        // Version 26 - Session history indexes for project grouping + resolver lookups
        this.version(25).stores({
            // Core Tables
            findings:
                'id, sessionId, projectId, tool, toolId, severity, status, ' +
                '[sessionId+tool], [sessionId+toolId], [projectId+state.status], ' +
                '[sessionId+severityRank], [sessionId+severity], [sessionId+status], ' +
                '[sessionId+reachabilityRank], [sessionId+threatRank], [sessionId+packageName], ' +
                '[sessionId+title], [sessionId+ruleId], [sessionId+location.filepath], [sessionId+evidenceScore]',
            sessions: 'id, timestamp',
            projects: 'id, name, updatedAt',
            settings: 'key',

            // Artifacts & Graphs
            session_artifacts: 'artifactId, sessionId, artifactType, contentHash, [sessionId+artifactType]',
            recent_artifacts: 'recentId, artifactType, lastUsedAt, contentHash, [artifactType+lastUsedAt]',
            derived_graph_indices: 'indexId, sessionId, lockfileArtifactId',

            // Events
            events: 'id, sessionId, type, timestamp, [sessionId+timestamp]',
            finding_events: 'id, findingId, type, timestamp, [findingId+timestamp]',

            // Task 5.3 - Threat Intelligence
            threat_intel: 'cveId, kev, epssScore, lastUpdated',

            // Task 5.3.1 - Threat Feed Health Meta
            ti_meta: 'source',

            // Task 5.4 / 6.1.3 - Fix Suggestions (Persistence & Caching)
            fix_suggestions: 'id, findingId, sessionId, status, cacheKey, isLatestForFinding, [findingId+isLatestForFinding], [sessionId+findingId], [sessionId+findingId+isLatestForFinding]'
        }).upgrade(async tx => {
            // Non-destructive backfill for legacy rows
            const fixSuggestions = tx.table('fix_suggestions');
            await fixSuggestions.toCollection().modify(f => {
                f.updatedAt = f.updatedAt ?? f.createdAt ?? Date.now();
                if (!f.cacheKey) {
                    f.cacheKey = `legacy:${f.id}`;
                }
                if (f.temperature === undefined) {
                    f.temperature = 0.3;
                }
            });

            // Non-destructive backfill for findings sort/index fields
            const findings = tx.table('findings');
            await findings.toCollection().modify((f: Partial<UniversalFinding>) => {
                if (!f.toolId && f.tool) {
                    f.toolId = String(f.tool).toLowerCase().replace(/[^a-z0-9]/g, '');
                }
                if (f.reachabilityRank == null) {
                    const r = String(f.reachability || 'unknown').toLowerCase();
                    f.reachabilityRank =
                        r === 'reachable' ? 0 :
                            r === 'potentially_reachable' ? 1 :
                                r === 'unreachable' ? 2 : 3;
                }
                if (f.threatRank == null) {
                    f.threatRank = 3;
                }
                if (f.evidenceScore == null) {
                    f.evidenceScore = f.location?.snippet ? 1 : (f.evidencePeek?.text ? 1 : 0);
                }
            });
        });

        this.version(26).stores({
            // Core Tables
            findings:
                'id, sessionId, projectId, tool, toolId, severity, status, ' +
                '[sessionId+tool], [sessionId+toolId], [projectId+state.status], ' +
                '[sessionId+severityRank], [sessionId+severity], [sessionId+status], ' +
                '[sessionId+reachabilityRank], [sessionId+threatRank], [sessionId+packageName], ' +
                '[sessionId+title], [sessionId+ruleId], [sessionId+location.filepath], [sessionId+evidenceScore]',
            sessions: 'id, timestamp, projectId, state, [projectId+timestamp], [state+timestamp]',
            projects: 'id, name, updatedAt',
            settings: 'key',

            // Artifacts & Graphs
            session_artifacts: 'artifactId, sessionId, artifactType, contentHash, [sessionId+artifactType]',
            recent_artifacts: 'recentId, artifactType, lastUsedAt, contentHash, [artifactType+lastUsedAt]',
            derived_graph_indices: 'indexId, sessionId, lockfileArtifactId',

            // Events
            events: 'id, sessionId, type, timestamp, [sessionId+timestamp]',
            finding_events: 'id, findingId, type, timestamp, [findingId+timestamp]',

            // Task 5.3 - Threat Intelligence
            threat_intel: 'cveId, kev, epssScore, lastUpdated',

            // Task 5.3.1 - Threat Feed Health Meta
            ti_meta: 'source',

            // Task 5.4 / 6.1.3 - Fix Suggestions (Persistence & Caching)
            fix_suggestions: 'id, findingId, sessionId, status, cacheKey, isLatestForFinding, [findingId+isLatestForFinding], [sessionId+findingId], [sessionId+findingId+isLatestForFinding]'
        });
    }
}

export const db = new ArgusDatabase();

// Worker Helper: Write findings directly with Transaction Safety
export async function workerBulkIngest(sessionId: string, findings: UniversalFinding[], meta?: ScanSession['meta']) {
    // Phase 2 Guarantee: Transactional Integrity
    await db.transaction('rw', db.findings, db.sessions, db.projects, async () => {
        // We could batch here if array > 10k, but let's assume worker handles batching or
        // 50k is acceptable for a single tx in Dexie (usually is).
        await db.findings.bulkPut(findings);

        if (meta) {
            await db.sessions.update(sessionId, { meta });
        }
    });
}
