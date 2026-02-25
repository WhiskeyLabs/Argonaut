#!/usr/bin/env ts-node

const { spawnSync } = require('node:child_process');

const {
  assertIndexMappingShape,
  getAllEpic6Contracts,
  getRequiredDashboardIds,
  REQUIRED_EPIC6_TEMPLATE_NAMES,
  REQUIRED_EPIC6_INDICES,
  getRequiredDataViews,
  getTemplateNameForIndex,
  parseBooleanFlag,
  pickAuthHeaders,
  requestJson,
  resolveElasticsearchUrl,
  resolveKibanaUrl,
  writeJsonStdout,
} = require('./lib/elastic_runtime');

const SMOKE_TIMESTAMP = '2026-02-23T00:00:00.000Z';
const SMOKE_RUN_ID = 'smoke-run';

function printHelp() {
  const lines = [
    'Usage: ts-node scripts/demo_smoke.ts [--skip-write]',
    '',
    'Environment:',
    '  ES_URL / ELASTIC_URL               Elasticsearch base URL (default: http://localhost:9200)',
    '  KIBANA_URL                         Kibana base URL (default: http://localhost:5601)',
    '  ES_API_KEY / ELASTIC_API_KEY       Elasticsearch auth (optional)',
    '  KIBANA_API_KEY                     Kibana auth (optional)',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

function buildTaskLogProbe() {
  return {
    runId: SMOKE_RUN_ID,
    seq: 1,
    stage: 'SYSTEM',
    taskType: 'SYSTEM',
    taskKey: 'smoke',
    taskId: 'smoke-task',
    status: 'SUCCEEDED',
    startedAt: SMOKE_TIMESTAMP,
    endedAt: SMOKE_TIMESTAMP,
    durationMs: 1,
    message: 'smoke-log',
    refs: {
      runId: SMOKE_RUN_ID,
    },
    error: {
      code: 'NONE',
      message: 'none',
    },
    createdAt: SMOKE_TIMESTAMP,
  };
}

async function assertIndexExists(esUrl, authHeaders, index) {
  const exists = await requestJson(esUrl, `/${index}`, {
    method: 'HEAD',
    expectedStatuses: [200, 404],
    headers: authHeaders,
  });

  if (exists.status !== 200) {
    throw new Error(`Required index missing: ${index}`);
  }

  return { index, exists: true };
}

async function assertIndexMappingApplied(esUrl, authHeaders, index, contract) {
  const mapping = await requestJson(esUrl, `/${index}/_mapping`, {
    method: 'GET',
    expectedStatuses: [200],
    headers: authHeaders,
  });

  assertIndexMappingShape(index, contract, mapping.body);
  return { index, mappingApplied: true };
}

async function assertTemplateExists(esUrl, authHeaders, templateName) {
  const response = await requestJson(esUrl, `/_index_template/${encodeURIComponent(templateName)}`, {
    method: 'GET',
    expectedStatuses: [200, 404],
    headers: authHeaders,
  });

  if (response.status !== 200) {
    throw new Error(`Required composable template missing: ${templateName}`);
  }

  const templates = response.body && Array.isArray(response.body.index_templates)
    ? response.body.index_templates
    : [];
  const hasTemplate = templates.some((entry) => entry && entry.name === templateName);
  if (!hasTemplate) {
    throw new Error(`Required composable template missing: ${templateName}`);
  }

  return {
    template: templateName,
    exists: true,
  };
}

async function assertDataViewExists(kibanaUrl, authHeaders, dataViewId) {
  const response = await requestJson(
    kibanaUrl,
    `/api/saved_objects/index-pattern/${encodeURIComponent(dataViewId)}`,
    {
      method: 'GET',
      expectedStatuses: [200, 404],
      headers: {
        ...authHeaders,
        'kbn-xsrf': 'argonaut-epic6-smoke',
      },
    },
  );

  if (response.status !== 200) {
    throw new Error(`Required Kibana data view missing: ${dataViewId}`);
  }

  return {
    dataViewId,
    exists: true,
  };
}

async function assertDashboardExists(kibanaUrl, authHeaders, dashboardId) {
  const response = await requestJson(
    kibanaUrl,
    `/api/saved_objects/dashboard/${encodeURIComponent(dashboardId)}`,
    {
      method: 'GET',
      expectedStatuses: [200, 404],
      headers: {
        ...authHeaders,
        'kbn-xsrf': 'argonaut-epic6-smoke',
      },
    },
  );

  if (response.status !== 200) {
    throw new Error(`Required Kibana dashboard missing: ${dashboardId}`);
  }

  return {
    dashboardId,
    exists: true,
  };
}

async function writeReadDeleteTaskLogProbe(esUrl, authHeaders) {
  const index = 'argonaut_tasklogs';
  const docId = 'smoke::argonaut_tasklogs';
  const probeDoc = buildTaskLogProbe();

  await requestJson(esUrl, `/${index}/_doc/${encodeURIComponent(docId)}?refresh=wait_for`, {
    method: 'PUT',
    expectedStatuses: [200, 201],
    headers: authHeaders,
    body: probeDoc,
  });

  const readBack = await requestJson(esUrl, `/${index}/_doc/${encodeURIComponent(docId)}?refresh=true`, {
    method: 'GET',
    expectedStatuses: [200],
    headers: authHeaders,
  });

  if (!readBack.body || readBack.body.found !== true) {
    throw new Error(`Probe document not found after write for ${index}.`);
  }

  await requestJson(esUrl, `/${index}/_doc/${encodeURIComponent(docId)}?refresh=wait_for`, {
    method: 'DELETE',
    expectedStatuses: [200],
    headers: authHeaders,
  });

  return {
    index,
    id: docId,
    writable: true,
    cleanedUp: true,
  };
}

function maybeProbeObjectStore() {
  const endpoint = process.env.DEMO_OBJECTSTORE_ENDPOINT;
  const bucket = process.env.DEMO_OBJECTSTORE_BUCKET;
  const keyId = process.env.DEMO_OBJECTSTORE_ACCESS_KEY_ID;
  const secret = process.env.DEMO_OBJECTSTORE_SECRET_ACCESS_KEY;
  const prefix = process.env.DEMO_OBJECTSTORE_PREFIX || 'bundles';

  if (!(endpoint && bucket && keyId && secret)) {
    return {
      enabled: false,
      checked: false,
      reason: 'Object store env vars not fully set; probe skipped.',
    };
  }

  const whichAws = spawnSync('which', ['aws'], { encoding: 'utf8' });
  if (whichAws.status !== 0) {
    return {
      enabled: true,
      checked: false,
      reason: 'aws CLI not found; object store probe skipped.',
    };
  }

  const result = spawnSync(
    'aws',
    [
      '--endpoint-url',
      endpoint,
      's3api',
      'list-objects-v2',
      '--bucket',
      bucket,
      '--prefix',
      prefix,
      '--max-items',
      '1',
      '--output',
      'json',
    ],
    {
      env: {
        ...process.env,
        AWS_ACCESS_KEY_ID: keyId,
        AWS_SECRET_ACCESS_KEY: secret,
      },
      encoding: 'utf8',
    },
  );

  if (result.status !== 0) {
    throw new Error(`Object store credential probe failed: ${String(result.stderr || result.stdout || '').trim()}`);
  }

  let parsed = {};
  try {
    parsed = JSON.parse(result.stdout || '{}');
  } catch (_error) {
    parsed = {};
  }

  return {
    enabled: true,
    checked: true,
    endpoint,
    bucket,
    prefix,
    objectCount: typeof parsed.KeyCount === 'number' ? parsed.KeyCount : undefined,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return;
  }

  const skipWrite = parseBooleanFlag(argv, 'skip-write');
  const esUrl = resolveElasticsearchUrl();
  const kibanaUrl = resolveKibanaUrl();
  const esAuthHeaders = pickAuthHeaders('es');
  const kibanaAuthHeaders = pickAuthHeaders('kibana');
  const contracts = getAllEpic6Contracts();

  const clusterHealth = await requestJson(esUrl, '/_cluster/health?wait_for_status=yellow&timeout=30s', {
    method: 'GET',
    expectedStatuses: [200],
    headers: esAuthHeaders,
  });

  const kibanaStatus = await requestJson(kibanaUrl, '/api/status', {
    method: 'GET',
    expectedStatuses: [200],
    headers: {
      ...kibanaAuthHeaders,
      'kbn-xsrf': 'argonaut-epic6-smoke',
    },
  });

  const indexChecks = [];
  const mappingChecks = [];
  for (const index of REQUIRED_EPIC6_INDICES) {
    indexChecks.push(await assertIndexExists(esUrl, esAuthHeaders, index));
    mappingChecks.push(await assertIndexMappingApplied(esUrl, esAuthHeaders, index, contracts[index]));
  }

  const templateChecks = [];
  for (const templateName of REQUIRED_EPIC6_TEMPLATE_NAMES) {
    templateChecks.push(await assertTemplateExists(esUrl, esAuthHeaders, templateName));
  }

  const dataViewChecks = [];
  for (const dataView of getRequiredDataViews()) {
    dataViewChecks.push(await assertDataViewExists(kibanaUrl, kibanaAuthHeaders, dataView.id));
  }

  const dashboardChecks = [];
  for (const dashboardId of getRequiredDashboardIds()) {
    dashboardChecks.push(await assertDashboardExists(kibanaUrl, kibanaAuthHeaders, dashboardId));
  }

  const explicitTemplateNames = REQUIRED_EPIC6_INDICES.map((index) => getTemplateNameForIndex(index));
  const writeChecks = [];
  if (!skipWrite) {
    writeChecks.push(await writeReadDeleteTaskLogProbe(esUrl, esAuthHeaders));
  }

  const objectStoreProbe = maybeProbeObjectStore();

  writeJsonStdout({
    tool: 'demo_smoke',
    esUrl,
    kibanaUrl,
    clusterHealth: clusterHealth.body,
    kibanaOverall: kibanaStatus.body && kibanaStatus.body.status ? kibanaStatus.body.status.overall : null,
    dashboardChecks,
    indexChecks,
    templateChecks,
    explicitTemplateNames,
    dataViewChecks,
    writeChecks,
    mappingChecks,
    objectStoreProbe,
  });
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
