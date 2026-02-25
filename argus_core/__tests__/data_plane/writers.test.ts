import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { generateDependencyId, generateFindingId } from '../../lib/identity';
import type { ElasticsearchBulkClientLike } from '../../lib/data_plane/writers';
import {
    writeActions,
    writeArtifacts,
    writeDependencies,
    writeFindings,
    writeReachability,
    writeThreatIntel,
} from '../../lib/data_plane/writers';

type UnknownRecord = Record<string, unknown>;

class InMemoryBulkClient implements ElasticsearchBulkClientLike {
    private readonly store = new Map<string, Map<string, UnknownRecord>>();

    failIds = new Set<string>();
    throwOnBulk = false;
    lastOperations: Array<Record<string, unknown>> = [];
    bulkCalls = 0;

    async bulk(params: {
        operations: Array<Record<string, unknown>>;
        refresh?: 'true' | 'false' | 'wait_for';
    }): Promise<unknown> {
        this.bulkCalls += 1;
        this.lastOperations = params.operations;

        if (this.throwOnBulk) {
            throw new Error('bulk unavailable');
        }

        const items: Array<Record<string, UnknownRecord>> = [];

        for (let cursor = 0; cursor < params.operations.length; cursor += 2) {
            const action = params.operations[cursor];
            const document = params.operations[cursor + 1] as UnknownRecord;

            const actionMeta = this.extractActionMeta(action);
            if (!actionMeta) {
                items.push({
                    index: {
                        status: 400,
                        error: { type: 'invalid_action', reason: 'invalid action metadata' },
                    },
                });
                continue;
            }

            const { index, id } = actionMeta;

            if (this.failIds.has(id)) {
                items.push({
                    index: {
                        _id: id,
                        status: 409,
                        error: { type: 'version_conflict_engine_exception', reason: 'conflict' },
                    },
                });
                continue;
            }

            const bucket = this.getIndexBucket(index);
            bucket.set(id, structuredClone(document));

            items.push({
                index: {
                    _id: id,
                    status: 201,
                    result: 'created',
                },
            });
        }

        return {
            errors: items.some((item) => {
                const result = item.index;
                return typeof result.status === 'number' && result.status >= 300;
            }),
            items,
        };
    }

    getDocument(index: string, id: string): UnknownRecord | undefined {
        return this.store.get(index)?.get(id);
    }

    getIndexSize(index: string): number {
        return this.store.get(index)?.size ?? 0;
    }

    private getIndexBucket(index: string): Map<string, UnknownRecord> {
        if (!this.store.has(index)) {
            this.store.set(index, new Map());
        }

        return this.store.get(index) as Map<string, UnknownRecord>;
    }

    private extractActionMeta(action: Record<string, unknown>): { index: string; id: string } | null {
        const indexAction = action.index;
        if (!isRecord(indexAction)) {
            return null;
        }

        const index = typeof indexAction._index === 'string' ? indexAction._index : null;
        const id = typeof indexAction._id === 'string' ? indexAction._id : null;

        if (!index || !id) {
            return null;
        }

        return { index, id };
    }
}

describe('data plane writers', () => {
    it('uses deterministic finding _id with no duplicate docs across reruns', async () => {
        const client = new InMemoryBulkClient();
        const finding = buildFinding('fp-1');

        const runOne = await writeFindings(client, [finding]);
        const runTwo = await writeFindings(client, [finding]);

        expect(runOne.succeeded).toBe(1);
        expect(runTwo.succeeded).toBe(1);
        expect(runOne.failed).toBe(0);
        expect(runTwo.failed).toBe(0);

        expect(client.getIndexSize('argonaut_findings')).toBe(1);
        expect(runOne.upsertedIds[0]).toBe(runTwo.upsertedIds[0]);

        const stored = client.getDocument('argonaut_findings', finding.findingId);
        expect(stored).toEqual(finding);
        expect(Object.keys(stored ?? {}).sort()).toEqual(Object.keys(finding).sort());
    });

    it('hard-fails when deterministic finding ID is missing', async () => {
        const client = new InMemoryBulkClient();
        const finding = buildFinding('fp-missing');
        const invalid = { ...finding };
        delete (invalid as { findingId?: string }).findingId;

        const report = await writeFindings(client, [invalid]);

        expect(report.succeeded).toBe(0);
        expect(report.failed).toBe(1);
        expect(report.failures[0].code).toBe('MISSING_REQUIRED_ID');
        expect(client.bulkCalls).toBe(0);
    });

    it('detects finding ID mismatch without writer-side hash reimplementation', async () => {
        const client = new InMemoryBulkClient();
        const finding = buildFinding('fp-mismatch');

        const report = await writeFindings(client, [
            {
                ...finding,
                findingId: 'bad-id',
            },
        ]);

        expect(report.succeeded).toBe(0);
        expect(report.failed).toBe(1);
        expect(report.failures[0].code).toBe('ID_MISMATCH');
        expect(client.getIndexSize('argonaut_findings')).toBe(0);
    });

    it('preserves explicit nulls and stable _source on dependency reruns', async () => {
        const client = new InMemoryBulkClient();
        const dependency = buildDependency(null);

        const runOne = await writeDependencies(client, [dependency]);
        const runTwo = await writeDependencies(client, [dependency]);

        expect(runOne.failed).toBe(0);
        expect(runTwo.failed).toBe(0);
        expect(client.getIndexSize('argonaut_dependencies')).toBe(1);

        const stored = client.getDocument('argonaut_dependencies', dependency.dependencyId);
        expect(stored?.version).toBeNull();
        expect(stored).toEqual(dependency);
    });

    it('reports deterministic partial failures from bulk responses', async () => {
        const client = new InMemoryBulkClient();
        const actionOne = buildActionDoc({
            actionId: '1111111111111111111111111111111111111111111111111111111111111111',
            idempotencyKey: '1111111111111111111111111111111111111111111111111111111111111111',
            findingId: 'finding-a',
        });
        const actionTwo = buildActionDoc({
            actionId: '2222222222222222222222222222222222222222222222222222222222222222',
            idempotencyKey: '2222222222222222222222222222222222222222222222222222222222222222',
            findingId: 'finding-b',
        });
        client.failIds.add(actionTwo.actionId as string);

        const report = await writeActions(client, [
            actionOne,
            actionTwo,
        ]);

        expect(report.attempted).toBe(2);
        expect(report.succeeded).toBe(1);
        expect(report.failed).toBe(1);
        expect(report.failures[0].code).toBe('BULK_ITEM_FAILED');
        expect(client.getIndexSize('argonaut_actions')).toBe(1);
    });

    it('rejects action documents that violate audit contract fields', async () => {
        const client = new InMemoryBulkClient();

        const missingPayloadHash = buildActionDoc({
            actionId: '3333333333333333333333333333333333333333333333333333333333333333',
            idempotencyKey: '3333333333333333333333333333333333333333333333333333333333333333',
            findingId: 'finding-a',
            payloadHash: undefined,
        });

        const unsortedSummary = buildActionDoc({
            actionId: '4444444444444444444444444444444444444444444444444444444444444444',
            idempotencyKey: '4444444444444444444444444444444444444444444444444444444444444444',
            actionType: 'SLACK_SUMMARY',
            findingId: null,
            findingIds: ['finding-b', 'finding-a'],
            targetSystem: 'slack',
        });

        const report = await writeActions(client, [missingPayloadHash, unsortedSummary]);

        expect(report.succeeded).toBe(0);
        expect(report.failed).toBe(2);
        expect(report.failures.every((failure) => failure.code === 'MISSING_REQUIRED_FIELD')).toBe(true);
        expect(client.getIndexSize('argonaut_actions')).toBe(0);
    });

    it('enforces threat-intel _id as cve and full-replaces by deterministic key', async () => {
        const client = new InMemoryBulkClient();

        const first = {
            intelId: 'CVE-2026-0001',
            cve: 'CVE-2026-0001',
            kev: false,
            epssScore: 0.11,
            lastSeenAt: 1700000000000,
        };

        const second = {
            ...first,
            epssScore: 0.93,
        };

        const firstWrite = await writeThreatIntel(client, [first]);
        const secondWrite = await writeThreatIntel(client, [second]);

        expect(firstWrite.failed).toBe(0);
        expect(secondWrite.failed).toBe(0);
        expect(client.getIndexSize('argonaut_threatintel')).toBe(1);
        expect(client.getDocument('argonaut_threatintel', 'CVE-2026-0001')).toEqual(second);
    });

    it('rejects threat-intel documents when intelId and cve diverge', async () => {
        const client = new InMemoryBulkClient();

        const report = await writeThreatIntel(client, [
            {
                intelId: 'intel-1',
                cve: 'CVE-2026-1234',
                kev: true,
            },
        ]);

        expect(report.succeeded).toBe(0);
        expect(report.failed).toBe(1);
        expect(report.failures[0].code).toBe('ID_MISMATCH');
    });

    it('writes artifacts by deterministic artifactId and rejects missing ids', async () => {
        const client = new InMemoryBulkClient();

        const ok = await writeArtifacts(client, [
            {
                artifactId: 'artifact-1',
                repo: 'payment-service',
                buildId: '128',
                type: 'sarif',
                timestamp: 1700000000000,
            },
        ]);

        const bad = await writeArtifacts(client, [
            {
                repo: 'payment-service',
                buildId: '128',
                type: 'sarif',
                timestamp: 1700000000000,
            },
        ]);

        expect(ok.failed).toBe(0);
        expect(ok.succeeded).toBe(1);
        expect(bad.failed).toBe(1);
        expect(bad.failures[0].code).toBe('MISSING_REQUIRED_ID');
    });

    it('accepts EPIC 1 sample outputs without writer-side coercion', async () => {
        const client = new InMemoryBulkClient();

        const findingsPath = join(
            process.cwd(),
            '../program_management/epics/epic_1_argus_core_extraction_stabilization/tasks/artifacts/task_1_1/normalized_findings.sample.json',
        );
        const dependenciesPath = join(
            process.cwd(),
            '../program_management/epics/epic_1_argus_core_extraction_stabilization/tasks/artifacts/task_1_2/dependency_edges.sample.json',
        );
        const reachabilityPath = join(
            process.cwd(),
            '../program_management/epics/epic_1_argus_core_extraction_stabilization/tasks/artifacts/task_1_4/reachability_result.sample.json',
        );
        const explanationPath = join(
            process.cwd(),
            '../program_management/epics/epic_1_argus_core_extraction_stabilization/tasks/artifacts/task_1_5/priority_explanation.sample.json',
        );

        const findings = JSON.parse(readFileSync(findingsPath, 'utf8')) as UnknownRecord[];
        const dependencies = JSON.parse(readFileSync(dependenciesPath, 'utf8')) as UnknownRecord[];
        const reachability = JSON.parse(readFileSync(reachabilityPath, 'utf8')) as UnknownRecord;
        const explanation = JSON.parse(readFileSync(explanationPath, 'utf8')) as UnknownRecord;

        const findingsWithExplanation = findings.map((finding, index) => (
            index === 0
                ? {
                    ...finding,
                    priorityScore: 88.2,
                    priorityExplanation: explanation,
                }
                : finding
        ));

        const findingsReport = await writeFindings(client, findingsWithExplanation);
        const depsReport = await writeDependencies(client, dependencies);
        const reachabilityReport = await writeReachability(client, [reachability]);

        expect(findingsReport.failed).toBe(0);
        expect(depsReport.failed).toBe(0);
        expect(reachabilityReport.failed).toBe(0);

        expect(client.getIndexSize('argonaut_findings')).toBe(findingsWithExplanation.length);
        expect(client.getIndexSize('argonaut_dependencies')).toBe(dependencies.length);
        expect(client.getIndexSize('argonaut_reachability')).toBe(1);
    });
});

function buildFinding(fingerprint: string): UnknownRecord {
    const finding = {
        repo: 'payment-service',
        buildId: '128',
        fingerprint,
    };

    return {
        findingId: generateFindingId(finding),
        ...finding,
        ruleId: 'RULE-1',
        severity: 'HIGH',
        cve: null,
        cves: [],
        package: null,
        version: null,
        filePath: 'src/index.ts',
        lineNumber: 42,
        tool: 'semgrep',
        createdAt: 1700000000000,
    };
}

function buildDependency(version: string | null): UnknownRecord {
    const dependency = {
        repo: 'payment-service',
        buildId: '128',
        parent: '__root__',
        child: 'lodash',
        scope: 'runtime' as const,
        version,
    };

    return {
        dependencyId: generateDependencyId(dependency),
        ...dependency,
        runtimeFlag: true,
        sourceFile: 'package-lock.json',
        createdAt: 1700000000000,
    };
}

function buildActionDoc(overrides: Record<string, unknown>): UnknownRecord {
    const base: UnknownRecord = {
        actionId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        idempotencyKey: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        actionType: 'JIRA_CREATE',
        status: 'DRY_RUN_READY',
        runId: 'run-4',
        repo: 'payment-service',
        buildId: '128',
        findingId: 'finding-a',
        payloadHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        targetSystem: 'jira',
        templateVersion: '1.0',
        payloadType: 'JIRA_ISSUE_CREATE',
        source: 'argonaut',
        attempt: 1,
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
    };

    return {
        ...base,
        ...overrides,
    };
}

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
