import Dexie from 'dexie';
import { db } from '../db';
import { UniversalFinding } from '../types/finding';
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
    idMap: Record<string, { name: string; version: string; isDev: boolean; isOptional?: boolean }>;
    lockfileVersion: number;
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

            console.log(`[Reachability] Lockfile set: ${artifactId}`);

            // 4. Trigger Global Sweep (Non-blocking)
            console.log(`[Reachability] Triggering bulkAnalyze for session: ${sessionId}`);
            this.bulkAnalyze(sessionId).then(() => {
                console.log(`[Reachability] bulkAnalyze promise resolved for session: ${sessionId}`);
            }).catch(err => {
                console.error('[Reachability] Global sweep failed after lockfile set', err);
            });

        } catch (e) {
            console.error('[Reachability] Failed to persist lockfile', e);
            throw e; // Propagate error so UI knows
        }
    }

    /**
     * Task 4.7.1: Global Dependency Sweep
     * Computes dependencyAnalysis for ALL findings in the session.
     */
    async bulkAnalyze(sessionId: string): Promise<void> {
        console.log(`[Reachability] bulkAnalyze CALLED for session: ${sessionId}`);

        // 1. Emit Start Event
        try {
            await db.events.add({
                id: crypto.randomUUID(),
                sessionId,
                type: EventType.DEPENDENCY_SWEEP_REQUESTED,
                timestamp: Date.now(),
                payload: {}
            });
            console.log(`[Reachability] Emitted DEPENDENCY_SWEEP_REQUESTED`);
        } catch (emitErr) {
            console.error(`[Reachability] Failed to emit DEPENDENCY_SWEEP_REQUESTED`, emitErr);
            // Don't throw, continue? Or throw? better to continue if just logging failed.
        }

        try {
            // 2. Get Lockfile Context
            // Ensure we have the latest content in memory or fetch it
            let lockfile = this.lockfileCache.get(sessionId);
            if (!lockfile) {
                const session = await db.sessions.get(sessionId);
                if (session?.activeLockfileArtifactId) {
                    const artifact = await db.session_artifacts.get(session.activeLockfileArtifactId);
                    if (artifact) {
                        lockfile = typeof artifact.content === 'string' ? artifact.content : await artifact.content.text();
                        this.lockfileCache.set(sessionId, lockfile);
                    }
                }
            }

            if (!lockfile) {
                // No lockfile? Mark everything UNAVAILABLE
                return this.markAllUnavailable(sessionId, "No active lockfile found.");
            }

            // 3. Parse Graph Once
            const graphData = await this.runWorker(lockfile, sessionId, 'npm-lock-v2');
            const { nodesByName, parentsByNode } = graphData;
            const lockfileVersion = graphData.lockfileVersion || 2;

            // 4. Fetch All Findings
            const findings = await db.findings.where('sessionId').equals(sessionId).toArray();
            if (findings.length === 0) return;

            // 5. Batch Updates
            const updates: UniversalFinding[] = [];
            let linkedCount = 0;

            const now = Date.now();

            for (const f of findings) {
                const isCandidate = !!(f.packageName);

                // Prepare Analysis Object
                const analysis: UniversalFinding['dependencyAnalysis'] = {
                    status: 'UNAVAILABLE',
                    pathsFound: 0,
                    matchStrategy: 'not_found',
                    lockfileVersion,
                    computedAt: now
                };

                if (isCandidate && f.packageName) {
                    // Check Graph
                    const candidates = nodesByName[f.packageName] || [];

                    if (candidates.length > 0) {
                        // We have potential matches. Find best path.
                        let bestDepth = Infinity;

                        for (const cid of candidates) {
                            const path = this.findPathToRoot(cid, parentsByNode);
                            if (path && path.length < bestDepth) {
                                bestDepth = path.length;
                            }
                        }

                        if (bestDepth < Infinity) {
                            analysis.status = 'REAL';
                            analysis.pathsFound = 1; // At least one valid path
                            analysis.matchStrategy = 'exact';
                            linkedCount++;
                        } else {
                            // Detached
                            analysis.matchStrategy = 'not_found'; // Or 'ambiguous'? 
                        }
                    }
                }

                // Mutate finding object for update
                f.dependencyAnalysis = analysis;
                const denormalized = this.toDenormalizedReachability(analysis.status, isCandidate);
                f.reachability = denormalized.reachability;
                f.reachabilityRank = denormalized.reachabilityRank;
                updates.push(f);
            }

            // 6. Bulk Write
            // Dexie bulkPut is efficient. 
            await db.findings.bulkPut(updates);

            console.log(`[Reachability] Global Sweep Complete. Linked: ${linkedCount}/${findings.length}`);

            // 7. Emit Completion
            await db.events.add({
                id: crypto.randomUUID(),
                sessionId,
                type: EventType.DEPENDENCY_SWEEP_COMPLETED,
                timestamp: Date.now(),
                payload: {
                    total: findings.length,
                    linked: linkedCount,
                    lockfileVersion
                }
            });

        } catch (e: any) {
            console.error('[Reachability] Global Sweep Failed', e);
            await db.events.add({
                id: crypto.randomUUID(),
                sessionId,
                type: EventType.DEPENDENCY_SWEEP_FAILED,
                timestamp: Date.now(),
                payload: { error: e.message }
            });
            throw e;
        }
    }

    private async markAllUnavailable(sessionId: string, reason: string) {
        // Fallback: Set all to UNAVAILABLE
        const findings = await db.findings.where('sessionId').equals(sessionId).toArray();
        const now = Date.now();
        const updates = findings.map(f => {
            f.dependencyAnalysis = {
                status: 'UNAVAILABLE',
                pathsFound: 0,
                matchStrategy: 'not_found',
                computedAt: now
            };
            f.reachability = 'unknown';
            f.reachabilityRank = 3;
            return f;
        });
        await db.findings.bulkPut(updates);

        await db.events.add({
            id: crypto.randomUUID(),
            sessionId,
            type: EventType.DEPENDENCY_SWEEP_COMPLETED,
            timestamp: now,
            payload: { total: findings.length, linked: 0, note: reason }
        });
    }

    private toDenormalizedReachability(
        status: NonNullable<UniversalFinding['dependencyAnalysis']>['status'],
        isPackageCandidate: boolean
    ): { reachability: UniversalFinding['reachability']; reachabilityRank: number } {
        if (status === 'REAL') {
            return { reachability: 'reachable', reachabilityRank: 0 };
        }

        // Package findings that were evaluated against lockfile but did not link.
        if (isPackageCandidate && status === 'UNAVAILABLE') {
            return { reachability: 'unreachable', reachabilityRank: 2 };
        }

        // Non-package findings (or error states) remain not-applicable/unknown.
        return { reachability: 'unknown', reachabilityRank: 3 };
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
        const { packageName, meta } = context;
        const { sessionId, findingId } = meta;

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
            const artifact = await db.session_artifacts.where('[sessionId+artifactType]').equals([sessionId, 'NPM_LOCKFILE']).first();
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
                const { type, indexBlob, error, code, userMessage, technicalDetail } = e.data;
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
                    const parts = [userMessage || error || 'Worker unknown error'];
                    if (code) parts.push(`[${code}]`);
                    if (technicalDetail) parts.push(technicalDetail);
                    reject(new Error(parts.filter(Boolean).join(' ')));
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
            return this.createHeuristicResult("Package not found in lockfile.", targetPkg, 'NO_MATCH');
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
            return this.createHeuristicResult("Package found but no path to root (detached).", targetPkg, 'NO_PATH');
        }

        // C. Construct Result Graph
        const nodes: ReachabilityNode[] = [];
        const edges: ReachabilityEdge[] = [];
        const meta = idMap;
        const totalNodes = Object.keys(idMap).length;

        // Collect ALL ancestors to show the full impact radius
        const allAncestors = new Set<string>();
        const queue = [selectedCandidate];
        while (queue.length > 0) {
            const current = queue.shift()!;
            if (allAncestors.has(current)) continue;
            allAncestors.add(current);
            const parents = parentsByNode[current] || [];
            queue.push(...parents);
        }

        // Set for quick lookup of nodes on the best path
        const bestPathSet = new Set(bestPath);

        allAncestors.forEach((nodeId) => {
            const info = meta[nodeId];
            if (!info) return;

            const isRoot = nodeId === 'PROJECT_ROOT';
            const isTarget = nodeId === selectedCandidate;
            const isOnBestPath = bestPathSet.has(nodeId);

            let type: ReachabilityNodeType = 'TRANSITIVE';
            let label = info.name;
            let status: ReachabilityStatus = 'REAL';

            if (nodeId.startsWith('UNRESOLVED:')) {
                status = 'UNAVAILABLE';
                label = `${info.name} (Unresolved)`;
            } else if (isRoot) {
                type = 'PROJECT_ROOT';
                label = 'Project Root';
            } else if (parentsByNode[nodeId]?.includes('PROJECT_ROOT')) {
                type = 'DIRECT';
            } else if (isTarget) {
                type = 'VULNERABLE_PACKAGE';
            }

            nodes.push({
                id: nodeId,
                type,
                label,
                subLabel: isRoot ? undefined : `v${info.version}`,
                status,
                evidence: {
                    version: info.version,
                    pathDepth: isOnBestPath ? bestPath.indexOf(nodeId) : undefined, // depth only strictly defined for the path
                    isDevDependency: info.isDev,
                    isOptionalDependency: info.isOptional
                }
            });

            // Add all edges from parents
            const parents = parentsByNode[nodeId] || [];
            parents.forEach(parentId => {
                if (allAncestors.has(parentId)) {
                    edges.push({
                        id: `e-${parentId}-${nodeId}`,
                        source: parentId,
                        target: nodeId,
                        type: 'DEPENDS_ON',
                        status: 'REAL'
                    });
                }
            });
        });

        // Add Placeholder "Entry Surface" (Gen2)
        const entryId = 'Gen2-Entry';
        nodes.push({
            id: entryId,
            type: 'ENTRY_POINT',
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
        const selectedPathNodeIds = [...bestPath].reverse();

        return {
            graph: { nodes, edges },
            selectedPathNodeIds,
            stats: {
                impactRadiusCount: allAncestors.size,
                pathLength: selectedPathNodeIds.length,
            },
            status: 'REAL',
            evidence: {
                lockfilePresent: true,
                lockfileVersion: graph.lockfileVersion || 2,
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
            selectedPathNodeIds: [],
            stats: {
                impactRadiusCount: 0,
                pathLength: 0
            },
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
            selectedPathNodeIds: [],
            stats: {
                impactRadiusCount: 0,
                pathLength: 0
            },
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

    private createHeuristicResult(msg: string, pkg: string, status: ReachabilityStatus = 'HEURISTIC'): ReachabilityResult {
        return {
            graph: { nodes: [], edges: [] },
            selectedPathNodeIds: [],
            stats: {
                impactRadiusCount: 0,
                pathLength: 0
            },
            status: status,
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
