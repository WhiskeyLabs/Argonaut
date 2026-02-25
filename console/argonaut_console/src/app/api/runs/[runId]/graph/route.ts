import { NextResponse } from 'next/server';
import esClient from '@/lib/esClient';

const INDEX_GRAPH_VIEWS = 'argonaut_graph_views';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ runId: string }> }
) {
    try {
        const params_res = await params;
        const runId = (params_res.runId || '').trim();

        const res = await esClient.search({
            index: INDEX_GRAPH_VIEWS,
            query: {
                prefix: { runId }
            },
            size: 1
        });

        const hits = res.hits.hits;
        if (!hits || hits.length === 0) {
            return NextResponse.json({ error: 'Graph not found' }, { status: 404 });
        }

        const graph = (hits[0] as any)._source;

        return NextResponse.json({ graph });
    } catch (error: any) {
        console.error('Error fetching graph:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
