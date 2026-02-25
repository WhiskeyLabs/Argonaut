const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
import { Client } from '@elastic/elasticsearch';

const esClient = new Client({
    node: process.env.ES_URL || '',
    auth: { apiKey: process.env.ES_API_KEY || '' }
});

async function checkMappings() {
    const runs = await esClient.indices.getMapping({ index: 'argonaut_runs' });
    console.log('--- argonaut_runs ---');
    console.log(JSON.stringify(runs, null, 2));

    const logs = await esClient.indices.getMapping({ index: 'argonaut_tasklogs' });
    console.log('--- argonaut_tasklogs ---');
    console.log(JSON.stringify(logs, null, 2));
}

checkMappings().catch(console.error);
