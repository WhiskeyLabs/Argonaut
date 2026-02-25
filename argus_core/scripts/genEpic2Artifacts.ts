import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { InMemoryDataPlaneClient } from '../lib/data_plane/testing/inMemoryClient';
import { runAcquirePipeline } from '../lib/data_plane/pipeline/acquire';
import { enrichFindingsContext } from '../lib/data_plane/pipeline/enrich';
import { scoreAndWriteback } from '../lib/data_plane/scoring/scoreAndWriteback';
import { runDeterminismHarness } from '../lib/data_plane/harness/determinismHarness';
import { DEFAULT_THREAT_INTEL_SEED } from '../lib/data_plane/threatintel/seed';

async function main(): Promise<void> {
    const root = process.cwd();
    const bundlePath = join(root, 'demo-data/bundles/payment-service_build-128');
    const out = join(root, '../program_management/epics/epic_2_elasticsearch_data_plane/tasks/artifacts');

    const client = new InMemoryDataPlaneClient();

    const acquire = await runAcquirePipeline(client, {
        repo: 'payment-service',
        buildId: '128',
        bundlePath,
        verbose: true,
    });

    const enrich = await enrichFindingsContext(client);
    const score = await scoreAndWriteback(client, 10);

    const determinism = await runDeterminismHarness({
        repo: 'payment-service',
        buildId: '128',
        bundlePath,
        topN: 10,
    });

    writeFileSync(join(out, 'task_2_3/acquire_summary.sample.json'), `${JSON.stringify(acquire, null, 2)}\n`);
    writeFileSync(join(out, 'task_2_4/threat_intel_seed.sample.json'), `${JSON.stringify(DEFAULT_THREAT_INTEL_SEED, null, 2)}\n`);
    writeFileSync(join(out, 'task_2_5/ranked_findings.sample.json'), `${JSON.stringify(score.topN, null, 2)}\n`);
    writeFileSync(join(out, 'task_2_6/enrich_summary.sample.json'), `${JSON.stringify(enrich, null, 2)}\n`);
    writeFileSync(join(out, 'task_2_7/determinism_report.sample.json'), `${JSON.stringify(determinism, null, 2)}\n`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
