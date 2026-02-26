import { ARGONAUT_INDEX_NAMES, ARGONAUT_MAPPING_VERSION, ArgonautIndexName, IndexContract, MappingDynamic, MappingField } from './types';

type ContractMap = Record<ArgonautIndexName, IndexContract>;

const keyword = (): MappingField => ({ type: 'keyword' });
const text = (): MappingField => ({ type: 'text' });
const bool = (): MappingField => ({ type: 'boolean' });
const float = (): MappingField => ({ type: 'float' });
const integer = (): MappingField => ({ type: 'integer' });
const date = (): MappingField => ({ type: 'date' });
const objectDisabled = (): MappingField => ({ type: 'object', enabled: false });
const flattened = (): MappingField => ({ type: 'flattened' });

const textWithKeyword = (ignoreAbove = 8192): MappingField => ({
    type: 'text',
    fields: {
        keyword: {
            ...keyword(),
            ignore_above: ignoreAbove,
        },
    },
});

function baseContract(
    index: ArgonautIndexName,
    dynamic: MappingDynamic,
    properties: Record<string, MappingField>,
    options: { ignore_malformed?: boolean } = {},
): IndexContract {
    return {
        index,
        settings: {
            index: {
                number_of_shards: '1',
                number_of_replicas: '0',
                ...(options.ignore_malformed !== undefined ? {
                    mapping: {
                        ignore_malformed: options.ignore_malformed
                    }
                } : {})
            },
        },
        mappings: {
            dynamic,
            date_detection: false,
            _meta: {
                argonaut_mapping_version: ARGONAUT_MAPPING_VERSION,
            },
            properties,
        },
    };
}

const contracts: ContractMap = {
    argonaut_artifacts: baseContract('argonaut_artifacts', false, {
        artifactId: keyword(),
        runId: keyword(),
        repo: keyword(),
        buildId: keyword(),
        type: keyword(),
        sourceTool: keyword(),
        filename: keyword(),
        checksum: keyword(),
        ingestStatus: keyword(),
        timestamp: date(),
    }),

    argonaut_findings: baseContract('argonaut_findings', 'strict', {
        findingId: keyword(),
        runId: keyword(),
        repo: keyword(),
        buildId: keyword(),
        ruleId: keyword(),
        cve: keyword(),
        cves: keyword(),
        severity: keyword(),
        title: keyword(),
        description: keyword(),
        filePath: keyword(),
        lineNumber: integer(),
        file: keyword(),
        line: integer(),
        package: keyword(),
        version: keyword(),
        fingerprint: keyword(),
        tool: keyword(),
        createdAt: date(),
        updatedAt: date(),
        priorityScore: float(),
        priorityScoreBase: float(),
        context: {
            type: 'object',
            dynamic: 'strict',
            properties: {
                threat: {
                    type: 'object',
                    dynamic: 'strict',
                    properties: {
                        kev: bool(),
                        epss: float(),
                        cve: keyword(),
                        source: keyword(),
                    },
                },
                reachability: {
                    type: 'object',
                    dynamic: 'strict',
                    properties: {
                        reachable: bool(),
                        confidenceScore: float(),
                        method: keyword(),
                        status: keyword(),
                        reason: keyword(),
                        evidencePath: keyword(),
                        analysisVersion: keyword(),
                        signal: keyword(),
                    },
                },
            },
        },
        priorityExplanation: {
            type: 'object',
            dynamic: 'strict',
            properties: {
                explanationId: keyword(),
                findingId: keyword(),
                repo: keyword(),
                buildId: keyword(),
                summary: textWithKeyword(),
                factors: {
                    type: 'object',
                    dynamic: 'strict',
                    properties: {
                        kev: bool(),
                        epss: float(),
                        reachable: bool(),
                        internetExposed: bool(),
                        confidenceScore: float(),
                        blastRadius: integer(),
                    },
                },
                scoreBreakdown: {
                    type: 'object',
                    dynamic: 'strict',
                    properties: {
                        exploitWeight: float(),
                        reachabilityWeight: float(),
                        exposureWeight: float(),
                        totalScore: float(),
                    },
                },
                reasonCodes: keyword(),
                explanationVersion: keyword(),
                createdAt: date(),
            },
        },
        triage: {
            type: 'object',
            dynamic: 'strict',
            properties: {
                status: keyword(),
                note: {
                    type: 'text',
                    fields: {
                        keyword: {
                            type: 'keyword',
                            ignore_above: 500
                        }
                    }
                },
                updatedAt: date(),
            }
        }
    }),

    argonaut_dependencies: baseContract('argonaut_dependencies', 'strict', {
        dependencyId: keyword(),
        runId: keyword(),
        repo: keyword(),
        buildId: keyword(),
        parent: keyword(),
        child: keyword(),
        version: keyword(),
        scope: keyword(),
        runtimeFlag: bool(),
        sourceFile: keyword(),
        createdAt: date(),
        depth: integer(),
        edgeId: keyword(),
    }),

    argonaut_sbom: baseContract('argonaut_sbom', 'strict', {
        componentId: keyword(),
        runId: keyword(),
        repo: keyword(),
        buildId: keyword(),
        component: keyword(),
        version: keyword(),
        license: keyword(),
        supplier: keyword(),
        hash: keyword(),
        purl: keyword(),
        bomRef: keyword(),
        bomFormatVersion: keyword(),
        ecosystem: keyword(),
        sourceFile: keyword(),
        createdAt: date(),
    }),

    argonaut_reachability: baseContract('argonaut_reachability', 'strict', {
        reachabilityId: keyword(),
        findingId: keyword(),
        runId: keyword(),
        repo: keyword(),
        buildId: keyword(),
        reachable: bool(),
        confidenceScore: float(),
        confidence: float(),
        evidencePath: keyword(),
        method: keyword(),
        status: keyword(),
        reason: keyword(),
        analysisVersion: keyword(),
        computedAt: date(),
    }),

    argonaut_threatintel: baseContract('argonaut_threatintel', 'strict', {
        intelId: keyword(),
        cve: keyword(),
        kev: bool(),
        kevFlag: bool(),
        epss: float(),
        epssScore: float(),
        exploitInWild: bool(),
        publishedAt: date(),
        publishedDate: date(),
        lastSeenAt: date(),
        sourceRefs: keyword(),
    }),

    argonaut_actions: baseContract('argonaut_actions', false, {
        actionId: keyword(),
        runId: keyword(),
        findingId: keyword(),
        findingIds: keyword(),
        actionType: keyword(),
        status: keyword(),
        jiraKey: keyword(),
        slackThread: keyword(),
        idempotencyKey: keyword(),
        payloadHash: keyword(),
        repo: keyword(),
        buildId: keyword(),
        templateVersion: keyword(),
        targetSystem: keyword(),
        targetKey: keyword(),
        payloadType: keyword(),
        source: keyword(),
        topNHash: keyword(),
        attempt: integer(),
        payload: objectDisabled(),
        error: keyword(),
        createdAt: date(),
        updatedAt: date(),
    }),

    argonaut_runs: baseContract('argonaut_runs', 'strict', {
        runId: keyword(),
        status: keyword(),
        repo: keyword(),
        applicationId: keyword(),
        buildId: keyword(),
        bundleId: keyword(),
        executionMode: keyword(),
        pipelineVersion: keyword(),
        startedAt: date(),
        createdAt: date(),
        updatedAt: date(),
        endedAt: date(),
        completedAt: date(),
        errorSummary: text(),
        stageSummary: {
            type: 'object',
            dynamic: 'true',
        },
    }),

    argonaut_tasklogs: baseContract('argonaut_tasklogs', false, {
        taskId: keyword(),
        runId: keyword(),
        bundleId: keyword(),
        stage: keyword(),
        status: keyword(),
        level: keyword(),
        taskType: keyword(),
        taskKey: keyword(),
        message: text(),
        timestamp: date(),
        error: {
            type: 'object',
            properties: {
                code: keyword(),
                message: textWithKeyword(8192),
                stack: text(),
                type: keyword(),
            },
        },
        params: flattened(),
        meta: flattened(),
        createdAt: date(),
    }, { ignore_malformed: true }),

    argonaut_run_stages: baseContract('argonaut_run_stages', false, {
        runId: keyword(),
        stage: keyword(),
        status: keyword(),
        mode: keyword(),
        requestedCount: integer(),
        startedAt: date(),
        endedAt: date(),
        requestId: keyword(),
        stageIdempotencyKey: keyword(),
    }),

    argonaut_graph_views: baseContract('argonaut_graph_views', 'strict', {
        runId: keyword(),
        bundleId: keyword(),
        repo: keyword(),
        createdAt: date(),
        graphVersion: keyword(),
        nodes: objectDisabled(),
        edges: objectDisabled(),
        stats: objectDisabled(),
    }),

    argonaut_bundle_registry: baseContract('argonaut_bundle_registry', false, {
        bundleId: keyword(),
        applicationId: keyword(),
        repo: keyword(),
        buildId: keyword(),
        createdAt: date(),
        status: keyword(),
        lastRunId: keyword(),
        activeRunId: keyword(),
        artifactCounts: objectDisabled(),
        manifestVersion: keyword(),
        manifestObjectKey: keyword(),
        bundleHash: keyword(),
        artifactCount: integer(),
        artifactTypes: keyword(),
        totalBytes: integer(),
        objectStore: objectDisabled(),
        processingLock: objectDisabled(),
        processedAt: date(),
    }),
};

export function getIndexContract(index: ArgonautIndexName): IndexContract {
    return structuredClone(contracts[index]);
}

export function getAllIndexContracts(): ContractMap {
    return ARGONAUT_INDEX_NAMES.reduce<ContractMap>((acc, index) => {
        acc[index] = getIndexContract(index);
        return acc;
    }, {} as ContractMap);
}

export { contracts as indexContracts };
