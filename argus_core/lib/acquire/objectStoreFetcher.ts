import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BundleManifest } from './bundleManifest';
import { sortArtifactsBySha, validateManifestShape, verifyFileChecksum } from './bundleManifest';
import { buildObjectStoreClient, getObjectFile, getObjectText } from './objectStoreClient';

type RegistryDoc = {
    bundleId: string;
    manifestObjectKey: string;
    manifestVersion: string;
    repo: string;
    buildId: string;
};

function normalizeBaseUrl(url: string): string {
    return String(url).replace(/\/$/, '');
}

function authHeaders(): Record<string, string> {
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

    throw new Error('Elasticsearch auth is required (ES_API_KEY or ES_USERNAME/ES_PASSWORD).');
}

function requiredEnv(name: string): string {
    const value = process.env[name];
    if (!value || String(value).trim().length === 0) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return String(value).trim();
}

async function readRegistryDoc(bundleId: string): Promise<RegistryDoc> {
    const esUrl = normalizeBaseUrl(process.env.ES_URL || process.env.ELASTIC_URL || '');
    if (!esUrl) {
        throw new Error('ES_URL or ELASTIC_URL is required for object-store fetch mode.');
    }

    const response = await fetch(`${esUrl}/argonaut_bundle_registry/_doc/${encodeURIComponent(bundleId)}`, {
        method: 'GET',
        headers: {
            ...authHeaders(),
            'Content-Type': 'application/json',
        },
    });

    if (response.status !== 200) {
        throw new Error(`Bundle registry lookup failed for bundleId=${bundleId} (status=${response.status}).`);
    }

    const body = await response.json();
    const source = body && body._source ? body._source : null;
    if (!source || typeof source !== 'object') {
        throw new Error(`Bundle registry record missing _source for bundleId=${bundleId}.`);
    }

    const manifestObjectKey = String(source.manifestObjectKey || '').trim();
    if (!manifestObjectKey) {
        throw new Error(`Bundle registry record missing manifestObjectKey for bundleId=${bundleId}.`);
    }

    return {
        bundleId: String(source.bundleId || bundleId),
        manifestObjectKey,
        manifestVersion: String(source.manifestVersion || '1.0'),
        repo: String(source.repo || ''),
        buildId: String(source.buildId || ''),
    };
}

export async function fetchBundleFromObjectStore(bundleId: string): Promise<{ bundlePath: string; manifest: BundleManifest }> {
    if (!bundleId || String(bundleId).trim().length === 0) {
        throw new Error('bundleId is required for object-store fetch mode.');
    }

    const endpoint = requiredEnv('DEMO_OBJECTSTORE_ENDPOINT');
    const bucket = requiredEnv('DEMO_OBJECTSTORE_BUCKET');
    const accessKeyId = requiredEnv('DEMO_OBJECTSTORE_ACCESS_KEY_ID');
    const secretAccessKey = requiredEnv('DEMO_OBJECTSTORE_SECRET_ACCESS_KEY');

    const registry = await readRegistryDoc(bundleId);

    const objectStoreClient = buildObjectStoreClient({
        endpoint,
        accessKeyId,
        secretAccessKey,
    });

    const bundleRoot = fs.mkdtempSync(path.join(os.tmpdir(), `argonaut-${bundleId}-`));
    const artifactsDir = path.join(bundleRoot, 'artifacts');
    fs.mkdirSync(artifactsDir, { recursive: true });

    const manifestRaw = await getObjectText({
        client: objectStoreClient,
        bucket,
        key: registry.manifestObjectKey,
    });

    const manifest = JSON.parse(manifestRaw) as BundleManifest;
    validateManifestShape(manifest, bundleId);

    const orderedArtifacts = sortArtifactsBySha(manifest.artifacts);
    for (const artifact of orderedArtifacts) {
        const outputPath = path.join(artifactsDir, artifact.filename);

        try {
            await getObjectFile({
                client: objectStoreClient,
                bucket,
                key: artifact.objectKey,
                destinationPath: outputPath,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'download failure';
            throw new Error(`Object fetch failed bundleId=${bundleId} artifactId=${artifact.artifactId} objectKey=${artifact.objectKey}: ${message}`);
        }

        const checksum = verifyFileChecksum(outputPath, artifact.sha256);
        if (!checksum.ok) {
            throw new Error(
                `Checksum mismatch bundleId=${bundleId} artifactId=${artifact.artifactId} objectKey=${artifact.objectKey} expected=${artifact.sha256} actual=${checksum.actualSha256}`,
            );
        }
    }

    return {
        bundlePath: artifactsDir,
        manifest,
    };
}
