#!/usr/bin/env ts-node

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

function readLimit(): number {
  const marker = '--limit';
  const idx = process.argv.indexOf(marker);
  if (idx === -1) {
    return 20;
  }

  const raw = process.argv[idx + 1];
  const value = Number.parseInt(String(raw), 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('Invalid --limit value.');
  }

  return value;
}

async function main(): Promise<void> {
  const esUrl = process.env.ES_URL || process.env.ELASTIC_URL;
  if (!esUrl) {
    throw new Error('ES_URL or ELASTIC_URL is required.');
  }

  const limit = readLimit();

  const response = await fetch(`${normalizeBaseUrl(esUrl)}/argonaut_bundle_registry/_search`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      size: limit,
      sort: [{ createdAt: 'desc' }, { bundleId: 'asc' }],
      query: { match_all: {} },
    }),
  });

  if (response.status !== 200) {
    const body = await response.text();
    throw new Error(`Failed to list bundles: status=${response.status} body=${body}`);
  }

  const payload = await response.json();
  const hits = payload && payload.hits && Array.isArray(payload.hits.hits) ? payload.hits.hits : [];

  const rows = hits
    .map((hit: Record<string, unknown>) => hit._source)
    .filter(Boolean);

  process.stdout.write(`${JSON.stringify({ count: rows.length, bundles: rows }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
