
import { ElasticsearchDataPlaneClient } from '../lib/data_plane/es/ElasticsearchDataPlaneClient';
import { EsRunLogger } from '../lib/runtime/runLogging';

async function main() {
    const esUrl = process.env.ES_URL || process.env.ELASTIC_URL || 'http://localhost:9200';
    const apiKey = process.env.ES_API_KEY || process.env.ELASTIC_API_KEY;

    if (!apiKey) {
        console.error('Error: ES_API_KEY is required');
        process.exit(1);
    }

    const client = new ElasticsearchDataPlaneClient({ esUrl, apiKey });
    const logger = new EsRunLogger({
        client,
        runId: 'test-huge-' + Date.now(),
        repo: 'test-repo',
        buildId: 'test-build',
        bundleId: 'test-bundle',
        executionMode: 'es',
        pipelineVersion: '1.0.0'
    });

    console.log('Writing task with HUGE error message...');
    const hugeMessage = 'Enrich write failed: repo, buildId, and fingerprint are required for identity verification. '.repeat(1000);
    console.log(`Message length: ${hugeMessage.length} chars`);

    await logger.writeTask({
        stage: 'ENRICH',
        taskType: 'BATCH',
        taskKey: 'huge-error-task',
        status: 'FAILED',
        message: 'Testing huge error message',
        error: {
            code: 'TEST_ERROR',
            message: hugeMessage,
            stack: 'Test stack trace'.repeat(500)
        }
    });

    console.log('Task write attempted. Check logs above for errors.');
}

main().catch(console.error);
