import esClient from '../src/lib/esClient';

async function main() {
    const bundleId = 'bundle_final_test_4';

    await esClient.index({
        index: 'argonaut_bundle_registry',
        id: bundleId,
        document: {
            applicationId: 'VerificationApp',
            buildId: 'v1.2.3',
            status: 'NEW',
            createdAt: new Date().toISOString(),
        }
    });

    console.log(`Successfully created test bundle ${bundleId}`);
}

main().catch(console.error);
