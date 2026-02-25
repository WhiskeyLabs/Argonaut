const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

console.log('🚀 Starting Argonaut Watcher Process...');

// Load environment variables via standard process.env checks
const intervalMs = process.env.WATCHER_INTERVAL_MS ? parseInt(process.env.WATCHER_INTERVAL_MS, 10) : 10000;

async function start() {
    console.log(`📡 Watcher starting. Interval: ${intervalMs}ms`);

    try {
        console.log('[WATCHER] Importing runWatcherTick...');
        // Dynamic import to ensure ES client doesn't initialize before dotenv
        const { runWatcherTick } = await import('../src/lib/watcher/runWatcherTick');
        console.log('[WATCHER] Import successful.');

        while (true) {
            try {
                const result = await runWatcherTick();
                if (result.processed > 0) {
                    console.log(`[WATCHER] Tick completed. Processed: ${result.processed}, Skipped: ${result.skipped}`);
                }
            } catch (err) {
                console.error('[WATCHER] Unexpected error in tick loop:', err);
            }
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
    } catch (err) {
        console.error('[WATCHER] Critical initialization error:', err);
        process.exit(1);
    }
}

start();
