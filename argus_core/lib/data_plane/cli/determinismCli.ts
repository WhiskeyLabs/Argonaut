import { runDeterminismHarness } from '../harness/determinismHarness';
import { stableStringify } from './argonautCli';

type CliArgs = {
    repo: string;
    buildId: string;
    bundle: string;
    topN: number;
    failFast: boolean;
};

export async function runDeterminismCli(argv: string[]): Promise<{ output: string; exitCode: number }> {
    const args = parseArgs(argv);

    const report = await runDeterminismHarness({
        repo: args.repo,
        buildId: args.buildId,
        bundlePath: args.bundle,
        topN: args.topN,
        failFast: args.failFast,
    });

    return {
        output: stableStringify(report, 2),
        exitCode: report.passed ? 0 : 1,
    };
}

function parseArgs(argv: string[]): CliArgs {
    const flags = new Map<string, string | boolean>();

    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i];
        if (!token.startsWith('--')) {
            continue;
        }

        const name = token.slice(2);
        if (name === 'fail-fast') {
            flags.set(name, true);
            continue;
        }

        const value = argv[i + 1];
        if (!value || value.startsWith('--')) {
            throw new Error(`Missing value for --${name}`);
        }

        flags.set(name, value);
        i += 1;
    }

    const topN = Number(flags.get('top-n') ?? '10');
    if (!Number.isInteger(topN) || topN <= 0) {
        throw new Error('--top-n must be a positive integer.');
    }

    return {
        repo: requiredFlag(flags, 'repo'),
        buildId: requiredFlag(flags, 'build-id'),
        bundle: requiredFlag(flags, 'bundle'),
        topN,
        failFast: flags.get('fail-fast') === true,
    };
}

function requiredFlag(flags: Map<string, string | boolean>, name: string): string {
    const value = flags.get(name);
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`Missing required flag --${name}`);
    }

    return value.trim();
}
