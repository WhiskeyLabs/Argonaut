const fs = require('node:fs');
const path = require('node:path');

const EPIC2_INDEXES = [
  'argonaut_artifacts',
  'argonaut_findings',
  'argonaut_dependencies',
  'argonaut_sbom',
  'argonaut_reachability',
  'argonaut_threatintel',
  'argonaut_actions',
  'argonaut_graph_views',
];

const EPIC6_RUNTIME_INDEXES = ['argonaut_runs', 'argonaut_tasklogs', 'argonaut_bundle_registry'];

const REQUIRED_EPIC6_INDICES = [...EPIC2_INDEXES, ...EPIC6_RUNTIME_INDEXES];
const REQUIRED_EPIC6_TEMPLATE_NAMES = REQUIRED_EPIC6_INDICES.map((index) => `${index}_template`);

function repositoryRoot() {
  return path.resolve(__dirname, '..', '..');
}

function normalizeBaseUrl(rawUrl) {
  return String(rawUrl).replace(/\/$/, '');
}

function resolveElasticsearchUrl() {
  return normalizeBaseUrl(process.env.ES_URL || process.env.ELASTIC_URL || 'http://localhost:9200');
}

function resolveKibanaUrl() {
  return normalizeBaseUrl(process.env.KIBANA_URL || 'http://localhost:5601');
}

function pickAuthHeaders(prefix) {
  if (prefix === 'es') {
    const apiKey = process.env.ES_API_KEY || process.env.ELASTIC_API_KEY;
    if (apiKey) {
      return { Authorization: `ApiKey ${apiKey}` };
    }

    const username = process.env.ES_USERNAME || process.env.ELASTIC_USERNAME;
    const password = process.env.ES_PASSWORD || process.env.ELASTIC_PASSWORD;
    if (username && password) {
      return {
        Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      };
    }
  }

  if (prefix === 'kibana') {
    const apiKey = process.env.KIBANA_API_KEY || process.env.ES_API_KEY || process.env.ELASTIC_API_KEY;
    if (apiKey) {
      return { Authorization: `ApiKey ${apiKey}` };
    }

    const username = process.env.KIBANA_USERNAME || process.env.ES_USERNAME || process.env.ELASTIC_USERNAME;
    const password = process.env.KIBANA_PASSWORD || process.env.ES_PASSWORD || process.env.ELASTIC_PASSWORD;
    if (username && password) {
      return {
        Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      };
    }
  }

  return {};
}

function stableSortObject(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => stableSortObject(entry));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const source = value;
  const result = {};
  for (const key of Object.keys(source).sort((left, right) => left.localeCompare(right))) {
    result[key] = stableSortObject(source[key]);
  }
  return result;
}

function stableStringify(value) {
  return JSON.stringify(stableSortObject(value));
}

async function requestJson(baseUrl, requestPath, options = {}) {
  const method = options.method || 'GET';
  const expectedStatuses = options.expectedStatuses || [200];
  const headers = {
    ...(options.headers || {}),
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
  };

  const response = await fetch(`${normalizeBaseUrl(baseUrl)}${requestPath}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let json = null;
  if (text.trim().length > 0) {
    try {
      json = JSON.parse(text);
    } catch (_error) {
      json = { raw: text };
    }
  }

  if (!expectedStatuses.includes(response.status)) {
    const suffix = json ? ` ${JSON.stringify(json)}` : '';
    throw new Error(`${method} ${requestPath} failed with ${response.status}.${suffix}`);
  }

  return {
    status: response.status,
    body: json,
    headers: response.headers,
  };
}

async function requestMultipart(baseUrl, requestPath, formData, options = {}) {
  const method = options.method || 'POST';
  const expectedStatuses = options.expectedStatuses || [200];

  const response = await fetch(`${normalizeBaseUrl(baseUrl)}${requestPath}`, {
    method,
    headers: options.headers || {},
    body: formData,
  });

  const text = await response.text();
  let json = null;
  if (text.trim().length > 0) {
    try {
      json = JSON.parse(text);
    } catch (_error) {
      json = { raw: text };
    }
  }

  if (!expectedStatuses.includes(response.status)) {
    const suffix = json ? ` ${JSON.stringify(json)}` : '';
    throw new Error(`${method} ${requestPath} failed with ${response.status}.${suffix}`);
  }

  return {
    status: response.status,
    body: json,
    headers: response.headers,
  };
}

function readEpic2Contracts() {
  const root = repositoryRoot();
  const snapshotsDir = path.join(root, 'argus_core', 'lib', 'data_plane', 'mappings', 'snapshots');
  const contracts = {};

  for (const index of EPIC2_INDEXES) {
    const filePath = path.join(snapshotsDir, `${index}.json`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing contract snapshot for index ${index}: ${filePath}`);
    }

    contracts[index] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  return contracts;
}

function readEpic6RuntimeContracts() {
  return {
    argonaut_runs: {
      index: 'argonaut_runs',
      settings: {
        index: {
          number_of_shards: '1',
          number_of_replicas: '0',
        },
      },
      mappings: {
        dynamic: 'strict',
        date_detection: false,
        _meta: {
          argonaut_mapping_version: '6.1',
        },
        properties: {
          runId: { type: 'keyword' },
          bundleId: { type: 'keyword' },
          repo: { type: 'keyword' },
          buildId: { type: 'keyword' },
          executionMode: { type: 'keyword' },
          pipelineVersion: { type: 'keyword' },
          status: { type: 'keyword' },
          startedAt: { type: 'date' },
          endedAt: { type: 'date' },
          stageSummary: { type: 'flattened' },
          counts: { type: 'flattened' },
          errorSummary: { type: 'flattened' },
          createdAt: { type: 'date' },
          updatedAt: { type: 'date' },
        },
      },
    },
    argonaut_tasklogs: {
      index: 'argonaut_tasklogs',
      settings: {
        index: {
          number_of_shards: '1',
          number_of_replicas: '0',
          mapping: {
            ignore_malformed: true,
          },
        },
      },
      mappings: {
        dynamic: 'strict',
        date_detection: false,
        _meta: {
          argonaut_mapping_version: '7.0.0', // Updated version for hardened mapping
        },
        properties: {
          runId: { type: 'keyword' },
          seq: { type: 'integer' },
          stage: { type: 'keyword' },
          taskType: { type: 'keyword' },
          taskKey: { type: 'keyword' },
          taskId: { type: 'keyword' },
          status: { type: 'keyword' },
          startedAt: { type: 'date' },
          endedAt: { type: 'date' },
          durationMs: { type: 'integer' },
          message: { type: 'text' },
          params: { type: 'flattened' },
          error: {
            type: 'object',
            dynamic: false,
            properties: {
              code: { type: 'keyword' },
              message: {
                type: 'text',
                fields: {
                  keyword: { type: 'keyword', ignore_above: 8192 },
                },
              },
              stack: { type: 'text' },
              type: { type: 'keyword' },
            },
          },
          createdAt: { type: 'date' },
        },
      },
    },
    argonaut_bundle_registry: {
      index: 'argonaut_bundle_registry',
      settings: {
        index: {
          number_of_shards: '1',
          number_of_replicas: '0',
        },
      },
      mappings: {
        dynamic: 'strict',
        date_detection: false,
        _meta: {
          argonaut_mapping_version: '7.4.2',
        },
        properties: {
          bundleId: { type: 'keyword', doc_values: true, index: true, norms: false },
          applicationId: { type: 'keyword', doc_values: true, index: true, norms: false },
          repo: { type: 'keyword', doc_values: true, index: true, norms: false },
          buildId: { type: 'keyword', doc_values: true, index: true, norms: false },
          createdAt: { type: 'date' },
          status: { type: 'keyword', doc_values: true, index: true, norms: false },
          lastRunId: { type: 'keyword', doc_values: true, index: true, norms: false },
          activeRunId: { type: 'keyword', doc_values: true, index: true, norms: false },
          artifactCounts: {
            type: 'object',
            dynamic: 'strict',
            properties: {
              sarif: { type: 'integer' },
              sbom: { type: 'integer' },
              lock: { type: 'integer' },
              other: { type: 'integer' }
            }
          },
          manifestVersion: { type: 'keyword', doc_values: true, index: true, norms: false },
          manifestObjectKey: { type: 'keyword', doc_values: true, index: true, norms: false },
          bundleHash: { type: 'keyword', doc_values: true, index: true, norms: false },
          artifactCount: { type: 'integer' },
          artifactTypes: { type: 'keyword', doc_values: true, index: true, norms: false },
          totalBytes: { type: 'long' },
          objectStore: {
            type: 'object',
            dynamic: 'strict',
            properties: {
              provider: { type: 'keyword', doc_values: true, index: true, norms: false },
              bucket: { type: 'keyword', doc_values: true, index: true, norms: false },
              endpoint: { type: 'keyword', doc_values: true, index: true, norms: false },
            },
          },
        },
      },
    },
  };
}

function getAllEpic6Contracts() {
  return {
    ...readEpic2Contracts(),
    ...readEpic6RuntimeContracts(),
  };
}

function getTemplateNameForIndex(index) {
  return `${index}_template`;
}

function getRequiredDataViews() {
  return [
    { id: 'argonaut-findings', title: 'argonaut_findings', timeFieldName: 'createdAt' },
    { id: 'argonaut-actions', title: 'argonaut_actions', timeFieldName: 'createdAt' },
    { id: 'argonaut-runs', title: 'argonaut_runs', timeFieldName: 'startedAt' },
    { id: 'argonaut-tasklogs', title: 'argonaut_tasklogs', timeFieldName: 'startedAt' },
  ];
}

function getRequiredDashboardIds() {
  return [
    'argonaut-epic6-runs-overview',
    'argonaut-epic6-task-stream',
    'argonaut-epic6-findings-overview',
    'argonaut-epic6-actions-overview',
  ];
}

function parseBooleanFlag(argv, name) {
  return argv.includes(`--${name}`);
}

function readStringArg(argv, name, fallback = undefined) {
  const marker = `--${name}`;
  const idx = argv.indexOf(marker);
  if (idx === -1) {
    return fallback;
  }

  const value = argv[idx + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${marker}`);
  }

  return value;
}

function assertIndexMapping(index, contract, responseBody) {
  if (!responseBody || !responseBody[index] || !responseBody[index].mappings) {
    throw new Error(`Mapping response missing index entry for ${index}.`);
  }

  const actualMappings = responseBody[index].mappings;
  const expected = stableStringify(contract.mappings);
  const actual = stableStringify(actualMappings);

  if (expected !== actual) {
    throw new Error(`Mapping drift detected for ${index}.`);
  }
}

function assertIndexMappingShape(index, contract, responseBody) {
  if (!responseBody || !responseBody[index] || !responseBody[index].mappings) {
    throw new Error(`Mapping response missing index entry for ${index}.`);
  }

  const actualMappings = responseBody[index].mappings;
  const expectedVersion = contract?.mappings?._meta?.argonaut_mapping_version;
  const actualVersion = actualMappings?._meta?.argonaut_mapping_version;
  if (expectedVersion !== actualVersion) {
    throw new Error(`Mapping version mismatch for ${index}. expected=${expectedVersion} actual=${actualVersion}`);
  }

  const expectedDynamic = contract?.mappings?.dynamic;
  const actualDynamic = actualMappings?.dynamic;
  if (!(expectedDynamic === actualDynamic || String(expectedDynamic) === String(actualDynamic))) {
    throw new Error(`Mapping dynamic mismatch for ${index}.`);
  }

  assertFieldShape(contract?.mappings?.properties || {}, actualMappings?.properties || {}, index, '');
}

function assertFieldShape(expectedProperties, actualProperties, index, pathPrefix = '') {
  if (!actualProperties || typeof actualProperties !== 'object') {
    throw new Error(`Missing properties object for ${index} at ${pathPrefix || '<root>'}.`);
  }

  for (const fieldName of Object.keys(expectedProperties)) {
    const expectedField = expectedProperties[fieldName];
    const actualField = actualProperties[fieldName];
    const fieldPath = pathPrefix ? `${pathPrefix}.${fieldName}` : fieldName;

    if (!actualField || typeof actualField !== 'object') {
      throw new Error(`Missing field ${fieldPath} in index ${index}.`);
    }

    if (expectedField.type && actualField.type && expectedField.type !== actualField.type) {
      throw new Error(`Type mismatch for field ${fieldPath} in index ${index}.`);
    }

    if (expectedField.properties) {
      assertFieldShape(expectedField.properties, actualField.properties || {}, index, fieldPath);
    }
  }
}

function defaultSavedObjectsPath() {
  return path.join(repositoryRoot(), 'kibana', 'saved_objects', 'argonaut_epic6.ndjson');
}

function writeJsonStdout(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

module.exports = {
  EPIC2_INDEXES,
  EPIC6_RUNTIME_INDEXES,
  REQUIRED_EPIC6_INDICES,
  REQUIRED_EPIC6_TEMPLATE_NAMES,
  assertIndexMapping,
  assertIndexMappingShape,
  defaultSavedObjectsPath,
  getAllEpic6Contracts,
  getTemplateNameForIndex,
  getRequiredDataViews,
  getRequiredDashboardIds,
  parseBooleanFlag,
  pickAuthHeaders,
  readStringArg,
  requestJson,
  requestMultipart,
  resolveElasticsearchUrl,
  resolveKibanaUrl,
  stableStringify,
  writeJsonStdout,
};
