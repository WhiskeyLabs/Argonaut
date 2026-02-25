import { IDENTITY_CONTRACT_VERSION, buildCanonicalHash, stableStringify } from '../../identity';
import type { AcquireOptions } from '../pipeline/types';
import { runAcquirePipeline } from '../pipeline/acquire';
import { enrichFindingsContext } from '../pipeline/enrich';
import { scoreAndWriteback } from '../scoring/scoreAndWriteback';
import { InMemoryDataPlaneClient } from '../testing/inMemoryClient';

type UnknownRecord = Record<string, unknown>;

type HarnessIndex =
    | 'argonaut_findings'
    | 'argonaut_dependencies'
    | 'argonaut_reachability'
    | 'argonaut_threatintel'
    | 'argonaut_actions';

const HARNESS_INDEXES: HarnessIndex[] = [
    'argonaut_findings',
    'argonaut_dependencies',
    'argonaut_reachability',
    'argonaut_threatintel',
    'argonaut_actions',
];

export interface DeterminismCapture {
    indexStats: Record<HarnessIndex, {
        count: number;
        ids: string[];
        sourceHashById: Record<string, string>;
    }>;
    ranking: {
        topN: Array<{ findingId: string; priorityScore: number }>;
    };
    versions: {
        identityContractVersion: string;
        analysisVersion: string;
        explanationVersion: string;
    };
    cardinality: {
        reachabilityPerFindingOk: boolean;
        threatPerCveOk: boolean;
        explanationPerFindingOk: boolean;
    };
}

export interface DeterminismReport {
    passed: boolean;
    failures: string[];
    baseline: DeterminismCapture;
    rerun: DeterminismCapture;
}

export interface DeterminismHarnessOptions extends AcquireOptions {
    topN?: number;
    failFast?: boolean;
}

export async function runDeterminismHarness(options: DeterminismHarnessOptions): Promise<DeterminismReport> {
    const client = new InMemoryDataPlaneClient();
    const topN = options.topN ?? 10;

    await runAcquirePipeline(client, options);
    await enrichFindingsContext(client);
    await scoreAndWriteback(client, topN);
    const baseline = captureState(client, topN);

    await runAcquirePipeline(client, options);
    await enrichFindingsContext(client);
    await scoreAndWriteback(client, topN);
    const rerun = captureState(client, topN);

    const failures = diffCaptures(baseline, rerun, options.failFast === true);

    return {
        passed: failures.length === 0,
        failures,
        baseline,
        rerun,
    };
}

export function captureState(client: InMemoryDataPlaneClient, topN: number): DeterminismCapture {
    const indexStats = HARNESS_INDEXES.reduce<DeterminismCapture['indexStats']>((acc, index) => {
        const docs = client.list(index);
        const ids = docs.map((doc) => doc.id).sort((left, right) => left.localeCompare(right));
        const sourceHashById = ids.reduce<Record<string, string>>((hashes, id) => {
            const source = docs.find((doc) => doc.id === id)?.source ?? {};
            const normalized = stripVarianceFields(source);
            hashes[id] = buildCanonicalHash(toHashInput(normalized));
            return hashes;
        }, {});

        acc[index] = {
            count: ids.length,
            ids,
            sourceHashById,
        };

        return acc;
    }, {} as DeterminismCapture['indexStats']);

    const findings = client
        .list('argonaut_findings')
        .map((entry) => entry.source)
        .filter((finding) => typeof finding.findingId === 'string');

    const ranking = findings
        .map((finding) => ({
            findingId: finding.findingId as string,
            priorityScore: typeof finding.priorityScore === 'number' ? finding.priorityScore : 0,
            repo: typeof finding.repo === 'string' ? finding.repo : '',
            buildId: typeof finding.buildId === 'string' ? finding.buildId : '',
        }))
        .sort((left, right) => {
            if (left.priorityScore !== right.priorityScore) {
                return right.priorityScore - left.priorityScore;
            }
            const byFinding = left.findingId.localeCompare(right.findingId);
            if (byFinding !== 0) return byFinding;
            const byRepo = left.repo.localeCompare(right.repo);
            if (byRepo !== 0) return byRepo;
            return left.buildId.localeCompare(right.buildId);
        })
        .slice(0, topN)
        .map((row) => ({ findingId: row.findingId, priorityScore: row.priorityScore }));

    const reachabilityByFinding = new Map<string, number>();
    for (const entry of client.list('argonaut_reachability')) {
        const findingId = typeof entry.source.findingId === 'string' ? entry.source.findingId : null;
        const analysisVersion = typeof entry.source.analysisVersion === 'string' ? entry.source.analysisVersion : null;
        if (!findingId || analysisVersion !== '1.0') {
            continue;
        }

        reachabilityByFinding.set(findingId, (reachabilityByFinding.get(findingId) ?? 0) + 1);
    }

    const threatByCve = new Map<string, number>();
    for (const entry of client.list('argonaut_threatintel')) {
        const cve = typeof entry.source.cve === 'string' ? entry.source.cve : null;
        if (!cve) {
            continue;
        }
        threatByCve.set(cve, (threatByCve.get(cve) ?? 0) + 1);
    }

    const explanationByFinding = new Map<string, number>();
    for (const finding of findings) {
        const explanation = toRecord(finding.priorityExplanation);
        const findingId = typeof finding.findingId === 'string' ? finding.findingId : null;
        if (!findingId || !explanation) {
            continue;
        }

        const explanationFindingId = typeof explanation.findingId === 'string' ? explanation.findingId : null;
        if (!explanationFindingId) {
            continue;
        }

        explanationByFinding.set(explanationFindingId, (explanationByFinding.get(explanationFindingId) ?? 0) + 1);
    }

    return {
        indexStats,
        ranking: {
            topN: ranking,
        },
        versions: {
            identityContractVersion: IDENTITY_CONTRACT_VERSION,
            analysisVersion: '1.0',
            explanationVersion: '1.0',
        },
        cardinality: {
            reachabilityPerFindingOk: Array.from(reachabilityByFinding.values()).every((count) => count === 1),
            threatPerCveOk: Array.from(threatByCve.values()).every((count) => count === 1),
            explanationPerFindingOk: Array.from(explanationByFinding.values()).every((count) => count === 1),
        },
    };
}

export function diffCaptures(baseline: DeterminismCapture, rerun: DeterminismCapture, failFast: boolean): string[] {
    const failures: string[] = [];

    for (const index of HARNESS_INDEXES) {
        if (baseline.indexStats[index].count !== rerun.indexStats[index].count) {
            failures.push(`Count drift in ${index}: ${baseline.indexStats[index].count} -> ${rerun.indexStats[index].count}`);
            if (failFast) return failures;
        }

        if (stableStringify(baseline.indexStats[index].ids) !== stableStringify(rerun.indexStats[index].ids)) {
            failures.push(`ID set drift in ${index}`);
            if (failFast) return failures;
        }

        if (stableStringify(baseline.indexStats[index].sourceHashById) !== stableStringify(rerun.indexStats[index].sourceHashById)) {
            failures.push(`_source hash drift in ${index}`);
            if (failFast) return failures;
        }
    }

    if (stableStringify(baseline.ranking.topN) !== stableStringify(rerun.ranking.topN)) {
        failures.push('Top-N ranking drift detected.');
        if (failFast) return failures;
    }

    if (stableStringify(baseline.versions) !== stableStringify(rerun.versions)) {
        failures.push('Version drift detected.');
        if (failFast) return failures;
    }

    if (!rerun.cardinality.reachabilityPerFindingOk) {
        failures.push('Cardinality failure: reachability per finding.');
        if (failFast) return failures;
    }

    if (!rerun.cardinality.threatPerCveOk) {
        failures.push('Cardinality failure: threat intel per CVE.');
        if (failFast) return failures;
    }

    if (!rerun.cardinality.explanationPerFindingOk) {
        failures.push('Cardinality failure: explanation per finding.');
    }

    return failures;
}

function stripVarianceFields(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((entry) => stripVarianceFields(entry));
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    const record = value as UnknownRecord;
    const result: UnknownRecord = {};

    for (const key of Object.keys(record).sort((left, right) => left.localeCompare(right))) {
        if (key === 'createdAt' || key === 'computedAt') {
            continue;
        }

        result[key] = stripVarianceFields(record[key]);
    }

    return result;
}

function toHashInput(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { value };
    }

    return value as Record<string, unknown>;
}

function toRecord(value: unknown): UnknownRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    return value as UnknownRecord;
}
