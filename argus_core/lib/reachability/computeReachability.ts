import { ReachabilityComputeError } from './errors';
import { ReachabilityInput, ReachabilityReason, ReachabilityResult } from './types';

const ROOT_PARENT = '__root__';

type UnknownRecord = Record<string, unknown>;

type NormalizedEdge = {
    parent: string;
    child: string;
    version: string | null;
    runtimeFlag: boolean;
};

type TokenMeta = {
    name: string;
    version: string | null;
};

export function computeReachability(input: ReachabilityInput): ReachabilityResult {
    const normalizedInput = normalizeInput(input);
    const analysisVersion = normalizedInput.analysisVersion;

    const edges = normalizeEdges(normalizedInput.dependencyEdges);

    if (normalizedInput.dependencyEdges.length > 0 && edges.length === 0) {
        return buildInsufficientResult(normalizedInput, analysisVersion, 'UNSUPPORTED_GRAPH_SHAPE');
    }

    const runtimeEdges = edges.filter((edge) => edge.runtimeFlag);

    if (runtimeEdges.length === 0) {
        return buildInsufficientResult(normalizedInput, analysisVersion, 'EMPTY_GRAPH');
    }

    const rootEdges = runtimeEdges.filter((edge) => edge.parent === ROOT_PARENT);
    if (rootEdges.length === 0) {
        return buildInsufficientResult(normalizedInput, analysisVersion, 'NO_ROOT');
    }

    const nameToTokens = new Map<string, Set<string>>();
    const tokenMeta = new Map<string, TokenMeta>();

    for (const edge of runtimeEdges) {
        const token = toPackageToken(edge.child, edge.version);
        const existing = nameToTokens.get(edge.child) ?? new Set<string>();
        existing.add(token);
        nameToTokens.set(edge.child, existing);
        tokenMeta.set(token, {
            name: edge.child,
            version: edge.version,
        });
    }

    const targetPackageTokens = nameToTokens.get(normalizedInput.targetPackage);
    if (!targetPackageTokens || targetPackageTokens.size === 0) {
        return buildGraphResult(normalizedInput, analysisVersion, {
            reachable: false,
            status: 'UNREACHABLE',
            reason: 'TARGET_NOT_PRESENT',
            evidencePath: [],
        });
    }

    let targetTokens = Array.from(targetPackageTokens).sort((a, b) => a.localeCompare(b));

    if (normalizedInput.targetVersion !== null) {
        const matchingTokens = targetTokens.filter((token) => tokenMeta.get(token)?.version === normalizedInput.targetVersion);
        if (matchingTokens.length === 0) {
            const hasVersionContext = targetTokens.some((token) => tokenMeta.get(token)?.version !== null);
            if (!hasVersionContext) {
                return buildInsufficientResult(normalizedInput, analysisVersion, 'MISSING_VERSION_CONTEXT');
            }

            return buildGraphResult(normalizedInput, analysisVersion, {
                reachable: false,
                status: 'UNREACHABLE',
                reason: 'VERSION_MISMATCH',
                evidencePath: [],
            });
        }

        targetTokens = matchingTokens.sort((a, b) => a.localeCompare(b));
    }

    const targetSet = new Set(targetTokens);

    const adjacency = new Map<string, string[]>();
    adjacency.set(ROOT_PARENT, []);

    let hasUnsupportedShape = false;

    for (const edge of runtimeEdges) {
        const targetToken = toPackageToken(edge.child, edge.version);

        if (edge.parent === ROOT_PARENT) {
            appendNeighbor(adjacency, ROOT_PARENT, targetToken);
            continue;
        }

        const parentTokens = nameToTokens.get(edge.parent);
        if (!parentTokens || parentTokens.size === 0) {
            hasUnsupportedShape = true;
            continue;
        }

        const sortedParentTokens = Array.from(parentTokens).sort((a, b) => a.localeCompare(b));
        for (const parentToken of sortedParentTokens) {
            appendNeighbor(adjacency, parentToken, targetToken);
        }
    }

    for (const [node, neighbors] of adjacency.entries()) {
        const unique = Array.from(new Set(neighbors));
        unique.sort((a, b) => a.localeCompare(b));
        adjacency.set(node, unique);
    }

    const bestPath = findBestPath(adjacency, targetSet);

    if (bestPath === null) {
        if (hasUnsupportedShape) {
            return buildInsufficientResult(normalizedInput, analysisVersion, 'UNSUPPORTED_GRAPH_SHAPE');
        }

        return buildGraphResult(normalizedInput, analysisVersion, {
            reachable: false,
            status: 'UNREACHABLE',
            reason: 'NO_PATH',
            evidencePath: [],
        });
    }

    return buildGraphResult(normalizedInput, analysisVersion, {
        reachable: true,
        status: 'REACHABLE',
        reason: 'PATH_FOUND',
        evidencePath: bestPath,
    });
}

function findBestPath(adjacency: Map<string, string[]>, targetSet: Set<string>): string[] | null {
    const queue: string[][] = [[ROOT_PARENT]];
    const bestDepthByNode = new Map<string, number>([[ROOT_PARENT, 0]]);
    const bestPathByNode = new Map<string, string>([[ROOT_PARENT, ROOT_PARENT]]);

    let bestTargetPath: string[] | null = null;

    while (queue.length > 0) {
        const path = queue.shift() as string[];
        const node = path[path.length - 1];
        const depth = path.length - 1;

        if (bestTargetPath !== null && depth > bestTargetPath.length - 1) {
            continue;
        }

        if (targetSet.has(node)) {
            if (bestTargetPath === null) {
                bestTargetPath = path;
            } else {
                const compare = comparePaths(path, bestTargetPath);
                if (compare < 0) {
                    bestTargetPath = path;
                }
            }
            continue;
        }

        const neighbors = adjacency.get(node) ?? [];
        for (const neighbor of neighbors) {
            const nextPath = [...path, neighbor];
            const nextDepth = nextPath.length - 1;
            const nextPathKey = pathToKey(nextPath);

            const seenDepth = bestDepthByNode.get(neighbor);
            const seenPathKey = bestPathByNode.get(neighbor);

            const shouldVisit =
                seenDepth === undefined
                || nextDepth < seenDepth
                || (nextDepth === seenDepth && seenPathKey !== undefined && nextPathKey < seenPathKey);

            if (!shouldVisit) {
                continue;
            }

            bestDepthByNode.set(neighbor, nextDepth);
            bestPathByNode.set(neighbor, nextPathKey);
            queue.push(nextPath);
        }
    }

    return bestTargetPath;
}

function comparePaths(left: string[], right: string[]): number {
    if (left.length !== right.length) {
        return left.length - right.length;
    }

    return pathToKey(left).localeCompare(pathToKey(right));
}

function pathToKey(path: string[]): string {
    return path.join('>');
}

function appendNeighbor(adjacency: Map<string, string[]>, source: string, target: string): void {
    const existing = adjacency.get(source) ?? [];
    existing.push(target);
    adjacency.set(source, existing);
}

function buildInsufficientResult(
    input: ReachabilityInput,
    analysisVersion: string,
    reason: Extract<ReachabilityReason, 'EMPTY_GRAPH' | 'NO_ROOT' | 'MISSING_VERSION_CONTEXT' | 'UNSUPPORTED_GRAPH_SHAPE'>,
): ReachabilityResult {
    return {
        reachabilityId: buildReachabilityId(input, analysisVersion),
        findingId: input.findingId,
        repo: input.repo,
        buildId: input.buildId,
        reachable: false,
        confidenceScore: 0,
        confidence: 0,
        evidencePath: [],
        method: 'unavailable',
        status: 'INSUFFICIENT_DATA',
        reason,
        analysisVersion,
        computedAt: Date.now(),
    };
}

function buildGraphResult(
    input: ReachabilityInput,
    analysisVersion: string,
    result: {
        reachable: boolean;
        status: 'REACHABLE' | 'UNREACHABLE';
        reason: Extract<ReachabilityReason, 'PATH_FOUND' | 'NO_PATH' | 'TARGET_NOT_PRESENT' | 'VERSION_MISMATCH'>;
        evidencePath: string[];
    },
): ReachabilityResult {
    return {
        reachabilityId: buildReachabilityId(input, analysisVersion),
        findingId: input.findingId,
        repo: input.repo,
        buildId: input.buildId,
        reachable: result.reachable,
        confidenceScore: 1,
        confidence: 1,
        evidencePath: result.evidencePath,
        method: 'graph',
        status: result.status,
        reason: result.reason,
        analysisVersion,
        computedAt: Date.now(),
    };
}

function buildReachabilityId(input: ReachabilityInput, analysisVersion: string): string {
    return stableHash({
        repo: input.repo,
        buildId: input.buildId,
        findingId: input.findingId,
        targetPackage: input.targetPackage,
        targetVersion: input.targetVersion ?? null,
        analysisVersion,
    });
}

function normalizeInput(input: ReachabilityInput): ReachabilityInput & { analysisVersion: string; targetVersion: string | null } {
    if (!isRecord(input)) {
        throw new ReachabilityComputeError('INVALID_INPUT', 'Reachability input must be an object.');
    }

    const findingId = normalizeRequiredString(input.findingId, 'findingId');
    const repo = normalizeRequiredString(input.repo, 'repo');
    const buildId = normalizeRequiredString(input.buildId, 'buildId');
    const targetPackage = normalizeRequiredString(input.targetPackage, 'targetPackage');

    if (!Array.isArray(input.dependencyEdges)) {
        throw new ReachabilityComputeError('INVALID_INPUT', 'dependencyEdges must be an array.');
    }

    const targetVersion = normalizeOptionalString(input.targetVersion);
    const analysisVersion = normalizeOptionalString(input.analysisVersion) ?? '1.0';

    return {
        findingId,
        repo,
        buildId,
        targetPackage,
        targetVersion,
        dependencyEdges: input.dependencyEdges,
        analysisVersion,
    };
}

function normalizeEdges(edges: ReachabilityInput['dependencyEdges']): NormalizedEdge[] {
    const normalized: NormalizedEdge[] = [];

    for (const edge of edges) {
        if (!isRecord(edge)) {
            continue;
        }

        const parent = normalizeOptionalString(edge.parent);
        const child = normalizeOptionalString(edge.child);

        if (parent === null || child === null) {
            continue;
        }

        const runtimeFlag = edge.runtimeFlag === true;
        const version = normalizeOptionalString(edge.version);

        normalized.push({
            parent,
            child,
            version,
            runtimeFlag,
        });
    }

    return normalized;
}

function toPackageToken(name: string, version: string | null): string {
    return `${name}@${version ?? 'null'}`;
}

function normalizeRequiredString(value: unknown, field: string): string {
    const normalized = normalizeOptionalString(value);
    if (normalized === null) {
        throw new ReachabilityComputeError('INVALID_INPUT', `${field} must be a non-empty string.`);
    }

    return normalized;
}

function normalizeOptionalString(value: unknown): string | null {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function stableHash(value: unknown): string {
    const serialized = stableStringify(value);
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;

    for (let i = 0; i < serialized.length; i += 1) {
        const charCode = serialized.charCodeAt(i);
        h1 = Math.imul(h1 ^ charCode, 2654435761);
        h2 = Math.imul(h2 ^ charCode, 1597334677);
    }

    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

function stableStringify(value: unknown): string {
    return JSON.stringify(value, (_key, nestedValue) => {
        if (Array.isArray(nestedValue)) {
            return nestedValue;
        }

        if (nestedValue && typeof nestedValue === 'object') {
            return Object.keys(nestedValue as UnknownRecord)
                .sort((a, b) => a.localeCompare(b))
                .reduce<UnknownRecord>((accumulator, key) => {
                    accumulator[key] = (nestedValue as UnknownRecord)[key];
                    return accumulator;
                }, {});
        }

        return nestedValue;
    });
}

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
