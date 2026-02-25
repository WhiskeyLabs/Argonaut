async function main() {
    const esUrl = process.env.ES_URL || 'https://181b87a59c5a48b2ad19c7e9bca48622.us-central1.gcp.cloud.es.io:443';
    const apiKey = process.env.ES_API_KEY || 'Y0pEZWhwd0JvN0hGVW5aeHlvUHM6aHpObk95STBoQzFlbC1sTTVsWUtqZw==';

    const searchRes = await fetch(`${esUrl}/argonaut_runs/_search?size=50`, {
        headers: {
            'Authorization': `ApiKey ${apiKey}`,
            'Content-Type': 'application/json'
        }
    });

    if (!searchRes.ok) {
        console.error('Failed to search runs', await searchRes.text());
        return;
    }

    const searchData = await searchRes.json();

    for (const hit of searchData.hits.hits) {
        const run = hit._source;
        console.log(`Updating bundle ${run.bundleId} with run ${run.runId}`);

        const updateRes = await fetch(`${esUrl}/argonaut_bundle_registry/_update/${run.bundleId}`, {
            method: 'POST',
            headers: {
                'Authorization': `ApiKey ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                doc: {
                    status: 'PROCESSED',
                    lastRunId: run.runId,
                    activeRunId: run.runId
                }
            })
        });

        if (!updateRes.ok) {
            console.error(`Failed to update ${run.bundleId}`, await updateRes.text());
        } else {
            console.log(`Updated ${run.bundleId}!`);
        }
    }
}

main().catch(console.error);
