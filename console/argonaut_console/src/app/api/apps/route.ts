import { NextResponse } from 'next/server';
import client from '@/lib/esClient';

export async function GET() {
    try {
        const response = await client.search({
            index: 'argonaut_bundle_registry',
            size: 0,
            query: {
                match_all: {}
            },
            aggs: {
                applications: {
                    terms: {
                        field: 'applicationId',
                        missing: 'unknown_app',
                        size: 1000
                    },
                    aggs: {
                        statuses: {
                            terms: {
                                field: 'status',
                                size: 10
                            }
                        },
                        recent_bundles: {
                            top_hits: {
                                size: 5,
                                sort: [
                                    {
                                        createdAt: {
                                            order: 'desc'
                                        }
                                    }
                                ],
                                _source: {
                                    includes: ['bundleId', 'buildId', 'createdAt', 'status', 'lastRunId', 'activeRunId']
                                }
                            }
                        }
                    }
                }
            }
        });

        const apps = (response.aggregations?.applications as any)?.buckets.map((bucket: any) => {
            const statuses = bucket.statuses.buckets.reduce((acc: any, statusBucket: any) => {
                acc[statusBucket.key] = statusBucket.doc_count;
                return acc;
            }, { NEW: 0, PROCESSED: 0, FAILED: 0 });

            const recentBundles = bucket.recent_bundles.hits.hits.map((hit: any) => hit._source);

            return {
                applicationId: bucket.key,
                applicationName: bucket.key,
                totalBundles: bucket.doc_count,
                statusCounts: statuses,
                latestBundle: recentBundles[0] || null,
                recentBundles
            };
        });

        return NextResponse.json({ apps });
    } catch (error) {
        console.error('Error fetching applications:', error);
        return NextResponse.json({ error: 'Failed to fetch applications' }, { status: 500 });
    }
}
