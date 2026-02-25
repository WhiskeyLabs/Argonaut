const { Client } = require('@elastic/elasticsearch');
const client = new Client({
  node: process.env.ES_URL,
  auth: { apiKey: process.env.ES_API_KEY },
  tls: { rejectUnauthorized: false }
});

async function main() {
  const res = await client.search({
    index: 'argonaut_runs',
    size: 10
  });
  
  for (const hit of res.hits.hits) {
    const run = hit._source;
    console.log(`Updating bundle ${run.bundleId} with run ${run.runId}`);
    try {
      await client.update({
        index: 'argonaut_bundle_registry',
        id: run.bundleId,
        doc: {
          status: 'PROCESSED',
          lastRunId: run.runId,
          activeRunId: run.runId,
          processedAt: new Date().toISOString()
        }
      });
      console.log(`Updated!`);
    } catch (err) {
      console.error(err.meta.body.error);
    }
  }
}
main().catch(console.error);
