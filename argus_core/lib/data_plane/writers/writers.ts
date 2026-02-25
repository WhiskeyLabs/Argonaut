import { generateDependencyId, generateFindingId } from '../../identity';
import type { ArgonautIndexName } from '../mappings';
import type { ElasticsearchBulkClientLike, WriterFailure, WriterReport } from './types';
import { writeDocuments } from './writeDocuments';

type UnknownRecord = Record<string, unknown>;
const ACTION_TYPES = new Set(['JIRA_CREATE', 'SLACK_SUMMARY', 'SLACK_THREAD', 'SLACK_LIFECYCLE']);
const ACTION_STATUSES = new Set([
    'DRY_RUN_READY',
    'SKIPPED_DUPLICATE',
    'FAILED_VALIDATION',
    'EXECUTED',
    'FAILED_EXECUTION',
]);
const TARGET_SYSTEMS = new Set(['jira', 'slack']);

export async function writeArtifacts(client: ElasticsearchBulkClientLike, documents: unknown[]): Promise<WriterReport> {
    return writeDocuments(client, 'argonaut_artifacts', documents, resolveRequiredId('argonaut_artifacts', 'artifactId'));
}

export async function writeFindings(client: ElasticsearchBulkClientLike, documents: unknown[]): Promise<WriterReport> {
    return writeDocuments(client, 'argonaut_findings', documents, resolveFindingId);
}

export async function writeDependencies(client: ElasticsearchBulkClientLike, documents: unknown[]): Promise<WriterReport> {
    return writeDocuments(client, 'argonaut_dependencies', documents, resolveDependencyId);
}

export async function writeSbom(client: ElasticsearchBulkClientLike, documents: unknown[]): Promise<WriterReport> {
    return writeDocuments(client, 'argonaut_sbom', documents, resolveRequiredId('argonaut_sbom', 'componentId'));
}

export async function writeReachability(client: ElasticsearchBulkClientLike, documents: unknown[]): Promise<WriterReport> {
    return writeDocuments(client, 'argonaut_reachability', documents, resolveRequiredId('argonaut_reachability', 'reachabilityId'));
}

export async function writeThreatIntel(client: ElasticsearchBulkClientLike, documents: unknown[]): Promise<WriterReport> {
    return writeDocuments(client, 'argonaut_threatintel', documents, resolveThreatIntelId);
}

export async function writeActions(client: ElasticsearchBulkClientLike, documents: unknown[]): Promise<WriterReport> {
    return writeDocuments(client, 'argonaut_actions', documents, resolveActionId);
}

function resolveRequiredId(index: ArgonautIndexName, field: string) {
    return (document: unknown, position: number): string | WriterFailure => {
        const record = expectRecord(index, document, position);
        if ('code' in record) {
            return record;
        }

        const id = readRequiredString(record, field);
        if (typeof id !== 'string') {
            return failure(index, position, 'MISSING_REQUIRED_ID', null, `${field} is required and must be a non-empty string.`);
        }

        return id;
    };
}

function resolveFindingId(document: unknown, position: number): string | WriterFailure {
    const index: ArgonautIndexName = 'argonaut_findings';

    const record = expectRecord(index, document, position);
    if ('code' in record) {
        return record;
    }

    const findingId = readRequiredString(record, 'findingId');
    if (typeof findingId !== 'string') {
        return failure(index, position, 'MISSING_REQUIRED_ID', null, 'findingId is required and must be a non-empty string.');
    }

    const repo = readRequiredString(record, 'repo');
    const buildId = readRequiredString(record, 'buildId');
    const fingerprint = readRequiredString(record, 'fingerprint');

    if (!repo || !buildId || !fingerprint) {
        return failure(index, position, 'MISSING_REQUIRED_FIELD', findingId, 'repo, buildId, and fingerprint are required for identity verification.');
    }

    let expectedId: string;
    try {
        expectedId = generateFindingId({ repo, buildId, fingerprint });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'identity generation error';
        return failure(index, position, 'MISSING_REQUIRED_FIELD', findingId, message);
    }

    if (findingId !== expectedId) {
        return failure(index, position, 'ID_MISMATCH', findingId, 'findingId does not match identity layer output.');
    }

    return findingId;
}

function resolveDependencyId(document: unknown, position: number): string | WriterFailure {
    const index: ArgonautIndexName = 'argonaut_dependencies';

    const record = expectRecord(index, document, position);
    if ('code' in record) {
        return record;
    }

    const dependencyId = readRequiredString(record, 'dependencyId');
    if (typeof dependencyId !== 'string') {
        return failure(index, position, 'MISSING_REQUIRED_ID', null, 'dependencyId is required and must be a non-empty string.');
    }

    const repo = readRequiredString(record, 'repo');
    const buildId = readRequiredString(record, 'buildId');
    const parent = readRequiredString(record, 'parent');
    const child = readRequiredString(record, 'child');
    const scope = readRequiredString(record, 'scope');

    if (!repo || !buildId || !parent || !child || !scope) {
        return failure(index, position, 'MISSING_REQUIRED_FIELD', dependencyId, 'repo, buildId, parent, child, and scope are required for identity verification.');
    }

    const version = normalizeNullableString(record.version);

    let expectedId: string;
    try {
        expectedId = generateDependencyId({
            repo,
            buildId,
            parent,
            child,
            scope,
            version,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'identity generation error';
        return failure(index, position, 'MISSING_REQUIRED_FIELD', dependencyId, message);
    }

    if (dependencyId !== expectedId) {
        return failure(index, position, 'ID_MISMATCH', dependencyId, 'dependencyId does not match identity layer output.');
    }

    return dependencyId;
}

function resolveThreatIntelId(document: unknown, position: number): string | WriterFailure {
    const index: ArgonautIndexName = 'argonaut_threatintel';

    const record = expectRecord(index, document, position);
    if ('code' in record) {
        return record;
    }

    const cve = readRequiredString(record, 'cve');
    if (typeof cve !== 'string') {
        return failure(index, position, 'MISSING_REQUIRED_ID', null, 'cve is required for threat-intel writer _id.');
    }

    const intelId = readRequiredString(record, 'intelId');
    if (typeof intelId !== 'string') {
        return failure(index, position, 'MISSING_REQUIRED_FIELD', cve, 'intelId is required and must match cve.');
    }

    if (intelId !== cve) {
        return failure(index, position, 'ID_MISMATCH', cve, 'intelId must match cve for deterministic threat-intel upserts.');
    }

    return cve;
}

function resolveActionId(document: unknown, position: number): string | WriterFailure {
    const index: ArgonautIndexName = 'argonaut_actions';

    const record = expectRecord(index, document, position);
    if ('code' in record) {
        return record;
    }

    const actionId = readRequiredString(record, 'actionId');
    if (!actionId) {
        return failure(index, position, 'MISSING_REQUIRED_ID', null, 'actionId is required and must be a non-empty string.');
    }

    const idempotencyKey = readRequiredString(record, 'idempotencyKey');
    if (!idempotencyKey) {
        return failure(index, position, 'MISSING_REQUIRED_FIELD', actionId, 'idempotencyKey is required and must be a non-empty string.');
    }

    if (actionId !== idempotencyKey) {
        return failure(index, position, 'ID_MISMATCH', actionId, 'actionId must match idempotencyKey for deterministic action upserts.');
    }

    if (!isSha256Hex(idempotencyKey)) {
        return failure(index, position, 'MISSING_REQUIRED_FIELD', actionId, 'idempotencyKey must be a 64-char lowercase sha256 hex string.');
    }

    const actionType = readRequiredString(record, 'actionType');
    if (!actionType || !ACTION_TYPES.has(actionType)) {
        return failure(index, position, 'MISSING_REQUIRED_FIELD', actionId, 'actionType is required and must be one of JIRA_CREATE, SLACK_SUMMARY, SLACK_THREAD, SLACK_LIFECYCLE.');
    }

    const status = readRequiredString(record, 'status');
    if (!status || !ACTION_STATUSES.has(status)) {
        return failure(index, position, 'MISSING_REQUIRED_FIELD', actionId, 'status is required and must be a recognized action audit status.');
    }

    const runId = readRequiredString(record, 'runId');
    const repo = readRequiredString(record, 'repo');
    const buildId = readRequiredString(record, 'buildId');
    const templateVersion = readRequiredString(record, 'templateVersion');
    const targetSystem = readRequiredString(record, 'targetSystem');
    const payloadHash = readRequiredString(record, 'payloadHash');

    if (!runId || !repo || !buildId || !templateVersion || !targetSystem || !payloadHash) {
        return failure(
            index,
            position,
            'MISSING_REQUIRED_FIELD',
            actionId,
            'runId, repo, buildId, templateVersion, targetSystem, and payloadHash are required action audit fields.',
        );
    }

    if (!TARGET_SYSTEMS.has(targetSystem)) {
        return failure(index, position, 'MISSING_REQUIRED_FIELD', actionId, 'targetSystem must be jira or slack.');
    }

    if (!isSha256Hex(payloadHash)) {
        return failure(index, position, 'MISSING_REQUIRED_FIELD', actionId, 'payloadHash must be a 64-char lowercase sha256 hex string.');
    }

    const createdAt = record.createdAt;
    const updatedAt = record.updatedAt;
    if (!isDateValue(createdAt) || !isDateValue(updatedAt)) {
        return failure(index, position, 'MISSING_REQUIRED_FIELD', actionId, 'createdAt and updatedAt are required and must be finite epoch values or ISO date strings.');
    }

    const attempt = record.attempt;
    if (attempt !== undefined && (!Number.isInteger(attempt) || (attempt as number) <= 0)) {
        return failure(index, position, 'MISSING_REQUIRED_FIELD', actionId, 'attempt must be a positive integer when present.');
    }

    const findingId = normalizeNullableString(record.findingId);
    const findingIds = normalizeStringArray(record.findingIds);

    if (actionType === 'JIRA_CREATE' || actionType === 'SLACK_THREAD') {
        if (!findingId) {
            return failure(index, position, 'MISSING_REQUIRED_FIELD', actionId, `${actionType} requires a non-empty findingId.`);
        }

        if (findingIds && findingIds.length > 0) {
            return failure(index, position, 'MISSING_REQUIRED_FIELD', actionId, `${actionType} must not include findingIds.`);
        }
    }

    if (actionType === 'SLACK_SUMMARY') {
        if (!findingIds || findingIds.length === 0) {
            return failure(index, position, 'MISSING_REQUIRED_FIELD', actionId, 'SLACK_SUMMARY requires findingIds with at least one value.');
        }

        if (findingId !== null) {
            return failure(index, position, 'MISSING_REQUIRED_FIELD', actionId, 'SLACK_SUMMARY must not include findingId.');
        }

        if (!isSortedAscending(findingIds)) {
            return failure(index, position, 'MISSING_REQUIRED_FIELD', actionId, 'findingIds must be sorted in ascending findingId order.');
        }
    }

    if (actionType === 'SLACK_LIFECYCLE') {
        if (findingId !== null) {
            return failure(index, position, 'MISSING_REQUIRED_FIELD', actionId, 'SLACK_LIFECYCLE must not include findingId.');
        }

        if (findingIds && findingIds.length > 0) {
            return failure(index, position, 'MISSING_REQUIRED_FIELD', actionId, 'SLACK_LIFECYCLE must not include findingIds.');
        }
    }

    return actionId;
}

function expectRecord(index: ArgonautIndexName, document: unknown, position: number): UnknownRecord | WriterFailure {
    if (typeof document !== 'object' || document === null || Array.isArray(document)) {
        return failure(index, position, 'INVALID_INPUT', null, 'document must be a non-null object.');
    }

    return document as UnknownRecord;
}

function readRequiredString(record: UnknownRecord, field: string): string | null {
    const value = record[field];

    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function normalizeNullableString(value: unknown): string | null {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function normalizeStringArray(value: unknown): string[] | null {
    if (!Array.isArray(value)) {
        return null;
    }

    const normalized: string[] = [];
    for (const entry of value) {
        const normalizedEntry = normalizeNullableString(entry);
        if (!normalizedEntry) {
            return null;
        }

        normalized.push(normalizedEntry);
    }

    return normalized;
}

function isSortedAscending(values: string[]): boolean {
    for (let index = 1; index < values.length; index += 1) {
        if (values[index - 1].localeCompare(values[index]) > 0) {
            return false;
        }
    }

    return true;
}

function isSha256Hex(value: string): boolean {
    return /^[0-9a-f]{64}$/.test(value);
}

function isDateValue(value: unknown): boolean {
    if (typeof value === 'number') {
        return Number.isFinite(value);
    }

    if (typeof value === 'string') {
        return value.trim().length > 0;
    }

    return false;
}

function failure(
    index: ArgonautIndexName,
    position: number,
    code: WriterFailure['code'],
    documentId: string | null,
    message: string,
): WriterFailure {
    return {
        code,
        index,
        documentId,
        position,
        message,
    };
}
