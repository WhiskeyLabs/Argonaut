import { join } from 'node:path';

import { runArgonautCli } from '../../lib/data_plane/cli';

describe('argonaut CLI wrapper', () => {
    it('returns deterministic default JSON output', async () => {
        const bundle = join(process.cwd(), 'demo-data/bundles/payment-service_build-128');
        const args = ['--repo', 'payment-service', '--build-id', '128', '--bundle', bundle, '--dry-run'];

        const first = await runArgonautCli(args);
        const second = await runArgonautCli(args);

        expect(first.summary.stageResults).toEqual(second.summary.stageResults);
        expect(first.output).toBe(second.output);
    });
});
