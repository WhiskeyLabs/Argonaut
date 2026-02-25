import { bootstrapMappings, getAllIndexContracts, MappingBootstrapError } from '../../lib/data_plane/mappings';

type ExistsResponse = boolean | { body?: boolean };

describe('bootstrapMappings', () => {
    it('creates all missing indices using frozen contracts', async () => {
        const contracts = getAllIndexContracts();
        const created: string[] = [];

        const client = {
            indices: {
                exists: async () => false as ExistsResponse,
                create: async ({ index }: { index: string }) => {
                    created.push(index);
                    return {};
                },
                getMapping: async () => ({}),
            },
        };

        const report = await bootstrapMappings(client);

        expect(created.sort()).toEqual(Object.keys(contracts).sort());
        expect(report.results.every((result) => result.action === 'created')).toBe(true);
    });

    it('validates existing compatible mappings without mutation', async () => {
        const contracts = getAllIndexContracts();

        const client = {
            indices: {
                exists: async () => ({ body: true }) as ExistsResponse,
                create: async () => {
                    throw new Error('create should not be called when all indices exist');
                },
                getMapping: async ({ index }: { index: string }) => ({
                    [index]: {
                        mappings: contracts[index as keyof typeof contracts].mappings,
                    },
                }),
            },
        };

        const report = await bootstrapMappings(client);
        expect(report.results.every((result) => result.action === 'validated')).toBe(true);
    });

    it('fails fast on mapping version mismatch', async () => {
        const contracts = getAllIndexContracts();

        const client = {
            indices: {
                exists: async () => true as ExistsResponse,
                create: async () => ({}),
                getMapping: async ({ index }: { index: string }) => ({
                    [index]: {
                        mappings: {
                            ...contracts[index as keyof typeof contracts].mappings,
                            _meta: {
                                argonaut_mapping_version: '9.9',
                            },
                        },
                    },
                }),
            },
        };

        await expect(bootstrapMappings(client)).rejects.toBeInstanceOf(MappingBootstrapError);
    });

    it('fails fast on mapping drift and does not auto-mutate', async () => {
        const contracts = getAllIndexContracts();
        let createCalls = 0;

        const client = {
            indices: {
                exists: async () => ({ body: true }) as ExistsResponse,
                create: async () => {
                    createCalls += 1;
                    return {};
                },
                getMapping: async ({ index }: { index: string }) => ({
                    [index]: {
                        mappings: index === 'argonaut_dependencies'
                            ? {
                                ...contracts.argonaut_dependencies.mappings,
                                properties: {
                                    ...contracts.argonaut_dependencies.mappings.properties,
                                    scope: { type: 'text' },
                                },
                            }
                            : contracts[index as keyof typeof contracts].mappings,
                    },
                }),
            },
        };

        await expect(bootstrapMappings(client)).rejects.toBeInstanceOf(MappingBootstrapError);
        expect(createCalls).toBe(0);
    });
});
