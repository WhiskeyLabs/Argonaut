#!/usr/bin/env ts-node

const {
  assertIndexMapping,
  getAllEpic6Contracts,
  getTemplateNameForIndex,
  parseBooleanFlag,
  pickAuthHeaders,
  requestJson,
  resolveElasticsearchUrl,
  stableStringify,
  writeJsonStdout,
} = require('./lib/elastic_runtime');

function printHelp() {
  const lines = [
    'Usage: ts-node scripts/bootstrap_es.ts [--validate-only]',
    '',
    'Environment:',
    '  ES_URL or ELASTIC_URL             Elasticsearch base URL (default: http://localhost:9200)',
    '  ES_API_KEY or ELASTIC_API_KEY     API key auth (optional)',
    '  ES_USERNAME/ES_PASSWORD           Basic auth fallback (optional)',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

async function ensureIndex(index, contract, esUrl, authHeaders, validateOnly) {
  const exists = await requestJson(esUrl, `/${index}`, {
    method: 'HEAD',
    expectedStatuses: [200, 404],
    headers: authHeaders,
  });

  if (exists.status === 404) {
    if (validateOnly) {
      throw new Error(`Index ${index} is missing in validate-only mode.`);
    }

    await requestJson(esUrl, `/${index}`, {
      method: 'PUT',
      headers: authHeaders,
      body: {
        settings: contract.settings,
        mappings: contract.mappings,
      },
      expectedStatuses: [200],
    });

    return {
      index,
      action: 'created',
      message: 'Index created with deterministic contract mapping.',
    };
  }

  const mapping = await requestJson(esUrl, `/${index}/_mapping`, {
    method: 'GET',
    expectedStatuses: [200],
    headers: authHeaders,
  });

  try {
    assertIndexMapping(index, contract, mapping.body);
  } catch (_strictError) {
    try {
      assertMappingShape(index, contract, mapping.body);
      return {
        index,
        action: 'validated',
        message: 'Existing mapping validated by deterministic shape contract.',
      };
    } catch (_shapeError) {
      if (validateOnly) {
        throw new Error(`Mapping drift detected for ${index}.`);
      }

      await requestJson(esUrl, `/${index}/_mapping`, {
        method: 'PUT',
        expectedStatuses: [200],
        headers: authHeaders,
        body: contract.mappings,
      });

      const repaired = await requestJson(esUrl, `/${index}/_mapping`, {
        method: 'GET',
        expectedStatuses: [200],
        headers: authHeaders,
      });

      assertMappingShape(index, contract, repaired.body);

      return {
        index,
        action: 'repaired',
        message: 'Existing index mapping repaired to deterministic contract.',
      };
    }
  }

  return {
    index,
    action: 'validated',
    message: 'Existing mapping matches deterministic contract.',
  };
}

function assertMappingShape(index, contract, mappingResponse) {
  const record = mappingResponse && mappingResponse[index] ? mappingResponse[index] : null;
  const mappings = record && record.mappings ? record.mappings : null;

  if (!mappings || typeof mappings !== 'object') {
    throw new Error(`Missing mappings object for ${index}.`);
  }

  const actualVersion = mappings._meta && mappings._meta.argonaut_mapping_version;
  const expectedVersion = contract.mappings._meta.argonaut_mapping_version;
  if (actualVersion !== expectedVersion) {
    throw new Error(`Mapping version mismatch for ${index}.`);
  }

  const actualDynamic = mappings.dynamic;
  const expectedDynamic = contract.mappings.dynamic;
  if (!(actualDynamic === expectedDynamic || String(actualDynamic) === String(expectedDynamic))) {
    throw new Error(`Dynamic mapping mismatch for ${index}.`);
  }

  assertFieldShape(contract.mappings.properties, mappings.properties, index);
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
      assertFieldShape(expectedField.properties, actualField.properties, index, fieldPath);
    }
  }
}

function buildTemplateBody(index, contract) {
  return {
    index_patterns: [index],
    priority: 500,
    template: {
      settings: contract.settings,
      mappings: contract.mappings,
    },
    _meta: {
      argonaut_template_version: '6.1',
      argonaut_index: index,
    },
  };
}

function normalizeTemplateShape(value) {
  return {
    index_patterns: value.index_patterns,
    priority: value.priority,
    template: value.template,
    _meta: value._meta,
  };
}

async function ensureTemplate(index, contract, esUrl, authHeaders) {
  const templateName = getTemplateNameForIndex(index);
  const expectedBody = buildTemplateBody(index, contract);

  await requestJson(esUrl, `/_index_template/${encodeURIComponent(templateName)}`, {
    method: 'PUT',
    expectedStatuses: [200],
    headers: authHeaders,
    body: expectedBody,
  });

  const response = await requestJson(esUrl, `/_index_template/${encodeURIComponent(templateName)}`, {
    method: 'GET',
    expectedStatuses: [200],
    headers: authHeaders,
  });

  const templates = response.body && Array.isArray(response.body.index_templates)
    ? response.body.index_templates
    : [];

  const match = templates.find((entry) => entry && entry.name === templateName);
  if (!match || !match.index_template) {
    throw new Error(`Template ${templateName} not found after upsert.`);
  }

  const expected = stableStringify(normalizeTemplateShape(expectedBody));
  const actual = stableStringify(normalizeTemplateShape(match.index_template));
  if (expected !== actual) {
    throw new Error(`Template drift detected for ${templateName}.`);
  }

  return {
    template: templateName,
    action: 'upserted',
    message: 'Composable template upserted and validated.',
  };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return;
  }

  const validateOnly = parseBooleanFlag(argv, 'validate-only');
  const esUrl = resolveElasticsearchUrl();
  const authHeaders = pickAuthHeaders('es');
  const contracts = getAllEpic6Contracts();

  await requestJson(esUrl, '/', {
    method: 'GET',
    expectedStatuses: [200],
    headers: authHeaders,
  });

  const templates = [];
  const results = [];
  for (const index of Object.keys(contracts).sort((left, right) => left.localeCompare(right))) {
    const contract = contracts[index];
    templates.push(await ensureTemplate(index, contract, esUrl, authHeaders));
    const outcome = await ensureIndex(index, contract, esUrl, authHeaders, validateOnly);
    results.push(outcome);
  }

  writeJsonStdout({
    tool: 'bootstrap_es',
    esUrl,
    validateOnly,
    templates,
    results,
  });
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
