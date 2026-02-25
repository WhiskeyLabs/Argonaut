const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
import { Client } from '@elastic/elasticsearch';

const esClient = new Client({
    node: process.env.ES_URL || '',
    auth: { apiKey: process.env.ES_API_KEY || '' }
});

const INDEX_BUNDLES = 'argonaut_bundle_registry';

async function seed() {
    const bundleId = `bundle_${Date.now()}`;
    const timestamp = new Date().toISOString();

    console.log(`🌱 Seeding new bundle: ${bundleId}`);

    await esClient.index({
        index: INDEX_BUNDLES,
        id: bundleId,
        document: {
            bundleId,
            status: 'NEW',
            createdAt: timestamp,
            repo: 'VerificationApp',
            applicationId: 'VerificationApp',
            buildId: 'v1.0.0',
            lastRunId: null,
            activeRunId: null,
            artifactCounts: {
                sarif: 20,
                sbom: 2,
                lock: 10,
                other: 10,
            },
            artifactCount: 42,
            manifestVersion: '1.0',
            manifestObjectKey: 'bundles/verification/bundle.manifest.json',
            bundleHash: 'shaaaaa',
            totalBytes: 1024,
            objectStore: {
                provider: 'S3_COMPATIBLE',
                bucket: 'argonaut',
                endpoint: 'https://us-east-1.linodeobjects.com'
            }
        }
    });

    console.log('✅ Bundle indexed. Watcher should pick it up in ~10s.');
}

seed().catch(console.error);
