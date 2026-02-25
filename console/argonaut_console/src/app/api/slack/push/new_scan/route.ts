import { NextResponse } from 'next/server';
import { pushSlackNewScan } from '@/lib/watcher/runWatcherTick';
import esClient from '@/lib/esClient';

/**
 * Manually pushes a Slack notification for a specific bundle.
 * Uses the idempotent `pushSlackNewScan` function which is safe against multi-delivery.
 */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { bundleId } = body;

        if (!bundleId) {
            return NextResponse.json({ error: 'Missing bundleId in request body' }, { status: 400 });
        }

        // Fetch the bundle to get the applicationId
        const bundleRes = await esClient.get({
            index: 'argonaut_bundle_registry',
            id: bundleId
        });

        const doc = bundleRes._source as any;
        if (!doc) {
            return NextResponse.json({ error: 'Bundle not found' }, { status: 404 });
        }

        const applicationId = doc.applicationId || doc.repo || 'unknown_app';

        await pushSlackNewScan(applicationId, bundleId);

        return NextResponse.json({ success: true, message: `Slack push initiated for ${bundleId}` });
    } catch (error: any) {
        console.error('[API] /slack/push/new_scan Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
