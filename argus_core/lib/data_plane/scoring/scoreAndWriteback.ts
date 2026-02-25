import { explainPriority } from '../../scoring';
import { writeFindings } from '../writers';
import type { ElasticsearchBulkClientLike } from '../writers';
import type { ScoreReport, RankedFinding } from './types';

type UnknownRecord = Record<string, unknown>;

type ListableClient = ElasticsearchBulkClientLike & {
    list(index: 'argonaut_findings' | 'argonaut_threatintel' | 'argonaut_reachability'):
        Array<{ id: string; source: UnknownRecord }> | Promise<Array<{ id: string; source: UnknownRecord }>>;
};

const ANALYSIS_VERSION = '1.0';

export async function scoreAndWriteback(client: ListableClient, topN = 10): Promise<ScoreReport> {
    const findings = (await resolveList(client.list('argonaut_findings'))).map((entry) => ({ ...entry.source }));
    const threats = (await resolveList(client.list('argonaut_threatintel'))).map((entry) => ({ ...entry.source }));
    const reachability = (await resolveList(client.list('argonaut_reachability'))).map((entry) => ({ ...entry.source }));

    const threatByCve = new Map<string, UnknownRecord>();
    for (const threat of threats) {
        const cve = normalizeCve(threat.cve);
        if (!cve) {
            continue;
        }
        threatByCve.set(cve, threat);
    }

    const joinWarnings: string[] = [];
    const reachabilityByFinding = new Map<string, UnknownRecord>();

    for (const record of reachability) {
        const findingId = normalizeString(record.findingId);
        if (!findingId) {
            continue;
        }

        const analysisVersion = normalizeString(record.analysisVersion);
        if (analysisVersion !== ANALYSIS_VERSION) {
            continue;
        }

        const prior = reachabilityByFinding.get(findingId);
        if (!prior) {
            reachabilityByFinding.set(findingId, record);
            continue;
        }

        const priorId = normalizeString(prior.reachabilityId) ?? 'zzzz';
        const nextId = normalizeString(record.reachabilityId) ?? 'zzzz';

        if (nextId.localeCompare(priorId) < 0) {
            reachabilityByFinding.set(findingId, record);
        }

        joinWarnings.push(`Multiple reachability docs for ${findingId}; selected deterministic winner.`);
    }

    const updatedFindings: UnknownRecord[] = [];
    const ranked: RankedFinding[] = [];

    for (const finding of findings) {
        const findingId = normalizeString(finding.findingId);
        const repo = normalizeString(finding.repo);
        const buildId = normalizeString(finding.buildId);

        if (!findingId || !repo || !buildId) {
            continue;
        }

        const cve = normalizeCve(finding.cve);
        const threat = cve ? threatByCve.get(cve) : null;
        const reach = reachabilityByFinding.get(findingId) ?? null;

        const kev = normalizeBoolean(threat?.kev) ?? false;
        const epss = normalizeScore(threat?.epssScore ?? threat?.epss);
        const reachable = normalizeBoolean(reach?.reachable) ?? false;
        const confidenceScore = normalizeScore(reach?.confidenceScore);
        const internetExposed = normalizeNullableBoolean((finding.context as UnknownRecord | undefined)?.internetExposed);
        const blastRadius = normalizeNullableInteger((finding.context as UnknownRecord | undefined)?.blastRadius);

        const contribution = computeScore({
            kev,
            epss,
            reachable,
            internetExposed,
            blastRadius,
        });

        const explanation = explainPriority({
            findingId,
            repo,
            buildId,
            kev,
            epss,
            reachable,
            internetExposed,
            confidenceScore,
            blastRadius,
            totalScore: contribution.total,
            explanationVersion: '1.0',
        });

        const updated = {
            ...finding,
            priorityScore: contribution.total,
            priorityExplanation: explanation,
        } satisfies UnknownRecord;

        updatedFindings.push(updated);

        ranked.push({
            findingId,
            repo,
            buildId,
            priorityScore: contribution.total,
            explanationId: explanation.explanationId,
            reasonCodes: explanation.reasonCodes,
        });
    }

    ranked.sort((left, right) => {
        if (left.priorityScore !== right.priorityScore) {
            return right.priorityScore - left.priorityScore;
        }

        const byFinding = left.findingId.localeCompare(right.findingId);
        if (byFinding !== 0) {
            return byFinding;
        }

        const byRepo = left.repo.localeCompare(right.repo);
        if (byRepo !== 0) {
            return byRepo;
        }

        return left.buildId.localeCompare(right.buildId);
    });

    const writeReport = await writeFindings(client, updatedFindings);
    if (writeReport.failed > 0) {
        throw new Error(`Score writeback failed: ${writeReport.failures.map((failure) => failure.message).join('; ')}`);
    }

    return {
        processed: ranked.length,
        topN: ranked.slice(0, topN),
        joinWarnings: Array.from(new Set(joinWarnings)).sort((left, right) => left.localeCompare(right)),
    };
}

async function resolveList(
    value: Array<{ id: string; source: UnknownRecord }> | Promise<Array<{ id: string; source: UnknownRecord }>>,
): Promise<Array<{ id: string; source: UnknownRecord }>> {
    return Promise.resolve(value);
}

function computeScore(input: {
    kev: boolean;
    epss: number | null;
    reachable: boolean;
    internetExposed: boolean | null;
    blastRadius: number | null;
}): { total: number } {
    let total = 0;

    total += input.kev ? 30 : 0;

    if (input.epss === null) {
        total += 0;
    } else if (input.epss >= 0.5) {
        total += 20;
    } else if (input.epss >= 0.1) {
        total += 10;
    } else {
        total += 2;
    }

    total += input.reachable ? 25 : 0;
    total += input.internetExposed === true ? 15 : 0;

    if (input.blastRadius === null) {
        total += 0;
    } else if (input.blastRadius >= 10) {
        total += 10;
    } else if (input.blastRadius >= 3) {
        total += 5;
    } else {
        total += 1;
    }

    return { total };
}

function normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function normalizeCve(value: unknown): string | null {
    const text = normalizeString(value);
    if (!text) {
        return null;
    }

    const cve = text.toUpperCase();
    if (!/^CVE-\d{4}-\d{4,}$/.test(cve)) {
        return null;
    }

    return cve;
}

function normalizeBoolean(value: unknown): boolean | null {
    if (typeof value !== 'boolean') {
        return null;
    }

    return value;
}

function normalizeNullableBoolean(value: unknown): boolean | null {
    if (value === null || value === undefined) {
        return null;
    }

    return normalizeBoolean(value);
}

function normalizeNullableInteger(value: unknown): number | null {
    if (value === null || value === undefined) {
        return null;
    }

    if (!Number.isInteger(value) || (value as number) < 0) {
        return null;
    }

    return value as number;
}

function normalizeScore(value: unknown): number | null {
    if (value === null || value === undefined) {
        return null;
    }

    if (!Number.isFinite(value)) {
        return null;
    }

    const numeric = value as number;
    if (numeric < 0 || numeric > 1) {
        return null;
    }

    return numeric;
}
