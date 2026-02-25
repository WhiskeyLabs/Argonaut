#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const INDEXES = [
  'argonaut_artifacts',
  'argonaut_findings',
  'argonaut_dependencies',
  'argonaut_sbom',
  'argonaut_reachability',
  'argonaut_threatintel',
  'argonaut_actions',
];

const mappingVersion = '1.0';
const validateOnly = process.argv.includes('--validate-only');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const snapshotsDir = path.join(root, 'lib', 'data_plane', 'mappings', 'snapshots');

const elasticUrl = process.env.ELASTIC_URL;
const apiKey = process.env.ELASTIC_API_KEY;

if (!elasticUrl || !apiKey) {
  console.error('Missing ELASTIC_URL or ELASTIC_API_KEY.');
  process.exit(1);
}

function normalizeUrl(base, suffix) {
  return `${base.replace(/\/$/, '')}${suffix}`;
}

function stableStringify(value) {
  return JSON.stringify(value, (_key, nested) => {
    if (Array.isArray(nested)) return nested;
    if (nested && typeof nested === 'object') {
      return Object.keys(nested)
        .sort((a, b) => a.localeCompare(b))
        .reduce((acc, key) => {
          acc[key] = nested[key];
          return acc;
        }, {});
    }
    return nested;
  });
}

async function request(method, suffix, body) {
  const response = await fetch(normalizeUrl(elasticUrl, suffix), {
    method,
    headers: {
      Authorization: `ApiKey ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 404) {
    return { status: 404, body: null };
  }

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${suffix} failed: ${response.status} ${JSON.stringify(json)}`);
  }

  return { status: response.status, body: json };
}

function readContract(index) {
  const file = path.join(snapshotsDir, `${index}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function main() {
  const report = [];

  for (const index of INDEXES) {
    const contract = readContract(index);
    const exists = await request('GET', `/${index}`);

    if (exists.status === 404) {
      if (validateOnly) {
        throw new Error(`Index ${index} does not exist in validate-only mode.`);
      }

      await request('PUT', `/${index}`, {
        settings: contract.settings,
        mappings: contract.mappings,
      });

      report.push({ index, action: 'created', message: 'created with frozen contract mapping' });
      continue;
    }

    const mappingResp = await request('GET', `/${index}/_mapping`);
    const actualMapping = mappingResp.body?.[index]?.mappings;

    if (!actualMapping || actualMapping?._meta?.argonaut_mapping_version !== mappingVersion) {
      throw new Error(`Mapping version mismatch for ${index}; expected ${mappingVersion}.`);
    }

    const expectedCanonical = stableStringify(contract.mappings);
    const actualCanonical = stableStringify(actualMapping);

    if (expectedCanonical !== actualCanonical) {
      throw new Error(`Mapping drift detected for ${index}.`);
    }

    report.push({ index, action: 'validated', message: 'mapping validated' });
  }

  console.log(JSON.stringify({ mappingVersion, validateOnly, results: report }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
