import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { generateFindingId } from '../../lib/identity';
import { writeFindings, writeReachability } from '../../lib/data_plane/writers';
import { seedThreatIntel } from '../../lib/data_plane/threatintel';
import { scoreAndWriteback } from '../../lib/data_plane/scoring';
import { InMemoryDataPlaneClient } from '../../lib/data_plane/testing';

describe('score and writeback', () => {
    it('produces deterministic ranking and writes score+explanation atomically', async () => {
        const client = new InMemoryDataPlaneClient();

        const findingsPath = join(
            process.cwd(),
            '../program_management/epics/epic_1_argus_core_extraction_stabilization/tasks/artifacts/task_1_1/normalized_findings.sample.json',
        );
        const reachabilityPath = join(
            process.cwd(),
            '../program_management/epics/epic_1_argus_core_extraction_stabilization/tasks/artifacts/task_1_4/reachability_result.sample.json',
        );

        const findings = JSON.parse(readFileSync(findingsPath, 'utf8')) as Array<Record<string, unknown>>;
        const reachability = JSON.parse(readFileSync(reachabilityPath, 'utf8')) as Record<string, unknown>;

        const findingsReport = await writeFindings(client, findings);
        expect(findingsReport.failed).toBe(0);

        const reachabilityDocs = findings.map((finding) => ({
            ...reachability,
            reachabilityId: `${reachability.reachabilityId}-${finding.findingId}`,
            findingId: finding.findingId,
        }));

        const reachabilityReport = await writeReachability(client, reachabilityDocs);
        expect(reachabilityReport.failed).toBe(0);

        await seedThreatIntel(client, [
            { cve: 'CVE-2024-1111', kev: true, epss: 0.91, source: 'seed' },
            { cve: 'CVE-2021-1111', kev: false, epss: 0.22, source: 'seed' },
        ]);

        const runOne = await scoreAndWriteback(client, 10);
        const runTwo = await scoreAndWriteback(client, 10);

        expect(runOne.topN).toEqual(runTwo.topN);

        const rankedIds = runOne.topN.map((row) => row.findingId);
        expect(rankedIds[0]).toBe('4f577db6e74e9804599484542cb1f0ee78d7f5d52b542a011584678cc7aabb79');

        for (const finding of client.list('argonaut_findings')) {
            expect(typeof finding.source.priorityScore).toBe('number');
            expect(finding.source.priorityExplanation).toBeTruthy();
            expect((finding.source.priorityExplanation as Record<string, unknown>).totalScore).toBeUndefined();
        }
    });

    it('applies deterministic tie-break for equal scores by findingId', async () => {
        const client = new InMemoryDataPlaneClient();

        const base = {
            repo: 'payment-service',
            buildId: '128',
            ruleId: 'RULE',
            severity: 'LOW',
            cve: null,
            cves: [],
            package: null,
            version: null,
            filePath: 'src/a.ts',
            lineNumber: 1,
            tool: 'semgrep',
            fingerprint: 'f',
            createdAt: 1700000000000,
        };

        const docs = [
            {
                ...base,
                fingerprint: 'b-f',
                findingId: generateFindingId({ repo: base.repo, buildId: base.buildId, fingerprint: 'b-f' }),
            },
            {
                ...base,
                fingerprint: 'a-f',
                findingId: generateFindingId({ repo: base.repo, buildId: base.buildId, fingerprint: 'a-f' }),
            },
        ];

        const report = await writeFindings(client, docs);
        expect(report.failed).toBe(0);

        const scored = await scoreAndWriteback(client, 10);
        const expected = [
            generateFindingId({ repo: base.repo, buildId: base.buildId, fingerprint: 'a-f' }),
            generateFindingId({ repo: base.repo, buildId: base.buildId, fingerprint: 'b-f' }),
        ].sort((left, right) => left.localeCompare(right));

        expect(scored.topN.map((row) => row.findingId)).toEqual(expected);
    });
});
