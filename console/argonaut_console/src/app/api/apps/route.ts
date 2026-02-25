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
                        script: {
                            source: "def appId = doc['applicationId'].size() > 0 ? doc['applicationId'].value : (doc['repo'].size() > 0 ? doc['repo'].value : 'unknown_app'); return appId;",
                            lang: 'painless'
                        },
                        size: 1000
                    },
                    aggs: {
                        app_name: {
                            terms: {
                                script: {
                                    source: "def appId = doc['applicationId'].size() > 0 ? doc['applicationId'].value : (doc['repo'].size() > 0 ? doc['repo'].value : 'unknown_app'); return appId;",
                                    lang: 'painless'
                                },
                                size: 1
                            }
                        },
                        statuses: {
                            terms: {
                                field: 'status',
                                size: 10
                            }
                        },
                        latest_bundle: {
                            top_hits: {
                                size: 1,
                                sort: [
                                    {
                                        createdAt: {
                                            order: 'desc'
                                        }
                                    }
                                ],
                                _source: {
                                    includes: ['createdAt', 'status']
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

            const latestBundleHit = bucket.latest_bundle.hits.hits[0];
            const latestBundle = latestBundleHit ? latestBundleHit._source : null;

            return {
                applicationId: bucket.key,
                applicationName: bucket.app_name.buckets[0]?.key || bucket.key,
                totalBundles: bucket.doc_count,
                statusCounts: statuses,
                latestBundle
            };
        });

        return NextResponse.json({ apps });
    } catch (error) {
        console.error('Error fetching applications:', error);
        return NextResponse.json({ error: 'Failed to fetch applications' }, { status: 500 });
    }
}
