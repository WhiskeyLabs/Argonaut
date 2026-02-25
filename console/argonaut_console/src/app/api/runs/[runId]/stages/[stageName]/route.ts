import { NextResponse } from 'next/server';
import { stageService } from '@/lib/stageService';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ runId: string; stageName: string }> }
) {
    try {
        const { runId, stageName } = await params;
        const stage = await stageService.getStage(runId, stageName);

        if (!stage) {
            return NextResponse.json({ status: 'NOT_STARTED' });
        }

        return NextResponse.json(stage);
    } catch (error: any) {
        console.error('Error fetching stage status:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
