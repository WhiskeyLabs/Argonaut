/**
 * Fix Agent Auth
 *
 * Shared secret header validation for service-to-service calls.
 */

import { NextRequest, NextResponse } from 'next/server';

const FIX_AGENT_SECRET = process.env.FIX_AGENT_SECRET || '';

/**
 * Validates the X-Agent-Key header against the FIX_AGENT_SECRET env var.
 * Returns null if valid, or a 401 NextResponse if invalid.
 */
export function validateAgentKey(req: NextRequest): NextResponse | null {
    const key = req.headers.get('X-Agent-Key');
    if (!FIX_AGENT_SECRET || key !== FIX_AGENT_SECRET) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    }
    return null;
}
