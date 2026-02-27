/**
 * Fix Agent — PM2 Standalone Process
 *
 * Polls Elasticsearch for FIX_REQUEST actions every POLL_INTERVAL_MS.
 * Runs as: pm2 start npm --name argonaut_fix_agent -- run fixagent:start
 */

const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

console.log('🔧 Starting Argonaut Fix Agent Process...');

const intervalMs = process.env.FIX_AGENT_POLL_MS ? parseInt(process.env.FIX_AGENT_POLL_MS, 10) : 10000;

async function start() {
    console.log(`📡 Fix Agent starting. Interval: ${intervalMs}ms`);

    try {
        console.log('[FIX_AGENT] Importing runFixAgentTick...');
        // Dynamic import to ensure ES client doesn't initialize before dotenv
        const { runFixAgentTick } = await import('../src/lib/fixAgent/runFixAgentTick');
        console.log('[FIX_AGENT] Import successful.');

        while (true) {
            try {
                const result = await runFixAgentTick();
                if (result.processed > 0 || result.skipped > 0) {
                    console.log(`[FIX_AGENT] Tick completed. Processed: ${result.processed}, Skipped: ${result.skipped}`);
                }
            } catch (err) {
                console.error('[FIX_AGENT] Unexpected error in tick loop:', err);
            }
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
    } catch (err) {
        console.error('[FIX_AGENT] Critical initialization error:', err);
        process.exit(1);
    }
}

start();
