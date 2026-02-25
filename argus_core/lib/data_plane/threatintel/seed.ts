import { readFileSync } from 'node:fs';

import { writeThreatIntel } from '../writers';
import type { ElasticsearchBulkClientLike } from '../writers';
import type { ThreatIntelDoc, ThreatIntelSeedInput, ThreatIntelSeedReport } from './types';

const CVE_PATTERN = /^CVE-\d{4}-\d{4,}$/;

export const DEFAULT_THREAT_INTEL_SEED: ThreatIntelSeedInput[] = [
    { cve: 'CVE-2024-1111', kev: true, epss: 0.91, source: 'seed' },
    { cve: 'CVE-2024-2222', kev: false, epss: 0.77, source: 'seed' },
    { cve: 'CVE-2023-9999', kev: true, epss: null, source: 'seed' },
    { cve: 'CVE-2022-0101', kev: false, epss: 0.08, source: 'seed' },
    { cve: 'CVE-2021-1111', kev: false, epss: 0.54, source: 'seed' },
    { cve: 'CVE-2020-5555', kev: true, epss: 0.12, source: 'seed' },
];

export function normalizeCve(value: string): string {
    const normalized = value.trim().toUpperCase();
    if (!CVE_PATTERN.test(normalized)) {
        throw new Error(`Invalid CVE format: ${value}`);
    }

    return normalized;
}

export function normalizeThreatIntelSeed(seed: ThreatIntelSeedInput[], now = Date.now()): ThreatIntelDoc[] {
    return seed.map((entry) => {
        if (typeof entry.kev !== 'boolean') {
            throw new Error(`Invalid KEV value for ${entry.cve}`);
        }

        if (!(entry.epss === null || (Number.isFinite(entry.epss) && entry.epss >= 0 && entry.epss <= 1))) {
            throw new Error(`Invalid EPSS value for ${entry.cve}`);
        }

        const cve = normalizeCve(entry.cve);

        return {
            intelId: cve,
            cve,
            kev: entry.kev,
            kevFlag: entry.kev,
            epss: entry.epss,
            epssScore: entry.epss,
            exploitInWild: entry.kev,
            publishedAt: null,
            publishedDate: null,
            lastSeenAt: now,
            sourceRefs: ['seed'],
        } satisfies ThreatIntelDoc;
    });
}

export async function seedThreatIntel(
    client: ElasticsearchBulkClientLike,
    seed: ThreatIntelSeedInput[],
    now = Date.now(),
): Promise<ThreatIntelSeedReport> {
    const docs = normalizeThreatIntelSeed(seed, now);
    const report = await writeThreatIntel(client, docs);

    if (report.failed > 0) {
        const messages = report.failures.map((failure) => failure.message).join('; ');
        throw new Error(`Threat intel seed failed: ${messages}`);
    }

    return {
        count: docs.length,
        ids: docs.map((doc) => doc.cve).sort((left, right) => left.localeCompare(right)),
    };
}

export function loadThreatIntelSeedFile(path: string): ThreatIntelSeedInput[] {
    const content = readFileSync(path, 'utf8');
    const parsed = JSON.parse(content) as unknown;

    if (!Array.isArray(parsed)) {
        throw new Error('Threat intel seed file must contain an array.');
    }

    return parsed as ThreatIntelSeedInput[];
}

export function validateThreatIntelJoin(findings: Array<Record<string, unknown>>, threatDocs: ThreatIntelDoc[]): {
    knownMatches: number;
    unknownMatches: number;
} {
    const byCve = new Map(threatDocs.map((doc) => [doc.cve, doc]));

    let knownMatches = 0;
    let unknownMatches = 0;

    for (const finding of findings) {
        const cve = typeof finding.cve === 'string' ? normalizeCveSafe(finding.cve) : null;
        if (!cve) {
            unknownMatches += 1;
            continue;
        }

        if (byCve.has(cve)) {
            knownMatches += 1;
        } else {
            unknownMatches += 1;
        }
    }

    return {
        knownMatches,
        unknownMatches,
    };
}

function normalizeCveSafe(value: string): string | null {
    try {
        return normalizeCve(value);
    } catch {
        return null;
    }
}
