import { NextResponse } from 'next/server';
import { runThreatIntelWithLock } from '@/lib/watcher/enrichThreatIntel';
import esClient from '@/lib/esClient';

export async function POST(req: Request, { params }: { params: Promise<{ runId: string }> }) {
    const { runId } = await params;

    if (!runId) {
        return NextResponse.json({ error: 'runId is required' }, { status: 400 });
    }

    try {
        // We need bundleId for the enrichment logic Context
        const runRes = await esClient.get({
            index: 'argonaut_runs',
            id: runId
        }) as any;

        const bundleId = runRes._source.bundleId;
        if (!bundleId) {
            return NextResponse.json({ error: 'Run has no associated bundleId' }, { status: 400 });
        }

        const summary = await runThreatIntelWithLock(runId, bundleId);

        return NextResponse.json({ success: true, summary });
    } catch (err: any) {
        if (err.message === 'Enrichment already running') {
            return NextResponse.json({ error: err.message }, { status: 409 });
        }
        console.error('[ThreatIntel] API Route error:', err);
        return NextResponse.json({ error: 'Internal Server Error', details: err.message }, { status: 500 });
    }
}
