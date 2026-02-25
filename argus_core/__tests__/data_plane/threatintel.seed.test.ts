import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { writeFindings } from '../../lib/data_plane/writers';
import {
    DEFAULT_THREAT_INTEL_SEED,
    normalizeThreatIntelSeed,
    seedThreatIntel,
    validateThreatIntelJoin,
} from '../../lib/data_plane/threatintel';
import { InMemoryDataPlaneClient } from '../../lib/data_plane/testing';

describe('threat intel seed loader', () => {
    it('normalizes seed docs with deterministic CVE ids', () => {
        const docs = normalizeThreatIntelSeed(DEFAULT_THREAT_INTEL_SEED, 1700000000000);

        expect(docs).toHaveLength(6);
        expect(docs.every((doc) => doc.intelId === doc.cve)).toBe(true);
        expect(docs.every((doc) => doc.cve === doc.cve.toUpperCase())).toBe(true);
    });

    it('rejects invalid CVE and invalid EPSS values', () => {
        expect(() => normalizeThreatIntelSeed([
            { cve: 'BAD-2024-1', kev: true, epss: 0.5 },
        ])).toThrow(/Invalid CVE format/);

        expect(() => normalizeThreatIntelSeed([
            { cve: 'CVE-2024-1000', kev: true, epss: 2 },
        ])).toThrow(/Invalid EPSS value/);
    });

    it('reseeding converges without duplicates', async () => {
        const client = new InMemoryDataPlaneClient();

        await seedThreatIntel(client, DEFAULT_THREAT_INTEL_SEED, 1700000000000);
        await seedThreatIntel(client, DEFAULT_THREAT_INTEL_SEED, 1700000000000);

        expect(client.count('argonaut_threatintel')).toBe(DEFAULT_THREAT_INTEL_SEED.length);
    });

    it('passes join sanity for known and unknown CVE findings', async () => {
        const client = new InMemoryDataPlaneClient();
        await seedThreatIntel(client, DEFAULT_THREAT_INTEL_SEED, 1700000000000);

        const findingsPath = join(
            process.cwd(),
            '../program_management/epics/epic_1_argus_core_extraction_stabilization/tasks/artifacts/task_1_1/normalized_findings.sample.json',
        );

        const findings = JSON.parse(readFileSync(findingsPath, 'utf8')) as Array<Record<string, unknown>>;
        const findingsReport = await writeFindings(client, findings);
        expect(findingsReport.failed).toBe(0);

        const joined = validateThreatIntelJoin(
            client.list('argonaut_findings').map((doc) => doc.source),
            client.list('argonaut_threatintel').map((doc) => doc.source as never),
        );

        expect(joined.knownMatches).toBeGreaterThan(0);
        expect(joined.unknownMatches).toBeGreaterThan(0);
    });
});
