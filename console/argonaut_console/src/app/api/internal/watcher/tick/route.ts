import { NextResponse } from 'next/server';
import { runWatcherTick } from '@/lib/watcher/runWatcherTick';

/**
 * Endpoint to manually trigger the background watcher tick.
 * Useful for debugging, integration testing, and external cron invocations.
 */
export async function POST(req: Request) {
    try {
        const result = await runWatcherTick();
        return NextResponse.json({ success: true, result });
    } catch (error: any) {
        console.error('[API] /internal/watcher/tick Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
