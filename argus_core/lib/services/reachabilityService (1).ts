import Dexie from 'dexie';
import { db } from '../db';
import { ResearchContext, NormalizedSeverity } from '../types/research';
import { EventType } from '../types/events';
import {
    ReachabilityResult,
    ReachabilityStatus,
    ReachabilityNode,
    ReachabilityEdge,
    MatchStrategy,
    ReachabilityNodeType,
    ReachabilityEvidence
} from '../types/reachability';

// ─── Worker Interface ──────────────────────────────────────────

interface WorkerGraphResult {
    nodes: Record<string, unknown>;
    edges: unknown[];
    lookup: Record<string, string[]>;
    rootNodeId: string;
    parentsByNode: Record<string, string[]>;
    nodesByName: Record<string, string[]>;
    idMap: Record<string, { name: string; version: string; isDev: boolean }>;
}

let globalWorker: Worker | null = null;

function getWorker(): Worker {
    if (typeof window === 'undefined') {
        throw new Error('ReachabilityService can only run on client');
    }
    if (!globalWorker) {
        globalWorker = new Worker(new URL('../../workers/lockfile.worker.ts', import.meta.url));
    }
    return globalWorker;
}

// ─── Service Implementation ────────────────────────────────────



// ─── Service Implementation ────────────────────────────────────

class ReachabilityService {

    // In-memory cache for graph results: sessionId -> Result
    private graphCache = new Map<string, ReachabilityResult>();

    // In-memory cache for lockfile content: sessionId -> content
    private lockfileCache = new Map<string, string>();

    /**
     * Set the lockfile for a session. Persists to Dexie + Memory.
     */
    /**
     * Set the lockfile for a session. Persists to Dexie + Memory.
     * Generates a SessionArtifact and updates the Global LRU (recent_artifacts).
     */
    async setLockfile(sessionId: string, content: string, filename: string = 'package-lock.json'): Promise<void> {
        this.lockfileCache.set(sessionId, content);

        try {
            // 1. Compute Hashes
            const contentHash = await this.computeHash(content);
            const artifactType = 'NPM_LOCKFILE' as const;

            // artifactId = hash(sessionId + filename + contentHash)
            const artifactId = await this.computeHash(sessionId + filename + contentHash);

            // recentId = hash(artifactType + filename + contentHash)
            const recentId = await this.computeHash(artifactType + filename + contentHash);

            const sizeBytes = new Blob([content]).size;
            const now = Date.now();

            // 2. Prepare Objects
            const sessionArtifact = {
                artifactId,
                sessionId,
                artifactType,
                filename,
                contentHash,
                sizeBytes,
                content,
                createdAt: now,
                meta: { detectedEcosystem: 'npm' as const }
            };

            const recentArtifact = {
                recentId,
                artifactType,
                filename,
                contentHash,
                sizeBytes,
                content, // Store full content for easy "use recent" without re-fetch
                createdAt: now, // Creation of the recent entry (or original file)? Let's use now for new entry.
                lastUsedAt: now,
                meta: { detectedEcosystem: 'npm' as const }
            };

            // 3. Transactional Write + LRU Enforce
            await db.transaction('rw', db.session_artifacts, db.sessions, db.recent_artifacts, async () => {
                // A. Save Session Artifact
                await db.session_artifacts.put(sessionArtifact);

                // B. Update Session Pointer
                await db.sessions.update(sessionId, {
                    activeLockfileArtifactId: artifactId
                });

                // C. Upsert Recent Artifact
                // If exists (same content+filename), this puts replaces it, updating lastUsedAt
                await db.recent_artifacts.put(recentArtifact);

                // D. Enforce LRU (Keep max 5 NPM_LOCKFILEs)
                const recentCount = await db.recent_artifacts
                    .where('[artifactType+lastUsedAt]')
                    .between(['NPM_LOCKFILE', Dexie.minKey], ['NPM_LOCKFILE', Dexie.maxKey])
                    .count();

                if (recentCount > 5) {
                    // Find the oldest (lowest lastUsedAt)
                    const oldest = await db.recent_artifacts
                        .where('[artifactType+lastUsedAt]')
                        .between(['NPM_LOCKFILE', Dexie.minKey], ['NPM_LOCKFILE', Dexie.maxKey])
                        .limit(recentCount - 5) // Delete extras
                        .primaryKeys();

                    if (oldest.length > 0) {
                        await db.recent_artifacts.bulkDelete(oldest as string[]);
                    }
                }
            });

            // 4. Trigger Worker Build? 
            // The prompt implies we might want to do this. For now, we've set the stage.
            // The UI will likely call buildGraph -> which runs the worker.
            console.log(`[Reachability] Lockfile set: ${artifactId}`);

        } catch (e) {
            console.error('[Reachability] Failed to persist lockfile', e);
            throw e; // Propagate error so UI knows
        }
    }

    /**
     * Cache a lockfile to Recent Artifacts without attaching to a session.
     */
    async cacheLockfile(content: string, filename: string): Promise<void> {
        try {
            const artifactType = 'NPM_LOCKFILE' as const;
            const contentHash = await this.computeHash(content);

            // recentId = hash(artifactType + filename + contentHash)
            const recentId = await this.computeHash(artifactType + filename + contentHash);
            const sizeBytes = new Blob([content]).size;
            const now = Date.now();

            const recentArtifact = {
                recentId,
                artifactType,
                filename,
                contentHash,
                sizeBytes,
                content,
                createdAt: now,
                lastUsedAt: now,
                meta: { detectedEcosystem: 'npm' as const }
            };

            await db.transaction('rw', db.recent_artifacts, async () => {
                await db.recent_artifacts.put(recentArtifact);

                // LRU Eviction
                const recentCount = await db.recent_artifacts
                    .where('[artifactType+lastUsedAt]')
                    .between(['NPM_LOCKFILE', Dexie.minKey], ['NPM_LOCKFILE', Dexie.maxKey])
                    .count();

                if (recentCount > 5) {
                    const oldest = await db.recent_artifacts
                        .where('[artifactType+lastUsedAt]')
                        .between(['NPM_LOCKFILE', Dexie.minKey], ['NPM_LOCKFILE', Dexie.maxKey])
                        .limit(recentCount - 5)
                        .primaryKeys();

                    if (oldest.length > 0) {
                        await db.recent_artifacts.bulkDelete(oldest as string[]);
                    }
                }
            });
            console.log(`[Reachability] Lockfile cached: ${recentId}`);

        } catch (e) {
            console.error('[Reachability] Failed to cache lockfile', e);
            throw e;
        }
    }

    private async computeHash(input: string): Promise<string> {
        const msgBuffer = new TextEncoder().encode(input);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Build the dependency graph for a given finding context.
     */
    async buildGraph(context: ResearchContext): Promise<ReachabilityResult> {
        const startTime = performance.now();
        const { sessionId, findingId, packageName } = context;

        // Log Request
        db.events.add({
            id: crypto.randomUUID(),
            sessionId,
            type: EventType.GRAPH_BUILD_REQUESTED,
            timestamp: Date.now(),
            payload: { findingId, packageName }
        }).catch(e => console.warn('Failed to log event', e));

        // 1. Check Memory Cache
        const cacheKey = `${sessionId}::${packageName}`;
        if (this.graphCache.has(cacheKey)) {
            const cached = this.graphCache.get(cacheKey)!;
            cached.evidence.cacheHit = true;
            return cached;
        }

        // 2. Get Lockfile Content
        let lockfile = this.lockfileCache.get(sessionId);
        if (!lockfile) {
            const artifact = await db.session_artifacts.where({ sessionId, artifactType: 'NPM_LOCKFILE' }).first();
            if (artifact) {
                if (typeof artifact.content === 'string') {
                    lockfile = artifact.content;
                }
                else if (artifact.content instanceof Blob) {
                    lockfile = await artifact.content.text();
                }
                if (lockfile) {
                    this.lockfileCache.set(sessionId, lockfile);
                }
            }
        }

        // 3. Early Exit if No Lockfile
        if (!lockfile) {
            const result = this.createUnavailableResult("No lockfile found for this session.");
            this.logCompletion(sessionId, findingId, result);
            return result;
        }

        // 4. Parse & Build (Worker)
        try {
            const graphData = await this.runWorker(lockfile, sessionId, 'npm-lock-v2');

            // 5. Traverse to find Path
            const result = this.computeReachability(graphData, packageName, startTime);

            // Cache and Return
            this.graphCache.set(cacheKey, result);
            this.logCompletion(sessionId, findingId, result);
            return result;

        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[Reachability] Worker Error', err);
            const result = this.createErrorResult(message || 'Unknown worker error');

            db.events.add({
                id: crypto.randomUUID(),
                sessionId,
                type: EventType.GRAPH_BUILD_FAILED,
                timestamp: Date.now(),
                payload: { findingId, error: message }
            }).catch(e => console.warn('Failed to log event', e));

            return result;
        }
    }

    private logCompletion(sessionId: string, findingId: string, result: ReachabilityResult) {
        db.events.add({
            id: crypto.randomUUID(),
            sessionId,
            type: EventType.GRAPH_BUILD_COMPLETED,
            timestamp: Date.now(),
            payload: {
                findingId,
                status: result.status,
                matchStrategy: result.evidence.matchStrategy,
                pathsFound: result.evidence.pathsFound,
                parseTimeMs: result.evidence.parseTimeMs
            }
        }).catch(e => console.warn('Failed to log event', e));
    }

    // ─── Worker Communication ──────────────────────────────────

    private runWorker(content: string, sessionId: string, format: string): Promise<WorkerGraphResult> {
        return new Promise((resolve, reject) => {
            // const worker = getWorker(); // Unused, we use scopedWorker below

            // One-off listener? No, we need to correlate response.
            // Since we use a compiled worker, we can't easily pass ports?
            // Simple approach: Since we are single-threading requests mostly, 
            // we can just attach onmessage. 
            // BETTER: Create a new worker for each heavy lift if logic is simple 
            // OR use a request ID.

            // Let's use a fresh worker for now to avoid race conditions until we implement a proper pool/ID system.
            // Actually, spawning workers is expensive (~50ms).
            // Let's assume sequential access for v0.7.5 or use ID correlation.

            // Re-implementing getWorker to NOT use singleton for safety in this MVP step
            const scopedWorker = new Worker(new URL('../../workers/lockfile.worker.ts', import.meta.url));

            scopedWorker.onmessage = (e) => {
                const { type, indexBlob, error } = e.data;
                if (type === 'DERIVED_INDEX_READY') {
                    // Worker returns a blob, but for now our computeReachability 
                    // still expects a raw object. We need to deserialize it here 
                    // OR update computeReachability to handle Blobs.
                    // For MVP Phase, let's assume the worker *also* returns the raw graph 
                    // briefly or we parse the blob back to JSON.

                    // TODO: Optimize this. Worker should return useable structure or we move traversal there.
                    // For now, let's assume indexBlob contains the stringified JSON graph.
                    const reader = new FileReader();
                    reader.onload = () => {
                        try {
                            const rawGraph = JSON.parse(reader.result as string);
                            resolve(rawGraph as WorkerGraphResult);
                        } catch (parseErr) {
                            reject(new Error('Failed to deserialize worker graph blob'));
                        } finally {
                            scopedWorker.terminate();
                        }
                    };
                    reader.readAsText(indexBlob);

                } else if (type === 'ERROR') {
                    reject(new Error(error || 'Worker unknown error'));
                    scopedWorker.terminate();
                }
            };

            scopedWorker.onerror = (e) => {
                reject(e);
                scopedWorker.terminate();
            };

            // Send detailed build message to worker
            scopedWorker.postMessage({
                type: 'BUILD_DERIVED_INDEX',
                sessionId,
                artifactId: '', // Not strictly needed by worker for parsing, but good practice
                filename: 'package-lock.json', // Passed for context
                content: content,
                schemaVersion: 1 // V1 of our internal schema
            });
        });
    }

    // ─── Graph Logic (Main Thread) ─────────────────────────────

    private computeReachability(graph: WorkerGraphResult, targetPkg: string, startTime: number): ReachabilityResult {
        const { parentsByNode, nodesByName, idMap } = graph;

        // A. Identify Target Node(s)
        const candidates = nodesByName[targetPkg] || [];

        if (candidates.length === 0) {
            return this.createHeuristicResult("Package not found in lockfile.", targetPkg);
        }

        // B. Find Path(s) to Root
        let bestPath: string[] = [];
        const matchStrategy: MatchStrategy = 'EXACT';

        // Strategy: BFS from Root to find *any* candidate?
        // OR BFS from Candidate parent-pointers up to Root?
        // Since we have `parentsByNode`, going Up is likely faster to find *shortest path to root*.

        // We evaluate all candidates and pick the one with the shortest path to PROJECT_ROOT.

        let minDepth = Infinity;
        let selectedCandidate = "";

        for (const candidateId of candidates) {
            const path = this.findPathToRoot(candidateId, parentsByNode);
            if (path && path.length < minDepth) {
                minDepth = path.length;
                bestPath = path; // Path is [Candidate, Parent, ..., Root]
                selectedCandidate = candidateId;
            }
        }

        if (bestPath.length === 0) {
            // Candidates exist but are detached??
            return this.createHeuristicResult("Package found but no path to root (detached).", targetPkg);
        }

        // C. Construct Result Graph
        // The path is [Target, P1, P2, Root]. We want Root -> P2 -> P1 -> Target.
        bestPath.reverse(); // [Root, ..., Target]

        const nodes: ReachabilityNode[] = [];
        const edges: ReachabilityEdge[] = [];
        const meta = idMap;
        const totalNodes = Object.keys(idMap).length;

        bestPath.forEach((nodeId, index) => {
            const isRoot = index === 0;
            const isTarget = index === bestPath.length - 1;
            const info = meta[nodeId];

            let type: ReachabilityNodeType = 'TRANSITIVE_DEP';
            let label = info.name;
            const status: ReachabilityStatus = 'REAL';
            let severity: NormalizedSeverity | null = null; // We don't know severity of deps, only target

            if (isRoot) {
                type = 'PROJECT_ROOT';
                label = 'Project Root';
            } else if (index === 1) {
                type = 'DIRECT_DEP';
            }

            if (isTarget) {
                type = 'VULNERABLE_PACKAGE';
                severity = 'MEDIUM'; // Placeholder: Services should inject real severity later or we pass it in context
                // context.severity is available? Yes context has severity.
                // We'll update severity outside or pass it in.
                // For now, let's leave as null and let the UI/Context merger handle it? 
                // Context has the *finding* severity. This node matches the finding.
            }

            nodes.push({
                id: nodeId,
                type,
                label,
                subLabel: isRoot ? undefined : `v${info.version}`,
                status,
                evidence: {
                    version: info.version,
                    pathDepth: index,
                    isDevDependency: info.isDev
                }
            });

            // Edge to next
            if (!isTarget) {
                const nextId = bestPath[index + 1];
                edges.push({
                    id: `e-${nodeId}-${nextId}`,
                    source: nodeId,
                    target: nextId,
                    type: 'DEPENDS_ON',
                    status: 'REAL'
                });
            }
        });

        // Add Placeholder "Entry Surface" (Gen2)
        const entryId = 'Gen2-Entry';
        nodes.push({
            id: entryId,
            type: 'ENTRY_SURFACE_PLACEHOLDER',
            label: 'Internet',
            status: 'UNAVAILABLE',
            evidence: { version: 'N/A' }
        });

        // Edge from Entry -> Root (Missing Evidence)
        edges.push({
            id: `e-${entryId}-${nodes[0].id}`,
            source: entryId,
            target: nodes[0].id,
            type: 'MISSING_EVIDENCE',
            status: 'UNAVAILABLE'
        });

        const parseTime = performance.now() - startTime;

        return {
            graph: { nodes, edges },
            status: 'REAL',
            evidence: {
                lockfilePresent: true,
                lockfileVersion: 2, // todo: extract from graph metadata if available
                matchStrategy: selectedCandidate ? 'EXACT' : 'NOT_FOUND',
                pathsFound: 1, // multiple candidates? we only returned best
                nodesAnalyzed: totalNodes,
                parseTimeMs: parseTime, // Worker time + Main thread time
                buildTimeMs: parseTime,
                cacheHit: false
            },
            createdAt: Date.now()
        };
    }

    private findPathToRoot(startId: string, parentsMap: Record<string, string[]>): string[] | null {
        // BFS to find shortest path to "PROJECT_ROOT"
        const queue: { id: string; path: string[] }[] = [{ id: startId, path: [startId] }];
        const visited = new Set<string>();
        visited.add(startId);

        while (queue.length > 0) {
            const { id, path } = queue.shift()!;

            if (id === "PROJECT_ROOT" || id === "root") {
                return path;
            }

            const parents = parentsMap[id] || [];
            for (const pid of parents) {
                if (!visited.has(pid)) {
                    visited.add(pid);
                    queue.push({ id: pid, path: [...path, pid] });
                }
            }
        }
        return null; // No path to root
    }

    // ─── Helpers ───────────────────────────────────────────────────

    private createUnavailableResult(msg: string): ReachabilityResult {
        return {
            graph: { nodes: [], edges: [] },
            status: 'UNAVAILABLE',
            evidence: {
                lockfilePresent: false,
                matchStrategy: 'NOT_FOUND',
                pathsFound: 0,
                nodesAnalyzed: 0,
                parseTimeMs: 0,
                buildTimeMs: 0,
                cacheHit: false,
                error: msg
            },
            createdAt: Date.now()
        };
    }

    private createErrorResult(msg: string): ReachabilityResult {
        return {
            graph: { nodes: [], edges: [] },
            status: 'ERROR',
            evidence: {
                lockfilePresent: true,
                matchStrategy: 'NOT_FOUND',
                pathsFound: 0,
                nodesAnalyzed: 0,
                parseTimeMs: 0,
                buildTimeMs: 0,
                cacheHit: false,
                error: msg,
                errorCode: 'WORKER_FAILED'
            },
            createdAt: Date.now()
        };
    }

    private createHeuristicResult(msg: string, pkg: string): ReachabilityResult {
        // Create a simple heuristic graph: Root -> ? -> Pkg
        // For now, returning empty graph but with HEURISTIC status is safer than lying.
        return {
            graph: { nodes: [], edges: [] },
            status: 'HEURISTIC',
            evidence: {
                lockfilePresent: true,
                matchStrategy: 'NOT_FOUND',
                pathsFound: 0,
                nodesAnalyzed: 0,
                parseTimeMs: 0,
                buildTimeMs: 0,
                cacheHit: false,
                error: msg
            },
            createdAt: Date.now()
        };
    }
}

export const reachabilityService = new ReachabilityService();
