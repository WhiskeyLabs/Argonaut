import { buildStructuredInputError, detectErrorCodeFromMessage } from '../lib/errors/inputErrorGuidance';

// ─── Worker: Lockfile Processor ──────────────────────────────────────────
// Handles parsing of package-lock.json (v1/v2/v3) and building
// a NormalizedGraph index optimized for reachability queries.
//
// Protocol:
// - Input: BUILD_DERIVED_INDEX { content, sessionId, artifactId, schemaVersion }
// - Output: DERIVED_INDEX_READY { indexBlob, graphHash, stats }
// ─────────────────────────────────────────────────────────────────────────

// Types from contracts (inlined or imported if we had shared types package)
// Since we can't easily import from 'contracts_task_4_6.ts' in a worker context 
// without complex bundler setup in some environments, we redefine critical shapes here 
// or assume bundler handles it. safely. 
// For this project, we assume the bundler (Next.js/Webpack) handles imports correctly.

// But to be safe and self-contained, I will inline the internal structures 
// that are specific to the worker's operation to avoid runtime import errors if not configured.

interface NormalizedGraph {
    nodes: Record<string, NormalizedNode>;
    edges: NormalizedEdge[];
    lookup: Record<string, Record<string, string[]>>; // name -> version -> nodeIds
    rootNodeId: string;
    // Derived Indices (Added for ReachabilityService)
    parentsByNode: Record<string, string[]>;
    nodesByName: Record<string, string[]>;
    idMap: Record<string, { name: string; version: string; isDev: boolean; isOptional: boolean }>;
}

interface NormalizedNode {
    id: string; // "name@version" or "ROOT"
    name: string;
    version: string;
    isDev?: boolean;
    isOptional?: boolean;
}

interface NormalizedEdge {
    from: string;
    to: string;
    type?: 'prod' | 'dev' | 'peer' | 'optional';
}

// ─── Message Handlers ────────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent) => {
    const { type, content, sessionId, artifactId } = e.data;

    try {
        if (type === 'BUILD_DERIVED_INDEX') {
            const result = performBuild(content, sessionId, artifactId);

            // Serialize the graph to a Blob (simulating "Index Blob")
            // In a real optimized version, we might use a binary format or 
            // a minimized adjacency list string. For now, JSON.stringify is fine.
            const indexJson = JSON.stringify(result.graph);
            const indexBlob = new Blob([indexJson], { type: 'application/json' });

            self.postMessage({
                type: 'DERIVED_INDEX_READY',
                sessionId,
                artifactId,
                schemaVersion: 1, // Output schema version
                lockfileVersion: result.lockfileVersion,
                nodeCount: result.stats.nodeCount,
                edgeCount: result.stats.edgeCount,
                parseTimeMs: result.stats.parseTimeMs,
                graphHash: result.graphHash, // Simple hash of content?
                indexBlob // Transferable!
            });
        }
        else if (type === 'PING') {
            self.postMessage({ type: 'PONG' });
        }
        else {
            throw new Error(`Unknown message type: ${type}`);
        }
    } catch (err: any) {
        const detail = err?.message || 'Worker Internal Error';
        const code = detectErrorCodeFromMessage(detail);
        const structured =
            code === 'INVALID_JSON' || code === 'LOCKFILE_PARSE_FAIL'
                ? buildStructuredInputError('LOCKFILE_PARSE_FAIL', detail)
                : buildStructuredInputError('UNKNOWN', detail, 'Lockfile processing failed.');
        self.postMessage({
            type: 'ERROR',
            sessionId,
            artifactId,
            error: structured.userMessage,
            ...structured
        });
    }
};

// ─── Parsing Logic ───────────────────────────────────────────────────────

interface BuildResult {
    graph: NormalizedGraph;
    lockfileVersion: number;
    graphHash: string; // placeholder
    stats: {
        nodeCount: number;
        edgeCount: number;
        parseTimeMs: number;
    };
}

function performBuild(content: string, sessionId: string, artifactId: string): BuildResult {
    const start = performance.now();
    let json: any;

    try {
        json = JSON.parse(content);
    } catch (e) {
        throw buildStructuredInputError('LOCKFILE_PARSE_FAIL', 'Invalid JSON content');
    }

    const lockfileVersion = json.lockfileVersion || 1;
    const graph: NormalizedGraph = {
        nodes: {},
        edges: [],
        lookup: {},
        rootNodeId: 'PROJECT_ROOT',
        parentsByNode: {},
        nodesByName: {},
        idMap: {}
    };

    // Initialize Root
    const rootId = 'PROJECT_ROOT';
    graph.nodes[rootId] = {
        id: rootId,
        name: json.name || 'root-project',
        version: json.version || '0.0.0',
        isDev: false
    };

    // Generic Parser Dispatch
    // We treat v2 and v3 similarly for standard structure, v1 is slightly different (no 'packages').
    // But most v2/v3 lockfiles *also* have 'dependencies' for backward compat.
    // However, 'packages' (in v2/v3) provides the flat node_modules map which is easier for precise resolution.

    if (json.packages && typeof json.packages === 'object') {
        parseV2V3(json, graph);
    } else if (json.dependencies && typeof json.dependencies === 'object') {
        parseV1(json, graph);
    } else {
        throw buildStructuredInputError(
            'LOCKFILE_PARSE_FAIL',
            'Unsupported lockfile format: missing "packages" or "dependencies"'
        );
    }

    const end = performance.now();

    // 3. Compute Derived Indices (Required by ReachabilityService)

    // Build parentsByNode
    for (const edge of graph.edges) {
        if (!graph.parentsByNode[edge.to]) {
            graph.parentsByNode[edge.to] = [];
        }
        graph.parentsByNode[edge.to].push(edge.from);
    }

    // Build nodesByName
    for (const node of Object.values(graph.nodes)) {
        if (!graph.nodesByName[node.name]) {
            graph.nodesByName[node.name] = [];
        }
        graph.nodesByName[node.name].push(node.id);
    }

    // Build idMap (Map to simpler structure required by Service)
    // Ensure strict boolean for isDev
    for (const node of Object.values(graph.nodes)) {
        graph.idMap[node.id] = {
            name: node.name,
            version: node.version,
            isDev: !!node.isDev,
            isOptional: !!node.isOptional
        };
    }

    return {
        graph, // graph object now contains all derived properties
        lockfileVersion,
        graphHash: 'todo-compute-hash',
        stats: {
            nodeCount: Object.keys(graph.nodes).length,
            edgeCount: graph.edges.length,
            parseTimeMs: end - start
        }
    };
}

// ─── V2/V3 Parser (Preferred) ────────────────────────────────────────────

function parseV2V3(json: any, graph: NormalizedGraph) {
    const packages = json.packages;

    // 1. Create Nodes
    for (const [path, entry] of Object.entries<any>(packages)) {
        if (path === "") continue; // Root is already handled

        const name = entry.name || getNameFromPath(path);
        const version = entry.version;

        // Path is the unique ID (Canonical Identity)
        const id = path;

        // Note: entry.version is usually present in v3 for nodes in node_modules
        // If missing (unlikely for matched nodes), we skip or use a fallback
        if (!name) continue;

        graph.nodes[id] = {
            id,
            name,
            version: version || '0.0.0', // fallback if version missing
            isDev: !!entry.dev,
            isOptional: !!entry.optional
        };

        // Add to Lookups
        addToLookup(graph, name, version || '0.0.0', id);

        // Edge from Root? 
        // Logic: if it's a direct dependency of root, it's typically at "node_modules/pkg"
        // But the most reliable way is checking root's own dependency lists.
    }

    // 2. Create Edges
    for (const [path, entry] of Object.entries<any>(packages)) {
        const sourceId = path === "" ? graph.rootNodeId : path;

        // v3 uses dependencies, devDependencies, optionalDependencies, and peerDependencies
        processDependencies(graph, path, entry.dependencies, 'prod');
        processDependencies(graph, path, entry.devDependencies, 'dev');
        processDependencies(graph, path, entry.optionalDependencies, 'optional');
        processDependencies(graph, path, entry.peerDependencies, 'peer');
    }
}

// ─── V1 Parser (Legacy) ──────────────────────────────────────────────────

function parseV1(json: any, graph: NormalizedGraph) {
    // V1 is recursive: dependencies -> dependencies
    function recurse(deps: any, parentId: string) {
        if (!deps) return;

        for (const [name, entry] of Object.entries<any>(deps)) {
            const version = entry.version;
            const id = `${name}@${version}`; // Simple merge strategy for V1

            if (!graph.nodes[id]) {
                graph.nodes[id] = {
                    id,
                    name,
                    version,
                    isDev: !!entry.dev
                };
                addToLookup(graph, name, version, id);
            }

            graph.edges.push({ from: parentId, to: id, type: entry.dev ? 'dev' : 'prod' });

            if (entry.dependencies) {
                recurse(entry.dependencies, id);
            }
        }
    }

    recurse(json.dependencies, graph.rootNodeId);
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function getNameFromPath(path: string): string {
    // path: "node_modules/foo" -> "foo"
    // path: "node_modules/@scope/pkg" -> "@scope/pkg"
    // path: "node_modules/foo/node_modules/bar" -> "bar"

    const parts = path.split('node_modules/');
    const lastPart = parts[parts.length - 1];

    // Remove trailing slashes if any
    return lastPart.replace(/\/$/, '');
}

function addToLookup(graph: NormalizedGraph, name: string, version: string, nodeId: string) {
    if (!graph.lookup[name]) {
        graph.lookup[name] = {};
    }
    if (!graph.lookup[name][version]) {
        graph.lookup[name][version] = [];
    }
    graph.lookup[name][version].push(nodeId);
}

function processDependencies(
    graph: NormalizedGraph,
    sourcePath: string,
    deps: Record<string, string> | undefined,
    type: 'prod' | 'dev' | 'optional' | 'peer'
) {
    if (!deps) return;

    const sourceId = sourcePath === "" ? graph.rootNodeId : sourcePath;

    for (const [name, range] of Object.entries(deps)) {
        const targetId = resolveNodeId(graph, sourcePath, name, range);

        // Edge typing mapping
        const edgeTypeMap: Record<string, 'prod' | 'dev' | 'optional' | 'peer'> = {
            'prod': 'prod',
            'dev': 'dev',
            'optional': 'optional',
            'peer': 'peer'
        };

        graph.edges.push({
            from: sourceId,
            to: targetId,
            type: edgeTypeMap[type] || 'prod'
        });
    }
}

function resolveNodeId(graph: NormalizedGraph, sourcePath: string, targetName: string, range: string): string {
    // v3 Resolution Rules:
    // 1. Nested Check: sourcePath + /node_modules/targetName
    // 2. Hoisted Check: node_modules/targetName
    // 3. Placeholder: UNRESOLVED:targetName@range

    const nestedPath = sourcePath === ""
        ? `node_modules/${targetName}`
        : `${sourcePath}/node_modules/${targetName}`;

    if (graph.nodes[nestedPath]) {
        return nestedPath;
    }

    const hoistedPath = `node_modules/${targetName}`;
    if (graph.nodes[hoistedPath]) {
        return hoistedPath;
    }

    // Create placeholder if it doesn't exist
    const placeholderId = `UNRESOLVED:${targetName}@${range}`;
    if (!graph.nodes[placeholderId]) {
        graph.nodes[placeholderId] = {
            id: placeholderId,
            name: targetName,
            version: range,
            isDev: false // unknown
        };
    }

    return placeholderId;
}
