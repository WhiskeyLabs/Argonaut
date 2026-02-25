import { NextResponse } from 'next/server';
import esClient from '@/lib/esClient';

const INDEX_TASKLOGS = 'argonaut_tasklogs';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ runId: string }> }
) {
    try {
        const { runId } = await params;
        const { searchParams } = new URL(request.url);

        const limit = parseInt(searchParams.get('limit') || '200', 10);
        const afterSeq = searchParams.get('afterSeq');

        const query: any = {
            bool: {
                filter: [
                    { term: { 'runId': runId } }
                ]
            }
        };

        if (afterSeq) {
            query.bool.filter.push({
                range: {
                    seq: { gt: parseInt(afterSeq, 10) }
                }
            });
        }

        const res = await esClient.search({
            index: INDEX_TASKLOGS,
            size: Math.min(limit, 1000), // Max 1000
            query,
            sort: [
                { seq: { order: 'asc' } }
            ]
        });

        const logs = res.hits.hits.map(h => ({
            id: h._id,
            ...(h._source as any)
        }));

        return NextResponse.json({ logs });
    } catch (error: any) {
        console.error('Error fetching tasklogs:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
