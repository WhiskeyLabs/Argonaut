'use client';

import React from 'react';
import { Columns3, RotateCcw, Check } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { ColumnMeta, GridColumnPreference, ColumnCategory, SessionStats, COLUMN_REGISTRY } from './columns';

interface ColumnPickerProps {
    registry: ColumnMeta[];
    preferences: GridColumnPreference[];
    sessionStats: SessionStats;
    onToggle: (columnId: string, visible: boolean) => void;
    onReset: () => void;
}

const CATEGORY_LABELS: Record<ColumnCategory, string> = {
    signal: 'Signals',
    context: 'Context',
    metadata: 'Metadata',
};

const CATEGORY_ORDER: ColumnCategory[] = ['signal', 'context', 'metadata'];

function isColumnVisible(
    col: ColumnMeta,
    preferences: GridColumnPreference[],
    sessionStats: SessionStats
): boolean {
    const pref = preferences.find(p => p.columnId === col.id);
    if (pref !== undefined) return pref.visible;
    if (col.autoShow) return col.autoShow(sessionStats);
    return col.defaultVisible;
}

export function ColumnPicker({ registry, preferences, sessionStats, onToggle, onReset }: ColumnPickerProps) {
    const hasOverrides = preferences.length > 0;

    // Group by category
    const grouped = CATEGORY_ORDER.map(cat => ({
        category: cat,
        label: CATEGORY_LABELS[cat],
        columns: registry.filter(c => c.category === cat),
    })).filter(g => g.columns.length > 0);

    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                <button
                    className="flex items-center space-x-2 px-3 py-2 text-sm font-medium border rounded-md transition-all bg-white border-gray-200 text-gray-700 hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800"
                    title="Show/hide columns"
                >
                    <Columns3 className="h-3.5 w-3.5" />
                    <span>Columns</span>
                </button>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    className="z-50 w-64 bg-white dark:bg-gray-950 rounded-lg shadow-xl border border-gray-200 dark:border-gray-800 focus:outline-none animate-in fade-in zoom-in-95 duration-200"
                    sideOffset={5}
                    align="end"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 dark:border-gray-800">
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Grid Columns
                        </span>
                        {hasOverrides && (
                            <button
                                onClick={onReset}
                                className="flex items-center gap-1 text-[10px] text-red-500 hover:text-red-700 font-medium transition-colors"
                                title="Reset to defaults"
                            >
                                <RotateCcw className="h-3 w-3" />
                                Reset
                            </button>
                        )}
                    </div>

                    {/* Column Groups */}
                    <div className="max-h-80 overflow-y-auto py-1">
                        {grouped.map(group => (
                            <div key={group.category}>
                                <div className="px-3 pt-2.5 pb-1">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600">
                                        {group.label}
                                    </span>
                                </div>
                                {group.columns.map(col => {
                                    const visible = isColumnVisible(col, preferences, sessionStats);
                                    const pref = preferences.find(p => p.columnId === col.id);
                                    const isAutoShown = !pref && col.autoShow && col.autoShow(sessionStats);

                                    return (
                                        <button
                                            key={col.id}
                                            onClick={() => onToggle(col.id, !visible)}
                                            className="flex items-center justify-between w-full px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors bg-transparent border-none cursor-pointer"
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${visible
                                                    ? 'bg-blue-600 border-blue-600 text-white'
                                                    : 'border-gray-300 dark:border-gray-600'
                                                    }`}>
                                                    {visible && <Check className="h-3 w-3" />}
                                                </div>
                                                <span className="text-gray-700 dark:text-gray-300 text-xs">
                                                    {col.label}
                                                </span>
                                                {isAutoShown && (
                                                    <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                                                        Auto
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </div>

                    <Popover.Arrow className="fill-gray-200 dark:fill-gray-800" />
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
