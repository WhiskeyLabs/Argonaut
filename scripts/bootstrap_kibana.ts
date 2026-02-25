#!/usr/bin/env ts-node

const fs = require('node:fs');
const path = require('node:path');
const {
  defaultSavedObjectsPath,
  getRequiredDataViews,
  parseBooleanFlag,
  pickAuthHeaders,
  readStringArg,
  requestJson,
  requestMultipart,
  resolveKibanaUrl,
  writeJsonStdout,
} = require('./lib/elastic_runtime');

function printHelp() {
  const lines = [
    'Usage: ts-node scripts/bootstrap_kibana.ts [--saved-objects <path>] [--skip-import]',
    '',
    'Environment:',
    '  KIBANA_URL                         Kibana base URL (default: http://localhost:5601)',
    '  KIBANA_API_KEY                     API key auth (optional)',
    '  KIBANA_USERNAME/KIBANA_PASSWORD    Basic auth fallback (optional)',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

async function importSavedObjects(kibanaUrl, authHeaders, savedObjectsPath) {
  const resolvedPath = path.resolve(savedObjectsPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Saved objects file not found: ${resolvedPath}`);
  }

  const buffer = fs.readFileSync(resolvedPath);
  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: 'application/ndjson' }), path.basename(resolvedPath));

  const response = await requestMultipart(
    kibanaUrl,
    '/api/saved_objects/_import?overwrite=true',
    formData,
    {
      method: 'POST',
      expectedStatuses: [200],
      headers: {
        ...authHeaders,
        'kbn-xsrf': 'argonaut-epic6-bootstrap',
      },
    },
  );

  if (!response.body || response.body.success !== true) {
    throw new Error(`Saved object import failed: ${JSON.stringify(response.body)}`);
  }

  return {
    file: resolvedPath,
    successCount: response.body.successCount || 0,
  };
}

async function upsertDataViews(kibanaUrl, authHeaders) {
  const objects = getRequiredDataViews().map((view) => ({
    type: 'index-pattern',
    id: view.id,
    attributes: {
      title: view.title,
      timeFieldName: view.timeFieldName,
    },
  }));

  const response = await requestJson(
    kibanaUrl,
    '/api/saved_objects/_bulk_create?overwrite=true',
    {
      method: 'POST',
      expectedStatuses: [200],
      headers: {
        ...authHeaders,
        'kbn-xsrf': 'argonaut-epic6-bootstrap',
      },
      body: objects,
    },
  );

  const results = Array.isArray(response.body)
    ? response.body.map((item) => ({
        id: item.id,
        type: item.type,
        error: item.error || null,
      }))
    : [];

  return {
    attempted: objects.length,
    results,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return;
  }

  const skipImport = parseBooleanFlag(argv, 'skip-import');
  const savedObjectsPath = readStringArg(argv, 'saved-objects', defaultSavedObjectsPath());
  const kibanaUrl = resolveKibanaUrl();
  const authHeaders = pickAuthHeaders('kibana');

  await requestJson(kibanaUrl, '/api/status', {
    method: 'GET',
    expectedStatuses: [200],
    headers: {
      ...authHeaders,
      'kbn-xsrf': 'argonaut-epic6-bootstrap',
    },
  });

  const importResult = skipImport
    ? { skipped: true, file: savedObjectsPath }
    : await importSavedObjects(kibanaUrl, authHeaders, savedObjectsPath);

  const dataViewResult = await upsertDataViews(kibanaUrl, authHeaders);

  writeJsonStdout({
    tool: 'bootstrap_kibana',
    kibanaUrl,
    importResult,
    dataViewResult,
  });
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
