import { NextResponse } from 'next/server';

const EPSS_API_URL = 'https://api.first.org/data/v1/epss';

export async function GET(req: Request) {
    if (req.headers.get('x-argus-privacy-intent') !== 'ti-public-enrichment') {
        return NextResponse.json(
            { error: 'Privacy policy denied', code: 'PRIVACY_EGRESS_BLOCKED' },
            { status: 403 }
        );
    }

    const { searchParams } = new URL(req.url);
    const cve = searchParams.get('cve');
    if (!cve) {
        return NextResponse.json(
            { error: 'Missing required query parameter: cve' },
            { status: 400 }
        );
    }

    try {
        const upstream = await fetch(`${EPSS_API_URL}?cve=${encodeURIComponent(cve)}`);
        if (!upstream.ok) {
            return NextResponse.json(
                { error: `Upstream EPSS error: ${upstream.status}` },
                { status: upstream.status }
            );
        }
        const data = await upstream.json();
        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json(
            {
                error: 'Failed to fetch EPSS data',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 503 }
        );
    }
}
