export type DependencyScope = 'runtime' | 'dev' | 'test' | 'peer' | 'optional' | 'unknown';

export interface ParseLockfileMeta {
    repo: string;
    buildId: string;
    createdAt?: number;
    sourceFile?: string;
}

export interface DependencyEdge {
    dependencyId: string;
    repo: string;
    buildId: string;
    parent: string;
    child: string;
    version: string | null;
    scope: DependencyScope;
    runtimeFlag: boolean;
    sourceFile: string;
    createdAt: number;
    depth?: number;
}

export type LockfileWarningCode = 'UNSUPPORTED_VERSION' | 'UNSUPPORTED_STRUCTURE';
