import { getAllIndexContracts } from './contracts';
import { ARGONAUT_INDEX_NAMES, ARGONAUT_MAPPING_VERSION, ArgonautIndexName, BootstrapReport, ElasticsearchClientLike, IndexContract } from './types';

type UnknownRecord = Record<string, unknown>;

export class MappingBootstrapError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MappingBootstrapError';
    }
}

export async function bootstrapMappings(client: ElasticsearchClientLike): Promise<BootstrapReport> {
    const contracts = getAllIndexContracts();
    const results: BootstrapReport['results'] = [];

    for (const index of ARGONAUT_INDEX_NAMES) {
        const contract = contracts[index];
        const exists = await indexExists(client, index);

        if (!exists) {
            await client.indices.create({
                index,
                settings: contract.settings,
                mappings: contract.mappings,
            });

            results.push({
                index,
                action: 'created',
                message: 'Index created with expected mapping contract.',
            });
            continue;
        }

        const actual = await client.indices.getMapping({ index });

        const actualMapping = normalizeMappingResponse(index, actual);
        assertMappingCompatible(index, contract, actualMapping);

        results.push({
            index,
            action: 'validated',
            message: 'Existing mapping validated successfully.',
        });
    }

    return {
        mappingVersion: ARGONAUT_MAPPING_VERSION,
        results,
    };
}

async function indexExists(client: ElasticsearchClientLike, index: ArgonautIndexName): Promise<boolean> {
    const exists = await client.indices.exists({ index });

    if (typeof exists === 'boolean') {
        return exists;
    }

    if (isRecord(exists) && typeof exists.body === 'boolean') {
        return exists.body;
    }

    throw new MappingBootstrapError(`indices.exists returned unexpected payload for ${index}.`);
}

function normalizeMappingResponse(index: ArgonautIndexName, response: unknown): IndexContract['mappings'] {
    if (!isRecord(response)) {
        throw new MappingBootstrapError(`indices.getMapping returned invalid response for ${index}.`);
    }

    const entry = response[index];

    if (!isRecord(entry)) {
        throw new MappingBootstrapError(`indices.getMapping missing index entry for ${index}.`);
    }

    const mappings = entry.mappings;
    if (!isRecord(mappings)) {
        throw new MappingBootstrapError(`indices.getMapping missing mappings for ${index}.`);
    }

    if (!isRecord(mappings._meta) || mappings._meta.argonaut_mapping_version !== ARGONAUT_MAPPING_VERSION) {
        throw new MappingBootstrapError(`Mapping version mismatch for ${index}. Expected ${ARGONAUT_MAPPING_VERSION}.`);
    }

    return mappings as IndexContract['mappings'];
}

function assertMappingCompatible(
    index: ArgonautIndexName,
    expected: IndexContract,
    actualMappings: IndexContract['mappings'],
): void {
    const expectedCanonical = stableStringify(expected.mappings);
    const actualCanonical = stableStringify(actualMappings);

    if (expectedCanonical !== actualCanonical) {
        throw new MappingBootstrapError(
            `Mapping drift detected for ${index}. Existing mappings do not match frozen contract snapshot.`,
        );
    }
}

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

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
