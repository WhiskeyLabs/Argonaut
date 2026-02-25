const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
import { Client } from '@elastic/elasticsearch';

const esClient = new Client({
    node: process.env.ES_URL || '',
    auth: { apiKey: process.env.ES_API_KEY || '' }
});

async function updateMappings() {
    console.log('🆙 Updating mapping for argonaut_runs...');
    await esClient.indices.putMapping({
        index: 'argonaut_runs',
        properties: {
            applicationId: { type: 'keyword' },
            completedAt: { type: 'date' },
            stageSummary: {
                type: 'object',
                dynamic: true // Allow dynamic stage fields
            }
        }
    });

    console.log('🆙 Updating mapping for argonaut_tasklogs...');
    await esClient.indices.putMapping({
        index: 'argonaut_tasklogs',
        properties: {
            bundleId: { type: 'keyword' },
            timestamp: { type: 'date' },
            level: { type: 'keyword' }
        }
    });

    console.log('✅ Mappings updated successfully.');
}

updateMappings().catch(console.error);
