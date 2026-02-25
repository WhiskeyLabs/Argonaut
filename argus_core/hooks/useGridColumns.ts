/**
 * useGridColumns — Task 6.2.3.2
 *
 * Resolves visible columns by merging COLUMN_REGISTRY with Dexie-persisted
 * user preferences. Provides helpers to update individual column preferences
 * and reset all to defaults.
 *
 * Precedence: User Override > Auto-Show > Default Visible
 */

import { useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
    COLUMN_REGISTRY,
    ColumnMeta,
    GridColumnPreference,
    SessionStats,
    resolveVisibleColumns,
    applyWidthPreferences,
} from '@/components/grid/columns';

const PREFS_KEY = 'grid_columns_preference';

export interface UseGridColumnsResult {
    /** Resolved visible columns with user width overrides applied */
    columns: ColumnMeta[];
    /** Full registry for the column picker UI */
    registry: ColumnMeta[];
    /** Raw preferences from Dexie */
    preferences: GridColumnPreference[];
    /** Toggle visibility of a single column */
    toggleColumn: (columnId: string, visible: boolean) => Promise<void>;
    /** Update width of a single column */
    updateWidth: (columnId: string, width: number) => Promise<void>;
    /** Reset all preferences to defaults */
    resetAll: () => Promise<void>;
}

export function useGridColumns(sessionStats: SessionStats): UseGridColumnsResult {
    // Live-read preferences from Dexie
    const setting = useLiveQuery(
        () => db.settings.get(PREFS_KEY),
        [],
        undefined
    );

    const preferences: GridColumnPreference[] = setting?.value ?? [];

    // Resolved visible columns
    const columns = useMemo(() => {
        const visible = resolveVisibleColumns(COLUMN_REGISTRY, sessionStats, preferences);
        return applyWidthPreferences(visible, preferences);
    }, [sessionStats, preferences]);

    // --- Write helpers ---

    const toggleColumn = useCallback(async (columnId: string, visible: boolean) => {
        const current: GridColumnPreference[] = (await db.settings.get(PREFS_KEY))?.value ?? [];
        const existing = current.find(p => p.columnId === columnId);

        let next: GridColumnPreference[];
        if (existing) {
            next = current.map(p => p.columnId === columnId ? { ...p, visible } : p);
        } else {
            next = [...current, { columnId, visible }];
        }

        await db.settings.put({ key: PREFS_KEY, value: next });
    }, []);

    const updateWidth = useCallback(async (columnId: string, width: number) => {
        const current: GridColumnPreference[] = (await db.settings.get(PREFS_KEY))?.value ?? [];
        const existing = current.find(p => p.columnId === columnId);

        let next: GridColumnPreference[];
        if (existing) {
            next = current.map(p => p.columnId === columnId ? { ...p, width } : p);
        } else {
            next = [...current, { columnId, visible: true, width }];
        }

        await db.settings.put({ key: PREFS_KEY, value: next });
    }, []);

    const resetAll = useCallback(async () => {
        await db.settings.delete(PREFS_KEY);
    }, []);

    return {
        columns,
        registry: COLUMN_REGISTRY,
        preferences,
        toggleColumn,
        updateWidth,
        resetAll,
    };
}
