const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
import { Client } from '@elastic/elasticsearch';

const esClient = new Client({
    node: process.env.ES_URL || '',
    auth: { apiKey: process.env.ES_API_KEY || '' }
});

async function updateMapping() {
    console.log('🆙 Updating mapping for argonaut_bundle_registry...');

    await esClient.indices.putMapping({
        index: 'argonaut_bundle_registry',
        properties: {
            status: { type: 'keyword' },
            bundleId: { type: 'keyword' },
            createdAt: { type: 'date' },
            repo: { type: 'keyword' },
            applicationId: { type: 'keyword' },
            buildId: { type: 'keyword' },
            lastRunId: { type: 'keyword' },
            activeRunId: { type: 'keyword' },
            processedAt: { type: 'date' },
            errorSummary: { type: 'text' },
            manifestVersion: { type: 'keyword' },
            manifestObjectKey: { type: 'keyword' },
            bundleHash: { type: 'keyword' },
            totalBytes: { type: 'long' },
            artifactCount: { type: 'integer' },
            artifactCounts: {
                properties: {
                    sarif: { type: 'integer' },
                    sbom: { type: 'integer' },
                    lock: { type: 'integer' },
                    other: { type: 'integer' }
                }
            },
            objectStore: {
                properties: {
                    provider: { type: 'keyword' },
                    bucket: { type: 'keyword' },
                    endpoint: { type: 'keyword' }
                }
            },
            processingLock: {
                properties: {
                    lockedAt: { type: 'date' },
                    lockedBy: { type: 'keyword' },
                    runId: { type: 'keyword' }
                }
            }
        }
    });

    console.log('✅ Mapping updated successfully.');
}

updateMapping().catch(console.error);
