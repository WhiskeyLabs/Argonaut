import { NextResponse } from 'next/server';
import client from '@/lib/esClient';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ applicationId: string }> }
) {
    const { applicationId } = await params;

    if (!applicationId) {
        return NextResponse.json({ error: 'Missing applicationId' }, { status: 400 });
    }

    try {
        const response = await client.search({
            index: 'argonaut_bundle_registry',
            size: 100, // Reasonable default page size for an inbox
            query: {
                bool: {
                    should: [
                        { term: { 'applicationId': applicationId } },
                        {
                            bool: {
                                must: [
                                    { term: { 'repo': applicationId } },
                                    { bool: { must_not: { exists: { field: 'applicationId' } } } }
                                ]
                            }
                        }
                    ],
                    minimum_should_match: 1
                }
            },
            sort: [
                {
                    status: { order: 'asc' }
                },
                {
                    createdAt: { order: 'desc' }
                }
            ]
        });

        const bundles = response.hits.hits.map((hit: any) => ({
            bundleId: hit._id,
            ...hit._source
        }));

        return NextResponse.json({ bundles });
    } catch (error) {
        console.error(`Error fetching bundles for application ${applicationId}:`, error);
        return NextResponse.json({ error: 'Failed to fetch bundles' }, { status: 500 });
    }
}
