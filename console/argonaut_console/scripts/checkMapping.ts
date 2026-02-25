const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
import { Client } from '@elastic/elasticsearch';

const esClient = new Client({
    node: process.env.ES_URL || '',
    auth: { apiKey: process.env.ES_API_KEY || '' }
});

async function checkMapping() {
    const response = await esClient.indices.getMapping({ index: 'argonaut_bundle_registry' });
    console.log(JSON.stringify(response, null, 2));
}

checkMapping().catch(console.error);
