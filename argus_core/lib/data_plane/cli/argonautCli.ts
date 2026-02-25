import type { AcquireOptions, AcquireSummary } from '../pipeline/types';
import { runAcquirePipeline } from '../pipeline/acquire';
import { InMemoryDataPlaneClient } from '../testing/inMemoryClient';

type CliArgs = {
    repo: string;
    buildId: string;
    bundle: string;
    dryRun: boolean;
    verbose: boolean;
};

export async function runArgonautCli(argv: string[]): Promise<{ summary: AcquireSummary; output: string }> {
    const args = parseArgs(argv);
    const client = new InMemoryDataPlaneClient();

    const options: AcquireOptions = {
        repo: args.repo,
        buildId: args.buildId,
        bundlePath: args.bundle,
        dryRun: args.dryRun,
        verbose: args.verbose,
    };

    const summary = await runAcquirePipeline(client, options);
    const output = stableStringify(summary, 2);

    return {
        summary,
        output,
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
        if (name === 'dry-run' || name === 'verbose') {
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

    const repo = requiredFlag(flags, 'repo');
    const buildId = requiredFlag(flags, 'build-id');
    const bundle = requiredFlag(flags, 'bundle');

    return {
        repo,
        buildId,
        bundle,
        dryRun: flags.get('dry-run') === true,
        verbose: flags.get('verbose') === true,
    };
}

function requiredFlag(flags: Map<string, string | boolean>, name: string): string {
    const value = flags.get(name);
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`Missing required flag --${name}`);
    }

    return value.trim();
}

export function stableStringify(value: unknown, spaces = 0): string {
    return JSON.stringify(value, (_key, nested) => {
        if (Array.isArray(nested)) {
            return nested;
        }

        if (nested && typeof nested === 'object') {
            return Object.keys(nested as Record<string, unknown>)
                .sort((left, right) => left.localeCompare(right))
                .reduce<Record<string, unknown>>((acc, key) => {
                    acc[key] = (nested as Record<string, unknown>)[key];
                    return acc;
                }, {});
        }

        return nested;
    }, spaces);
}
