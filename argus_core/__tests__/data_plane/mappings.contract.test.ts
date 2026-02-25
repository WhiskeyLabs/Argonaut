import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ARGONAUT_INDEX_NAMES, ARGONAUT_MAPPING_VERSION, getAllIndexContracts } from '../../lib/data_plane/mappings';

type UnknownRecord = Record<string, unknown>;

function stableStringify(value: unknown): string {
    return JSON.stringify(value, (_key, nested) => {
        if (Array.isArray(nested)) {
            return nested;
        }

        if (nested && typeof nested === 'object') {
            return Object.keys(nested as UnknownRecord)
                .sort((left, right) => left.localeCompare(right))
                .reduce<UnknownRecord>((acc, key) => {
                    acc[key] = (nested as UnknownRecord)[key];
                    return acc;
                }, {});
        }

        return nested;
    });
}

describe('EPIC 2 mapping contracts', () => {
    it('match versioned JSON snapshot files exactly', () => {
        const contracts = getAllIndexContracts();

        for (const index of ARGONAUT_INDEX_NAMES) {
            const snapshotPath = join(process.cwd(), 'lib/data_plane/mappings/snapshots', `${index}.json`);
            const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));

            expect(stableStringify(contracts[index])).toBe(stableStringify(snapshot));
        }
    });

    it('enforces strict-vs-dynamic policies and mapping version tags', () => {
        const contracts = getAllIndexContracts();

        expect(contracts.argonaut_findings.mappings.dynamic).toBe('strict');
        expect(contracts.argonaut_dependencies.mappings.dynamic).toBe('strict');
        expect(contracts.argonaut_sbom.mappings.dynamic).toBe('strict');
        expect(contracts.argonaut_reachability.mappings.dynamic).toBe('strict');
        expect(contracts.argonaut_threatintel.mappings.dynamic).toBe('strict');

        expect(contracts.argonaut_actions.mappings.dynamic).toBe(false);
        expect(contracts.argonaut_artifacts.mappings.dynamic).toBe(false);

        for (const index of ARGONAUT_INDEX_NAMES) {
            expect(contracts[index].mappings._meta.argonaut_mapping_version).toBe(ARGONAUT_MAPPING_VERSION);
        }
    });

    it('maps required ID fields and explanation.summary exactly as policy requires', () => {
        const contracts = getAllIndexContracts();

        expect(contracts.argonaut_findings.mappings.properties.findingId.type).toBe('keyword');
        expect(contracts.argonaut_dependencies.mappings.properties.dependencyId.type).toBe('keyword');
        expect(contracts.argonaut_reachability.mappings.properties.reachabilityId.type).toBe('keyword');

        const explanation = contracts.argonaut_findings.mappings.properties.priorityExplanation.properties!;
        expect(explanation.explanationId.type).toBe('keyword');
        expect(explanation.summary.type).toBe('text');
        expect(explanation.summary.fields?.keyword.type).toBe('keyword');
    });
});
