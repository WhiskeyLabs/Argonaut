import { NextResponse } from 'next/server';
import esClient from '@/lib/esClient';

const INDEX_RUNS = 'argonaut_runs';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ runId: string }> }
) {
    try {
        const { runId } = await params;

        const res = await esClient.get({
            index: INDEX_RUNS,
            id: runId
        });

        if (!res) {
            return NextResponse.json({ error: 'Run not found' }, { status: 404 });
        }

        const run = (res as any)._source;

        return NextResponse.json({ run });
    } catch (error: any) {
        if (error.meta?.statusCode === 404) {
            return NextResponse.json({ error: 'Run not found' }, { status: 404 });
        }
        console.error('Error fetching run:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
