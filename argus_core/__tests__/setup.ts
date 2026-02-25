import 'fake-indexeddb/auto';
import { db } from '@/lib/db';

// Mock Fetch
global.fetch = vi.fn();

// Clean DB after each test
afterEach(async () => {
    // Clear all tables
    await Promise.all(db.tables.map(table => table.clear()));
    vi.clearAllMocks();
});
