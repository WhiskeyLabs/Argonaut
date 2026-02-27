/**
 * Fix Agent — PM2 Standalone Process
 *
 * Polls Elasticsearch for FIX_REQUEST actions every POLL_INTERVAL_MS.
 * Runs as: pm2 start scripts/fixAgent.ts --name argonaut_fix_agent --interpreter tsx
 */

// Load env vars
import dotenv from 'dotenv';
import path from 'path';

// Try loading from the console's .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { runFixAgentTick } from '../src/lib/fixAgent/runFixAgentTick';

const POLL_INTERVAL_MS = parseInt(process.env.FIX_AGENT_POLL_MS || '10000', 10);
const AGENT_NAME = 'argonaut_fix_agent';

let running = false;

async function tick() {
    if (running) return;
    running = true;

    try {
        const result = await runFixAgentTick();
        if (result.processed > 0 || result.skipped > 0) {
            console.log(`[${AGENT_NAME}] Tick result: processed=${result.processed}, skipped=${result.skipped}`);
        }
    } catch (err) {
        console.error(`[${AGENT_NAME}] Error in tick:`, err);
    } finally {
        running = false;
    }
}

console.log(`[${AGENT_NAME}] Starting fix agent (poll every ${POLL_INTERVAL_MS}ms)`);
setInterval(tick, POLL_INTERVAL_MS);

// Run once immediately
tick();

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log(`[${AGENT_NAME}] Received SIGTERM, shutting down...`);
    process.exit(0);
});
process.on('SIGINT', () => {
    console.log(`[${AGENT_NAME}] Received SIGINT, shutting down...`);
    process.exit(0);
});
