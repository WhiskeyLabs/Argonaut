import { NextResponse } from 'next/server';
import { simulateWorkflowRun } from '@/lib/watcher/runWatcherTick';
import esClient from '@/lib/esClient';

/**
 * Manually starts a run for a bundle. Updates statuses, creates run and task logs.
 * Does NOT trigger Slack notification directly.
 */
export async function POST(req: Request, { params }: { params: Promise<{ bundleId: string }> }) {
    try {
        const urlParams = await params;
        const bundleId = urlParams.bundleId;

        if (!bundleId) {
            return NextResponse.json({ error: 'Missing bundleId' }, { status: 400 });
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
        const runId = `run_manual_${Date.now()}_${bundleId.substring(0, 6).trim()}`;

        // Update bundle to PROCESSING
        await esClient.update({
            index: 'argonaut_bundle_registry',
            id: bundleId,
            doc: { status: 'PROCESSING' }
        });

        // Run the simulation
        await simulateWorkflowRun(bundleId, applicationId, runId);

        // Update bundle to PROCESSED
        await esClient.update({
            index: 'argonaut_bundle_registry',
            id: bundleId,
            doc: {
                status: 'PROCESSED',
                lastRunId: runId,
                processedAt: new Date().toISOString()
            }
        });

        return NextResponse.json({ success: true, runId });
    } catch (error: any) {
        console.error('[API] /bundles/:id/run Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
