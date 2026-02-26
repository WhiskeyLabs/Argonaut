import { NextResponse } from 'next/server';
import client from '@/lib/esClient';

export async function GET() {
    try {
        const [runs, findings, bundles, tasklogs] = await Promise.all([
            client.count({ index: 'argonaut_runs' }).catch(() => ({ count: 0 })),
            client.count({ index: 'argonaut_findings' }).catch(() => ({ count: 0 })),
            client.count({ index: 'argonaut_bundle_registry' }).catch(() => ({ count: 0 })),
            client.count({ index: 'argonaut_tasklogs' }).catch(() => ({ count: 0 })),
        ]);

        return NextResponse.json({
            runs: runs.count,
            findings: findings.count,
            bundles: bundles.count,
            tasklogs: tasklogs.count,
        });
    } catch (error) {
        console.error('Stats fetch failed:', error);
        return NextResponse.json({
            runs: 0,
            findings: 0,
            bundles: 0,
            tasklogs: 0,
        }, { status: 500 });
    }
}
