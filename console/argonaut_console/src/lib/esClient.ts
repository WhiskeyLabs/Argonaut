import { Client } from '@elastic/elasticsearch';

const esUrl = process.env.ES_URL;
const esApiKey = process.env.ES_API_KEY;

if (!esUrl || !esApiKey) {
    console.warn('⚠️ Elasticsearch environment variables (ES_URL, ES_API_KEY) are missing. ES client not initialized.');
}

const client = new Client({
    node: esUrl,
    auth: {
        apiKey: esApiKey as string,
    },
    // In production setups, consider TLS options if necessary
});

export default client;
