import { getAllIndexContracts } from '../lib/data_plane/mappings/contracts';
import { ElasticsearchDataPlaneClient } from '../lib/data_plane/es/ElasticsearchDataPlaneClient';
import { ARGONAUT_INDEX_NAMES } from '../lib/data_plane/mappings/types';

const TARGET_INDEXES = [...ARGONAUT_INDEX_NAMES];

async function main() {
    console.log('[Reset] Starting Elasticsearch index reset...');

    const esUrl = process.env.ES_URL || process.env.ELASTIC_URL || 'http://localhost:9200';
    const apiKey = process.env.ES_API_KEY || process.env.ELASTIC_API_KEY;

    if (!apiKey) {
        console.error('[Reset] Error: ELASTIC_API_KEY or ES_API_KEY is required.');
        process.exit(1);
    }

    const client = new ElasticsearchDataPlaneClient({
        esUrl,
        apiKey,
    });

    console.log(`[Reset] Using ES_URL: ${esUrl}`);
    console.log(`[Reset] API Key present: ${!!apiKey}`);

    // Cluster Sanity Check
    try {
        const cluster = await client.getClusterInfo();
        console.log(`[Reset] Cluster sanity check PASSED. Cluster Name: ${cluster.cluster_name}, Version: ${cluster.version.number}`);
    } catch (e: unknown) {
        console.error('[Reset] Cluster sanity check FAILED. The provided ES_URL or API Key is likely invalid.');
        console.error('[Reset] Error:', e instanceof Error ? e.message : String(e));
        process.exit(1);
    }

    const contracts = getAllIndexContracts();

    for (const index of TARGET_INDEXES) {
        console.log(`\n[Reset] Processing index: ${index}`);

        // 1. Delete if exists
        try {
            const exists = await client.indices.exists({ index });
            if (exists) {
                console.log(`[Reset] Index ${index} exists. Deleting...`);
                await client.indices.delete({ index });
                console.log(`[Reset] Index ${index} deleted.`);
            } else {
                console.log(`[Reset] Index ${index} does not exist. Skipping delete.`);
            }
        } catch (e: unknown) {
            console.error(`[Reset] Error during delete of ${index}:`, e instanceof Error ? e.message : String(e));
            // Continue anyway, maybe create will work
        }

        // 2. Recreate from contract
        const contract = (contracts as Record<string, any>)[index];
        if (!contract) {
            console.error(`[Reset] Error: No contract found for index ${index}. Skipping creation.`);
            continue;
        }

        try {
            console.log(`[Reset] Recreating index ${index} with fresh contract...`);
            await client.indices.create({
                index,
                settings: contract.settings,
                mappings: contract.mappings,
            });
            console.log(`[Reset] Index ${index} recreated successfully.`);
        } catch (e: unknown) {
            console.error(`[Reset] Error during creation of ${index}:`, e instanceof Error ? e.message : String(e));
        }
    }

    console.log('\n[Reset] Elasticsearch index reset complete.');
}

main().catch(err => {
    console.error('[Reset] Critical Unhandled Failure:', err);
    process.exit(1);
});
