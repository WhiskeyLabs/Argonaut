import { NextRequest, NextResponse } from 'next/server';

// Configuration via Env Vars (with defaults for Local)
const AI_ENDPOINT = process.env.AI_ENDPOINT || 'http://172.239.44.229:8000/v1/chat/completions';
const AI_API_KEY = process.env.AI_API_KEY; // Optional for local, required for remote

function hasValidPrivacyIntent(req: NextRequest): boolean {
    return req.headers.get('x-argus-privacy-intent') === 'ai-cloud-assistance';
}

export async function POST(req: NextRequest) {
    if (!hasValidPrivacyIntent(req)) {
        return NextResponse.json(
            { error: 'Privacy policy denied', code: 'PRIVACY_EGRESS_BLOCKED' },
            { status: 403 }
        );
    }

    try {
        const body = await req.json();

        // 1. Prepare headers for upstream
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (AI_API_KEY) {
            headers['Authorization'] = `Bearer ${AI_API_KEY}`;
        }

        // 2. Proxy request
        const res = await fetch(AI_ENDPOINT, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                ...body,
                // Enforce safe defaults if not provided
                stream: false,
            }),
        });

        if (!res.ok) {
            const errorText = await res.text();
            return NextResponse.json(
                { error: `Upstream AI Error: ${res.status}`, details: errorText },
                { status: res.status }
            );
        }

        const data = await res.json();
        return NextResponse.json(data);

    } catch (error: unknown) {
        console.error('AI Proxy Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: 'Internal Server Error', details: errorMessage },
            { status: 500 }
        );
    }
}

export async function GET(req: NextRequest) {
    if (!hasValidPrivacyIntent(req)) {
        return NextResponse.json(
            { error: 'Privacy policy denied', code: 'PRIVACY_EGRESS_BLOCKED' },
            { status: 403 }
        );
    }

    try {
        // Construct upstream models endpoint
        // e.g. .../v1/chat/completions -> .../v1/models
        const modelsEndpoint = AI_ENDPOINT.replace('/chat/completions', '/models');

        const headers: Record<string, string> = {};
        if (AI_API_KEY) {
            headers['Authorization'] = `Bearer ${AI_API_KEY}`;
        }

        const res = await fetch(modelsEndpoint, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(2000), // Fast timeout for availability check
        });

        if (!res.ok) {
            return NextResponse.json(
                { error: 'Upstream Unreachable' },
                { status: 503 }
            );
        }

        const data = await res.json();
        return NextResponse.json(data);

    } catch (error) {
        return NextResponse.json(
            { error: 'Service Unavailable' },
            { status: 503 }
        );
    }
}
