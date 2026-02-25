#!/usr/bin/env ts-node

import path from 'node:path';
import fs from 'node:fs';
import {
  buildBundleManifest,
  collectArtifactEntries,
  computeBundleHash,
  parseRepoBuild,
  stableManifestJson,
} from '../lib/acquire/bundleManifest';
import {
  assertBucketExists,
  buildObjectStoreClient,
  putObjectFile,
  putObjectText,
} from '../lib/acquire/objectStoreClient';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || String(value).trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return String(value).trim();
}

function parseArg(name: string, fallback?: string): string {
  const marker = `--${name}`;
  const idx = process.argv.indexOf(marker);
  if (idx === -1) {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(`Missing required arg ${marker}`);
  }

  const value = process.argv[idx + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${marker}`);
  }

  return value;
}

function normalizeBaseUrl(url: string): string {
  return String(url).replace(/\/$/, '');
}

function authHeader(): string {
  const apiKey = process.env.ES_API_KEY || process.env.ELASTIC_API_KEY;
  if (apiKey) {
    return `ApiKey ${apiKey}`;
  }

  const username = process.env.ES_USERNAME || process.env.ELASTIC_USERNAME;
  const password = process.env.ES_PASSWORD || process.env.ELASTIC_PASSWORD;
  if (username && password) {
    return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  throw new Error('Elasticsearch auth is required (ES_API_KEY or ES_USERNAME/ES_PASSWORD).');
}

async function writeRegistryDoc(esUrl: string, bundleId: string, doc: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${normalizeBaseUrl(esUrl)}/argonaut_bundle_registry/_doc/${encodeURIComponent(bundleId)}?refresh=wait_for`, {
    method: 'PUT',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(doc),
  });

  if (response.status < 200 || response.status >= 300) {
    const body = await response.text();
    throw new Error(`Failed writing registry doc for bundleId=${bundleId}: status=${response.status} body=${body}`);
  }
}

async function main(): Promise<void> {
  const inputDir = path.resolve(parseArg('input'));
  const prefix = parseArg('prefix', process.env.DEMO_OBJECTSTORE_PREFIX || 'bundles');

  const endpoint = requiredEnv('DEMO_OBJECTSTORE_ENDPOINT');
  const bucket = requiredEnv('DEMO_OBJECTSTORE_BUCKET');
  const accessKeyId = requiredEnv('DEMO_OBJECTSTORE_ACCESS_KEY_ID');
  const secretAccessKey = requiredEnv('DEMO_OBJECTSTORE_SECRET_ACCESS_KEY');
  const esUrl = process.env.ES_URL || process.env.ELASTIC_URL;

  if (!esUrl || String(esUrl).trim().length === 0) {
    throw new Error('ES_URL or ELASTIC_URL is required.');
  }

  const objectStoreClient = buildObjectStoreClient({
    endpoint,
    accessKeyId,
    secretAccessKey,
  });

  await assertBucketExists(objectStoreClient, bucket);

  const bundleDirs = fs.readdirSync(inputDir)
    .map((entry) => path.join(inputDir, entry))
    .filter((entry) => fs.statSync(entry).isDirectory())
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));

  const results: Array<Record<string, unknown>> = [];

  for (const bundleDir of bundleDirs) {
    const bundleId = path.basename(bundleDir);
    const { repo, buildId } = parseRepoBuild(bundleId);

    const artifacts = collectArtifactEntries(bundleDir, prefix, bundleId);
    const manifest = buildBundleManifest({
      bundleId,
      repo,
      buildId,
      artifacts,
    });

    const manifestJson = stableManifestJson(manifest);

    for (const artifact of manifest.artifacts) {
      await putObjectFile({
        client: objectStoreClient,
        bucket,
        key: artifact.objectKey,
        filePath: path.join(bundleDir, artifact.filename),
      });
    }

    const manifestObjectKey = `${prefix}/${bundleId}/bundle.manifest.json`;
    await putObjectText({
      client: objectStoreClient,
      bucket,
      key: manifestObjectKey,
      content: manifestJson,
      contentType: 'application/json',
    });

    const bundleHash = computeBundleHash(manifest.artifacts);
    const registryDoc = {
      bundleId,
      applicationId: repo,
      repo,
      buildId,
      createdAt: manifest.createdAt,
      status: 'NEW',
      lastRunId: null,
      activeRunId: null,
      artifactCounts: {
        sarif: manifest.artifacts.filter(a => a.artifactType === 'sarif').length,
        sbom: manifest.artifacts.filter(a => a.artifactType === 'sbom').length,
        lock: manifest.artifacts.filter(a => a.artifactType === 'lockfile').length,
        other: manifest.artifacts.filter(a => !['sarif', 'sbom', 'lockfile'].includes(a.artifactType)).length,
      },
      manifestVersion: '1.0',
      manifestObjectKey,
      bundleHash,
      artifactCount: manifest.artifacts.length,
      artifactTypes: Array.from(new Set(manifest.artifacts.map((artifact) => artifact.artifactType))).sort((a, b) => a.localeCompare(b)),
      totalBytes: manifest.artifacts.reduce((acc, artifact) => acc + artifact.bytes, 0),
      objectStore: {
        provider: 'S3_COMPATIBLE',
        bucket,
        endpoint,
      },
    };

    await writeRegistryDoc(esUrl, bundleId, registryDoc);

    results.push({
      bundleId,
      manifestObjectKey,
      artifactCount: manifest.artifacts.length,
      bundleHash,
    });
  }

  process.stdout.write(`${JSON.stringify({ seeded: results.length, results }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
