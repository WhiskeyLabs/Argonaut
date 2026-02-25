import { LockfileParseError } from './errors';
import { DependencyEdge, DependencyScope, ParseLockfileMeta } from './types';
import { generateDependencyId } from '../../identity';

const ROOT_PARENT = '__root__';
const SUPPORTED_NPM_LOCKFILE_VERSIONS = new Set([1, 2, 3]);

type UnknownRecord = Record<string, unknown>;

type RawEdge = {
    parent: string;
    child: string;
    version: string | null;
    scope: DependencyScope;
    depth?: number;
};

type RawParseResult = {
    edges: RawEdge[];
    defaultSourceFile: string;
};

type NpmDependencyTraversalItem = {
    parentPath: string;
    parentName: string;
    depName: string;
    scope: DependencyScope;
    depth: number;
};

type NpmV1TraversalItem = {
    parentName: string;
    depName: string;
    entry: unknown;
    depth: number;
};

type YarnBlock = {
    selectors: string[];
    version: string | null;
    dependencies: Record<string, string>;
};

type YarnRecord = {
    name: string;
    version: string | null;
    dependencies: Record<string, string>;
};

export function parseLockfile(raw: string | UnknownRecord, meta: ParseLockfileMeta): DependencyEdge[] {
    const createdAt = normalizeCreatedAt(meta.createdAt);

    const parsed = parseRaw(raw);
    const sourceFile = normalizeSourceFile(meta.sourceFile ?? parsed.defaultSourceFile, parsed.defaultSourceFile);

    const canonicalEdges = dedupeAndSortEdges(parsed.edges);

    return canonicalEdges.map((edge) => {
        const dependencyId = generateDependencyId({
            repo: meta.repo,
            buildId: meta.buildId,
            parent: edge.parent,
            child: edge.child,
            version: edge.version,
            scope: edge.scope,
        });

        return {
            dependencyId,
            repo: meta.repo,
            buildId: meta.buildId,
            parent: edge.parent,
            child: edge.child,
            version: edge.version,
            scope: edge.scope,
            runtimeFlag: edge.scope === 'runtime',
            sourceFile,
            createdAt,
            depth: edge.depth,
        };
    });
}

function parseRaw(raw: string | UnknownRecord): RawParseResult {
    if (typeof raw === 'string') {
        const parsedJson = tryParseJson(raw);

        if (parsedJson !== null) {
            return parseJsonLockfile(parsedJson);
        }

        const yarnEdges = parseYarnLock(raw);
        if (yarnEdges.length === 0) {
            throw new LockfileParseError('INVALID_JSON', 'Unable to parse lockfile input as JSON or yarn.lock text.');
        }

        return {
            edges: yarnEdges,
            defaultSourceFile: 'yarn.lock',
        };
    }

    if (!isRecord(raw)) {
        throw new LockfileParseError('INVALID_JSON', 'Lockfile input must be a JSON string or object.');
    }

    return parseJsonLockfile(raw);
}

function parseJsonLockfile(json: UnknownRecord): RawParseResult {
    const lockfileVersion = normalizeLockfileVersion(json.lockfileVersion);

    if (!SUPPORTED_NPM_LOCKFILE_VERSIONS.has(lockfileVersion)) {
        return {
            edges: [],
            defaultSourceFile: 'package-lock.json',
        };
    }

    const packages = toRecord(json.packages);
    const dependencies = toRecord(json.dependencies);

    if (lockfileVersion >= 2 && packages !== null) {
        return {
            edges: parseNpmV2V3(packages),
            defaultSourceFile: 'package-lock.json',
        };
    }

    if (dependencies !== null) {
        return {
            edges: parseNpmV1(dependencies),
            defaultSourceFile: 'package-lock.json',
        };
    }

    return {
        edges: [],
        defaultSourceFile: 'package-lock.json',
    };
}

function parseNpmV2V3(packages: UnknownRecord): RawEdge[] {
    const rootEntry = toRecord(packages['']);
    if (rootEntry === null) {
        return [];
    }

    const edges: RawEdge[] = [];
    const stack: NpmDependencyTraversalItem[] = [];
    const visited = new Set<string>();

    pushNpmDependencySet(stack, '', ROOT_PARENT, rootEntry, 0);

    while (stack.length > 0) {
        const item = stack.pop() as NpmDependencyTraversalItem;

        const visitKey = `${item.parentPath}|${item.parentName}|${item.depName}|${item.scope}`;
        if (visited.has(visitKey)) {
            continue;
        }
        visited.add(visitKey);

        const resolved = resolveNpmPackage(packages, item.parentPath, item.depName);
        const childEntry = resolved.entry;

        const childName = normalizeString(childEntry?.name) ?? item.depName;
        const version = selectResolvedVersion(childEntry?.version);
        const scope = refineScope(item.scope, childEntry);

        edges.push({
            parent: item.parentName,
            child: childName,
            version,
            scope,
            depth: item.depth + 1,
        });

        if (childEntry !== null) {
            pushNpmDependencySet(stack, resolved.path, childName, childEntry, item.depth + 1);
        }
    }

    return edges;
}

function pushNpmDependencySet(
    stack: NpmDependencyTraversalItem[],
    parentPath: string,
    parentName: string,
    entry: UnknownRecord,
    depth: number,
): void {
    pushNpmDepMap(stack, parentPath, parentName, toRecord(entry.dependencies), 'runtime', depth);
    pushNpmDepMap(stack, parentPath, parentName, toRecord(entry.devDependencies), 'dev', depth);
    pushNpmDepMap(stack, parentPath, parentName, toRecord(entry.optionalDependencies), 'optional', depth);
    pushNpmDepMap(stack, parentPath, parentName, toRecord(entry.peerDependencies), 'peer', depth);
}

function pushNpmDepMap(
    stack: NpmDependencyTraversalItem[],
    parentPath: string,
    parentName: string,
    deps: UnknownRecord | null,
    scope: DependencyScope,
    depth: number,
): void {
    if (deps === null) {
        return;
    }

    const names = Object.keys(deps)
        .filter((name) => normalizeString(name) !== null)
        .sort((a, b) => a.localeCompare(b));

    for (let i = names.length - 1; i >= 0; i -= 1) {
        stack.push({
            parentPath,
            parentName,
            depName: names[i],
            scope,
            depth,
        });
    }
}

function resolveNpmPackage(
    packages: UnknownRecord,
    parentPath: string,
    depName: string,
): { path: string; entry: UnknownRecord | null } {
    const candidates = new Set<string>();

    let currentPath: string | null = parentPath;
    while (currentPath !== null) {
        const candidate = currentPath.length === 0
            ? `node_modules/${depName}`
            : `${currentPath}/node_modules/${depName}`;
        candidates.add(candidate);
        currentPath = ascendNpmPath(currentPath);
    }

    candidates.add(`node_modules/${depName}`);

    for (const candidate of candidates) {
        const entry = toRecord(packages[candidate]);
        if (entry !== null) {
            return {
                path: candidate,
                entry,
            };
        }
    }

    return {
        path: '',
        entry: null,
    };
}

function ascendNpmPath(path: string): string | null {
    if (!path) {
        return null;
    }

    const marker = '/node_modules/';
    const idx = path.lastIndexOf(marker);

    if (idx < 0) {
        return null;
    }

    return path.slice(0, idx);
}

function parseNpmV1(dependencies: UnknownRecord): RawEdge[] {
    const edges: RawEdge[] = [];
    const stack: NpmV1TraversalItem[] = [];

    const rootNames = Object.keys(dependencies).sort((a, b) => a.localeCompare(b));
    for (let i = rootNames.length - 1; i >= 0; i -= 1) {
        stack.push({
            parentName: ROOT_PARENT,
            depName: rootNames[i],
            entry: dependencies[rootNames[i]],
            depth: 0,
        });
    }

    while (stack.length > 0) {
        const item = stack.pop() as NpmV1TraversalItem;
        const entry = toRecord(item.entry);

        const childName = item.depName;
        const scope = scopeFromNpmEntry(entry);
        const version = selectResolvedVersion(entry?.version);

        edges.push({
            parent: item.parentName,
            child: childName,
            version,
            scope,
            depth: item.depth + 1,
        });

        const nestedDeps = toRecord(entry?.dependencies);
        if (nestedDeps === null) {
            continue;
        }

        const names = Object.keys(nestedDeps).sort((a, b) => a.localeCompare(b));
        for (let i = names.length - 1; i >= 0; i -= 1) {
            stack.push({
                parentName: childName,
                depName: names[i],
                entry: nestedDeps[names[i]],
                depth: item.depth + 1,
            });
        }
    }

    return edges;
}

function parseYarnLock(content: string): RawEdge[] {
    const blocks = parseYarnBlocks(content);
    if (blocks.length === 0) {
        return [];
    }

    const records: YarnRecord[] = blocks
        .map((block) => ({
            name: parseYarnSelectorName(block.selectors[0]),
            version: block.version,
            dependencies: block.dependencies,
        }))
        .filter((record) => normalizeString(record.name) !== null);

    if (records.length === 0) {
        return [];
    }

    const byName = new Map<string, string[]>();
    for (const record of records) {
        const existing = byName.get(record.name) ?? [];
        if (record.version !== null) {
            existing.push(record.version);
        }
        byName.set(record.name, existing);
    }

    for (const versions of byName.values()) {
        versions.sort((a, b) => a.localeCompare(b));
    }

    const edges: RawEdge[] = [];

    const sortedRecords = [...records].sort((a, b) => {
        const byName = a.name.localeCompare(b.name);
        if (byName !== 0) {
            return byName;
        }

        return compareNullableStrings(a.version, b.version);
    });

    for (const record of sortedRecords) {
        const depNames = Object.keys(record.dependencies).sort((a, b) => a.localeCompare(b));

        for (const depName of depNames) {
            const knownVersions = byName.get(depName) ?? [];
            const resolvedVersion = knownVersions.length > 0 ? knownVersions[0] : null;

            edges.push({
                parent: record.name,
                child: depName,
                version: resolvedVersion,
                scope: 'runtime',
            });
        }
    }

    return edges;
}

function parseYarnBlocks(content: string): YarnBlock[] {
    const lines = content.replace(/\r\n/g, '\n').split('\n');
    const blocks: YarnBlock[] = [];

    let current: YarnBlock | null = null;
    let inDependencies = false;

    for (const line of lines) {
        if (line.trim().length === 0) {
            continue;
        }

        if (!line.startsWith(' ')) {
            if (!line.endsWith(':')) {
                current = null;
                inDependencies = false;
                continue;
            }

            const selectorSection = line.slice(0, -1).trim();
            const selectors = selectorSection
                .split(',')
                .map((selector) => selector.trim())
                .map((selector) => selector.replace(/^"|"$/g, ''))
                .filter((selector) => selector.length > 0);

            current = {
                selectors,
                version: null,
                dependencies: {},
            };
            blocks.push(current);
            inDependencies = false;
            continue;
        }

        if (current === null) {
            continue;
        }

        const trimmed = line.trim();

        if (trimmed.startsWith('version ')) {
            const maybeVersion = trimmed.slice('version '.length).trim().replace(/^"|"$/g, '');
            current.version = normalizeString(maybeVersion);
            inDependencies = false;
            continue;
        }

        if (trimmed === 'dependencies:') {
            inDependencies = true;
            continue;
        }

        if (inDependencies && line.startsWith('    ')) {
            const depLine = trimmed;
            const firstSpaceIdx = depLine.indexOf(' ');
            if (firstSpaceIdx <= 0) {
                continue;
            }

            const depName = depLine.slice(0, firstSpaceIdx).replace(/^"|"$/g, '').trim();
            const depVersion = depLine.slice(firstSpaceIdx + 1).replace(/^"|"$/g, '').trim();
            if (depName.length > 0 && depVersion.length > 0) {
                current.dependencies[depName] = depVersion;
            }
            continue;
        }

        inDependencies = false;
    }

    return blocks;
}

function parseYarnSelectorName(selector: string): string {
    const normalized = selector.replace(/^"|"$/g, '').trim();
    if (!normalized) {
        return '';
    }

    if (normalized.startsWith('@')) {
        const secondAt = normalized.indexOf('@', 1);
        return secondAt > 0 ? normalized.slice(0, secondAt) : normalized;
    }

    const at = normalized.indexOf('@');
    return at > 0 ? normalized.slice(0, at) : normalized;
}

function dedupeAndSortEdges(edges: RawEdge[]): RawEdge[] {
    const deduped = new Map<string, RawEdge>();

    for (const edge of edges) {
        const parent = normalizeString(edge.parent);
        const child = normalizeString(edge.child);

        if (parent === null || child === null) {
            continue;
        }

        const canonical: RawEdge = {
            parent,
            child,
            version: edge.version,
            scope: edge.scope,
            depth: edge.depth,
        };

        const key = [
            canonical.parent,
            canonical.child,
            canonical.version ?? '__NULL__',
            canonical.scope,
        ].join('|');

        if (!deduped.has(key)) {
            deduped.set(key, canonical);
        }
    }

    return Array.from(deduped.values()).sort((left, right) => {
        const byParent = left.parent.localeCompare(right.parent);
        if (byParent !== 0) return byParent;

        const byChild = left.child.localeCompare(right.child);
        if (byChild !== 0) return byChild;

        const byVersion = compareNullableStrings(left.version, right.version);
        if (byVersion !== 0) return byVersion;

        return left.scope.localeCompare(right.scope);
    });
}

function scopeFromNpmEntry(entry: UnknownRecord | null): DependencyScope {
    if (entry === null) {
        return 'unknown';
    }

    if (entry.peer === true) return 'peer';
    if (entry.optional === true) return 'optional';
    if (entry.dev === true) return 'dev';
    return 'runtime';
}

function refineScope(scope: DependencyScope, entry: UnknownRecord | null): DependencyScope {
    if (entry === null) {
        return scope;
    }

    if (entry.peer === true) return 'peer';
    if (entry.optional === true) return 'optional';
    if (entry.dev === true && scope === 'runtime') return 'dev';
    return scope;
}

function selectResolvedVersion(value: unknown): string | null {
    const normalized = normalizeString(value);
    if (normalized === null) {
        return null;
    }

    if (!looksLikeResolvedVersion(normalized)) {
        return null;
    }

    return normalized;
}

function looksLikeResolvedVersion(value: string): boolean {
    const lower = value.toLowerCase();

    if (
        lower.startsWith('file:')
        || lower.startsWith('link:')
        || lower.startsWith('workspace:')
        || lower.startsWith('npm:')
        || lower.startsWith('git+')
        || lower.startsWith('http://')
        || lower.startsWith('https://')
    ) {
        return false;
    }

    return !/[\^~><=*|xX\s]/.test(value);
}

function normalizeCreatedAt(value: number | undefined): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    return Date.now();
}

function normalizeSourceFile(sourceFile: string, fallback: string): string {
    const normalized = sourceFile.replace(/\\/g, '/').replace(/^[A-Za-z]:\//, '');
    const withoutDot = normalized.replace(/^\.\//, '');
    const withoutLeadingSlash = withoutDot.replace(/^\/+/, '');

    return withoutLeadingSlash || fallback;
}

function normalizeLockfileVersion(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.trunc(value);
    }

    return 1;
}

function tryParseJson(value: string): UnknownRecord | null {
    try {
        const parsed = JSON.parse(value) as unknown;
        return toRecord(parsed);
    } catch {
        return null;
    }
}

function compareNullableStrings(left: string | null, right: string | null): number {
    if (left === right) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return left.localeCompare(right);
}

function toRecord(value: unknown): UnknownRecord | null {
    if (!isRecord(value)) {
        return null;
    }

    return value;
}

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
