import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';

// Configuration - same as parent route
const GPU_ENDPOINT = process.env.AI_ENDPOINT?.replace('/chat/completions', '') || 'http://172.239.44.229:8000/v1';

export async function GET(req: NextRequest) {
    if (req.headers.get('x-argus-privacy-intent') !== 'ai-cloud-assistance') {
        return NextResponse.json(
            { error: 'Privacy policy denied', code: 'PRIVACY_EGRESS_BLOCKED' },
            { status: 403 }
        );
    }

    try {
        const res = await fetch(`${GPU_ENDPOINT}/models`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!res.ok) {
            return NextResponse.json(
                { error: `Upstream error: ${res.status}` },
                { status: res.status }
            );
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error: unknown) {
        console.error('Models fetch error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch models', details: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
