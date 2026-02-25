import { writeFindings } from '../writers';
import type { ElasticsearchBulkClientLike } from '../writers';

type UnknownRecord = Record<string, unknown>;

type ListableClient = ElasticsearchBulkClientLike & {
    list(index: 'argonaut_findings' | 'argonaut_threatintel' | 'argonaut_reachability' | 'argonaut_dependencies' | 'argonaut_artifacts'):
        Array<{ id: string; source: UnknownRecord }> | Promise<Array<{ id: string; source: UnknownRecord }>>;
};

export interface EnrichSummary {
    processed: number;
    warnings: string[];
    integrity: {
        brokenReachabilityRefsCount: number;
        brokenExplanationRefsCount: number;
        brokenDependencyBuildRefsCount: number;
        sampleBrokenIds: string[];
    };
}

export async function enrichFindingsContext(client: ListableClient): Promise<EnrichSummary> {
    const findings = (await resolveList(client.list('argonaut_findings'))).map((entry) => ({ ...entry.source }));
    const threats = (await resolveList(client.list('argonaut_threatintel'))).map((entry) => ({ ...entry.source }));
    const reachability = (await resolveList(client.list('argonaut_reachability'))).map((entry) => ({ ...entry.source }));

    const threatByCve = new Map<string, UnknownRecord>();
    for (const threat of threats) {
        const cve = normalizeCve(threat.cve);
        if (cve) {
            threatByCve.set(cve, threat);
        }
    }

    const warnings: string[] = [];
    const reachabilityByFinding = new Map<string, UnknownRecord>();

    for (const item of reachability) {
        const findingId = normalizeString(item.findingId);
        const analysisVersion = normalizeString(item.analysisVersion);

        if (!findingId || analysisVersion !== '1.0') {
            continue;
        }

        const prior = reachabilityByFinding.get(findingId);
        if (!prior) {
            reachabilityByFinding.set(findingId, item);
            continue;
        }

        const priorId = normalizeString(prior.reachabilityId) ?? 'zzzz';
        const nextId = normalizeString(item.reachabilityId) ?? 'zzzz';

        if (nextId.localeCompare(priorId) < 0) {
            reachabilityByFinding.set(findingId, item);
        }

        warnings.push(`Duplicate reachability candidates for ${findingId}; selected lexicographic winner.`);
    }

    const updatedFindings = findings.map((finding) => {
        const cve = normalizeCve(finding.cve);
        const threat = cve ? threatByCve.get(cve) : null;

        const findingId = normalizeString(finding.findingId);
        const reach = findingId ? reachabilityByFinding.get(findingId) ?? null : null;

        const context = {
            threat: {
                kev: normalizeBoolean(threat?.kev ?? threat?.kevFlag) ?? false,
                epss: normalizeScore(threat?.epssScore ?? threat?.epss),
                cve: cve ?? null,
                source: 'seed',
            },
            reachability: reach
                ? {
                    reachable: normalizeBoolean(reach.reachable),
                    confidenceScore: normalizeScore(reach.confidenceScore),
                    method: normalizeString(reach.method),
                    status: normalizeString(reach.status),
                    reason: normalizeString(reach.reason),
                    evidencePath: normalizeStringArray(reach.evidencePath),
                    analysisVersion: normalizeString(reach.analysisVersion),
                }
                : {
                    reachable: null,
                    confidenceScore: null,
                    method: null,
                    status: 'INSUFFICIENT_DATA',
                    reason: null,
                    evidencePath: [],
                    analysisVersion: '1.0',
                },
        };

        return {
            ...finding,
            context,
        } satisfies UnknownRecord;
    });

    const writeReport = await writeFindings(client, updatedFindings);
    if (writeReport.failed > 0) {
        throw new Error(`Enrich write failed: ${writeReport.failures.map((failure) => failure.message).join('; ')}`);
    }

    const integrity = await runReferentialIntegrityChecks(client);

    return {
        processed: updatedFindings.length,
        warnings: Array.from(new Set(warnings)).sort((left, right) => left.localeCompare(right)),
        integrity,
    };
}

async function runReferentialIntegrityChecks(client: ListableClient): Promise<{
    brokenReachabilityRefsCount: number;
    brokenExplanationRefsCount: number;
    brokenDependencyBuildRefsCount: number;
    sampleBrokenIds: string[];
}> {
    const findings = (await resolveList(client.list('argonaut_findings'))).map((entry) => entry.source);
    const reachability = (await resolveList(client.list('argonaut_reachability'))).map((entry) => entry.source);
    const dependencies = (await resolveList(client.list('argonaut_dependencies'))).map((entry) => entry.source);
    const artifacts = (await resolveList(client.list('argonaut_artifacts'))).map((entry) => entry.source);

    const findingIds = new Set(
        findings
            .map((finding) => normalizeString(finding.findingId))
            .filter((value): value is string => value !== null),
    );

    const artifactBuildRefs = new Set(
        artifacts
            .map((artifact) => {
                const repo = normalizeString(artifact.repo);
                const buildId = normalizeString(artifact.buildId);
                if (!repo || !buildId) {
                    return null;
                }

                return `${repo}:${buildId}`;
            })
            .filter((value): value is string => value !== null),
    );

    const brokenReachability: string[] = [];
    for (const item of reachability) {
        const findingId = normalizeString(item.findingId);
        if (findingId && !findingIds.has(findingId)) {
            brokenReachability.push(findingId);
        }
    }

    const brokenExplanation: string[] = [];
    for (const finding of findings) {
        const findingId = normalizeString(finding.findingId);
        const explanation = toRecord(finding.priorityExplanation);

        if (!findingId || !explanation) {
            continue;
        }

        const explanationFindingId = normalizeString(explanation.findingId);
        if (!explanationFindingId || explanationFindingId !== findingId || !findingIds.has(explanationFindingId)) {
            brokenExplanation.push(findingId);
        }
    }

    const brokenDependencyBuildRefs: string[] = [];
    for (const edge of dependencies) {
        const repo = normalizeString(edge.repo);
        const buildId = normalizeString(edge.buildId);
        const dependencyId = normalizeString(edge.dependencyId) ?? 'unknown-dependency';

        if (!repo || !buildId) {
            brokenDependencyBuildRefs.push(dependencyId);
            continue;
        }

        if (!artifactBuildRefs.has(`${repo}:${buildId}`)) {
            brokenDependencyBuildRefs.push(dependencyId);
        }
    }

    const sampleBrokenIds = [...brokenReachability, ...brokenExplanation, ...brokenDependencyBuildRefs]
        .sort((left, right) => left.localeCompare(right))
        .slice(0, 20);

    return {
        brokenReachabilityRefsCount: brokenReachability.length,
        brokenExplanationRefsCount: brokenExplanation.length,
        brokenDependencyBuildRefsCount: brokenDependencyBuildRefs.length,
        sampleBrokenIds,
    };
}

async function resolveList(
    value: Array<{ id: string; source: UnknownRecord }> | Promise<Array<{ id: string; source: UnknownRecord }>>,
): Promise<Array<{ id: string; source: UnknownRecord }>> {
    return Promise.resolve(value);
}

function normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((entry) => normalizeString(entry))
        .filter((entry): entry is string => entry !== null);
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

function toRecord(value: unknown): UnknownRecord | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }

    return value as UnknownRecord;
}
