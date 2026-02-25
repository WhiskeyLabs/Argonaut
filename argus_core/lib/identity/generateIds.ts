import { IdentityGenerationError } from './errors';
import { buildCanonicalHash } from './canonicalHash';
import { DependencyIdentityInput, FindingIdentityInput } from './types';

type UnknownRecord = Record<string, unknown>;

export function generateFindingId(input: FindingIdentityInput): string {
    const record = expectRecord(input);

    const repo = expectRequiredString(record.repo, 'repo');
    const buildId = expectRequiredString(record.buildId, 'buildId');
    const fingerprint = expectRequiredString(record.fingerprint, 'fingerprint');

    return buildCanonicalHash({
        kind: 'finding',
        repo,
        buildId,
        fingerprint,
    });
}

export function generateDependencyId(input: DependencyIdentityInput): string {
    const record = expectRecord(input);

    const repo = expectRequiredString(record.repo, 'repo');
    const buildId = expectRequiredString(record.buildId, 'buildId');
    const parent = expectRequiredString(record.parent, 'parent');
    const child = expectRequiredString(record.child, 'child');
    const scope = expectRequiredString(record.scope, 'scope');
    const version = normalizeNullableString(record.version);

    return buildCanonicalHash({
        kind: 'dependency',
        repo,
        buildId,
        parent,
        child,
        version,
        scope,
    });
}

function expectRecord(value: unknown): UnknownRecord {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new IdentityGenerationError('INVALID_IDENTITY_INPUT', 'Identity input must be an object.');
    }

    return value as UnknownRecord;
}

function expectRequiredString(value: unknown, field: string): string {
    if (typeof value !== 'string') {
        throw new IdentityGenerationError('MISSING_REQUIRED_FIELD', `${field} must be a non-empty string.`);
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
        throw new IdentityGenerationError('MISSING_REQUIRED_FIELD', `${field} must be a non-empty string.`);
    }

    return trimmed;
}

function normalizeNullableString(value: unknown): string | null {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value !== 'string') {
        throw new IdentityGenerationError('INVALID_IDENTITY_INPUT', 'version must be string, null, or undefined.');
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
