import { NextResponse } from 'next/server';
import client from '@/lib/esClient';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ bundleId: string }> }
) {
    const { bundleId } = await params;

    if (!bundleId) {
        return NextResponse.json({ error: 'Missing bundleId' }, { status: 400 });
    }

    try {
        const response = await client.get({
            index: 'argonaut_bundle_registry',
            id: bundleId
        });

        if (!response || !response._source) {
            return NextResponse.json({ error: 'Bundle not found' }, { status: 404 });
        }

        const bundle = {
            bundleId: response._id,
            ...(response._source as any)
        };

        return NextResponse.json({ bundle });

    } catch (error: any) {
        if (error.meta && error.meta.statusCode === 404) {
            return NextResponse.json({ error: 'Bundle not found' }, { status: 404 });
        }
        console.error(`Error fetching bundle data for ID ${bundleId}:`, error);
        return NextResponse.json({ error: 'Failed to fetch bundle' }, { status: 500 });
    }
}
