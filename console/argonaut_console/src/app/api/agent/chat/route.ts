/**
 * POST /api/agent/chat
 *
 * Backend route for the ASK ARGONAUT chat feature.
 * Proxies user questions to the Elastic Agent Builder AI Agent
 * with a grounded Run Context Packet.
 *
 * Phase 1: Q&A only — no tool execution, no writes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendAgentChat, ChatRequest } from '@/lib/agentChat';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { runId, message, conversationId, context } = body;

        // Validate required fields
        if (!runId || typeof runId !== 'string') {
            return NextResponse.json({ error: 'runId is required' }, { status: 400 });
        }

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return NextResponse.json({ error: 'message is required' }, { status: 400 });
        }

        if (message.length > 2000) {
            return NextResponse.json({ error: 'Message too long (max 2000 chars)' }, { status: 400 });
        }

        const request: ChatRequest = {
            runId,
            message: message.trim(),
            conversationId,
            context,
        };

        const response = await sendAgentChat(request);

        return NextResponse.json(response);

    } catch (err: any) {
        console.error('[/api/agent/chat] Error:', err);
        return NextResponse.json(
            { error: err.message || 'Internal error' },
            { status: 500 }
        );
    }
}
