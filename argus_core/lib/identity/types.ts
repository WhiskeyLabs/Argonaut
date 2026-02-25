import type { DependencyScope } from '../ingest/lockfiles/types';

export const IDENTITY_CONTRACT_VERSION = '1.0';

export interface FindingIdentityInput {
    repo: string;
    buildId: string;
    fingerprint: string;
}

export interface DependencyIdentityInput {
    repo: string;
    buildId: string;
    parent: string;
    child: string;
    version?: string | null;
    scope: DependencyScope;
}

export type CanonicalHashInput = Record<string, unknown>;
