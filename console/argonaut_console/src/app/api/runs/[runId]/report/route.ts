import { NextResponse } from 'next/server';
import { generateReportSummary } from '@/lib/reportEngine';
import { publishReportToSlack } from '@/lib/slackService';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ runId: string }> }
) {
    try {
        const { runId } = await params;

        // 1. Generate the report summary (handles idempotency for the action record)
        console.log(`[API_REPORT] Manually triggering report for run: ${runId}`);
        const report = await generateReportSummary(runId);

        // 2. Publish to Slack (handles idempotency for the slack post)
        const slackRes = await publishReportToSlack(runId, report);

        return NextResponse.json({
            success: true,
            report,
            slackStatus: slackRes.status,
            slackIdempotencyKey: slackRes.idempotencyKey
        });
    } catch (error: any) {
        console.error('Error generating manual report:', error);
        return NextResponse.json({
            error: 'Internal Server Error',
            details: error.message
        }, { status: 500 });
    }
}
