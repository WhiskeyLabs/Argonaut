import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { UniversalFinding } from '../lib/types/finding';

/**
 * Loads finding objects for a specific list of IDs.
 * Used by the Virtual Grid to hydrate only the visible rows.
 * 
 * Performance:
 * - Uses db.findings.bulkGet(ids) which is highly optimized in Dexie.
 * - This batching avoids the "N+1" query problem of fetching per-row.
 * - Used in conjunction with React Virtual, this ensures we only ever fetch
 *   20-30 rows at a time, even for 100k datasets.
 */
export function useFindingsBatchLoader(ids: string[]): UniversalFinding[] {
    return useLiveQuery(
        async () => {
            // 1. Safety Check
            if (!ids || ids.length === 0) return [];

            // 2. Bulk Fetch
            // Dexie bulkGet returns items in the SAME order as the keys, 
            // or undefined if missing.
            const items = await db.findings.bulkGet(ids);

            // 3. Filter Safe
            // Filter out any undefineds (shouldn't happen unless race condition with delete)
            return items.filter((item): item is UniversalFinding => !!item);
        },
        [JSON.stringify(ids)], // Only re-fetch if the *list of IDs* specifically changes
        [] // default result
    );
}
