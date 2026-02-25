'use client';

import React, { useState, useEffect } from 'react';
import { Search, Filter, X, Check, ChevronDown, Download } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { FindingsFilter, FacetCounts } from '../../hooks/useFindingsQuery';
import { Severity, FindingStatus } from '../../lib/types/finding';
import { ColumnMeta, GridColumnPreference, SessionStats } from './columns';
import { ColumnPicker } from './ColumnPicker';

interface FindingsToolbarProps {
    filter: FindingsFilter;
    onFilterChange: (newFilter: FindingsFilter) => void;
    facetCounts: FacetCounts;
    scopeCount: number;   // Funnel-stage count (for search placeholder)
    totalCount: number;   // Visible count after all filters
    onExportClick?: () => void;
    // Column Picker props
    registry?: ColumnMeta[];
    preferences?: GridColumnPreference[];
    sessionStats?: SessionStats;
    onColumnToggle?: (columnId: string, visible: boolean) => void;
    onColumnReset?: () => void;
}

export function FindingsToolbar({ filter, onFilterChange, facetCounts, scopeCount, totalCount, onExportClick, registry, preferences, sessionStats, onColumnToggle, onColumnReset }: FindingsToolbarProps) {
    const [searchValue, setSearchValue] = useState('');

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const term = searchValue.trim();
            if (term) {
                const currentSearch = filter.search || [];
                // Prevent duplicates if desired, or allow them. Let's start with unique.
                if (!currentSearch.includes(term)) {
                    onFilterChange({ ...filter, search: [...currentSearch, term] });
                }
                setSearchValue('');
            }
        }
    };

    const removeSearchToken = (term: string) => {
        const currentSearch = filter.search || [];
        const nextSearch = currentSearch.filter(t => t !== term);
        onFilterChange({ ...filter, search: nextSearch.length ? nextSearch : undefined });
    };

    const toggleSeverity = (sev: Severity) => {
        const current = filter.severity || [];
        const next = current.includes(sev)
            ? current.filter(s => s !== sev)
            : [...current, sev];
        onFilterChange({ ...filter, severity: next.length ? next : undefined });
    };

    const toggleStatus = (status: FindingStatus) => {
        const current = filter.status || [];
        const next = current.includes(status)
            ? current.filter(s => s !== status)
            : [...current, status];
        onFilterChange({ ...filter, status: next.length ? next : undefined });
    };

    const hasFilters = (filter.search && filter.search.length > 0) || filter.severity?.length || filter.status?.length;

    return (
        <div className="flex flex-col border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
            <div className="flex items-center space-x-4 p-4">
                {/* Search Input */}
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder={`Search ${scopeCount} findings... (Press Enter to add tag)`}
                        className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-800 rounded-md bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        value={searchValue}
                        onChange={(e) => setSearchValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    {searchValue && (
                        <button
                            onClick={() => setSearchValue('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* Severity Filter */}
                <FilterPopover
                    label="Severity"
                    activeCount={filter.severity?.length}
                >
                    <div className="p-2 min-w-[200px] flex flex-col space-y-1">
                        {['critical', 'high', 'medium', 'low', 'info'].map((sev) => (
                            <button
                                key={sev}
                                onClick={() => toggleSeverity(sev as Severity)}
                                className="flex items-center justify-between px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors bg-transparent border-none w-full cursor-pointer"
                            >
                                <div className="flex items-center space-x-2">
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${filter.severity?.includes(sev as Severity)
                                        ? 'bg-blue-600 border-blue-600 text-white'
                                        : 'border-gray-300 dark:border-gray-600'
                                        }`}>
                                        {filter.severity?.includes(sev as Severity) && <Check className="h-3 w-3" />}
                                    </div>
                                    <span className="capitalize text-gray-700 dark:text-gray-300">{sev}</span>
                                </div>
                                <span className="text-xs text-gray-400">
                                    {facetCounts.bySeverity[sev as Severity] || 0}
                                </span>
                            </button>
                        ))}
                    </div>
                </FilterPopover>

                {/* Status Filter */}
                <FilterPopover
                    label="Status"
                    activeCount={filter.status?.length}
                >
                    <div className="p-2 min-w-[200px] flex flex-col space-y-1">
                        {['open', 'fixed', 'ignored', 'snoozed'].map((status) => (
                            <button
                                key={status}
                                onClick={() => toggleStatus(status as FindingStatus)}
                                className="flex items-center justify-between px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors bg-transparent border-none w-full cursor-pointer"
                            >
                                <div className="flex items-center space-x-2">
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${filter.status?.includes(status as FindingStatus)
                                        ? 'bg-blue-600 border-blue-600 text-white'
                                        : 'border-gray-300 dark:border-gray-600'
                                        }`}>
                                        {filter.status?.includes(status as FindingStatus) && <Check className="h-3 w-3" />}
                                    </div>
                                    <span className="capitalize text-gray-700 dark:text-gray-300">{status}</span>
                                </div>
                                <span className="text-xs text-gray-400">
                                    {facetCounts.byStatus[status as FindingStatus] || 0}
                                </span>
                            </button>
                        ))}
                    </div>
                </FilterPopover>

                {/* Reset Stats (Legacy/Mobile support or fallback) */}
                {hasFilters ? (
                    <button
                        onClick={() => onFilterChange({ ...filter, severity: undefined, status: undefined, toolId: undefined, search: undefined })}
                        className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 whitespace-nowrap"
                    >
                        Clear All
                    </button>
                ) : null}

                {/* Column Picker */}
                {registry && preferences && sessionStats && onColumnToggle && onColumnReset && (
                    <ColumnPicker
                        registry={registry}
                        preferences={preferences}
                        sessionStats={sessionStats}
                        onToggle={onColumnToggle}
                        onReset={onColumnReset}
                    />
                )}

                {/* Export Button */}
                <button
                    onClick={onExportClick}
                    className="flex items-center space-x-2 px-3 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-all shadow-sm active:scale-95 whitespace-nowrap ml-2"
                >
                    <Download className="h-4 w-4" />
                    <span>Export</span>
                </button>
            </div>

            {/* Active Filters Row (Capsules) */}
            {hasFilters && (
                <div className="flex flex-wrap items-center gap-2 px-4 pb-3 animate-in fade-in slide-in-from-top-1 duration-200">
                    {filter.search?.map(term => (
                        <FilterCapsule
                            key={term}
                            label={`Search: "${term}"`}
                            onRemove={() => removeSearchToken(term)}
                        />
                    ))}
                    {filter.severity?.map(sev => (
                        <FilterCapsule
                            key={sev}
                            label={`Severity: ${sev}`}
                            onRemove={() => toggleSeverity(sev)}
                        />
                    ))}
                    {filter.status?.map(status => (
                        <FilterCapsule
                            key={status}
                            label={`Status: ${status}`}
                            onRemove={() => toggleStatus(status)}
                        />
                    ))}
                </div>
            )
            }
        </div >
    );
}

// Helper Component for Popovers
function FilterPopover({ label, activeCount, children }: { label: string; activeCount?: number; children: React.ReactNode }) {
    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                <button
                    className={`
            flex items-center space-x-2 px-3 py-2 text-sm font-medium border rounded-md transition-all
            ${activeCount
                            ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300'
                            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800'
                        }
          `}
                >
                    <Filter className="h-3.5 w-3.5" />
                    <span>{label}</span>
                    {activeCount ? (
                        <span className="ml-1 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 text-[10px] px-1.5 rounded-full">
                            {activeCount}
                        </span>
                    ) : (
                        <ChevronDown className="h-3 w-3 opacity-50" />
                    )}
                </button>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    className="z-50 bg-white dark:bg-gray-950 rounded-md shadow-lg border border-gray-200 dark:border-gray-800 focus:outline-none animate-in fade-in zoom-in-95 duration-200"
                    sideOffset={5}
                    align="start"
                >
                    {children}
                    <Popover.Arrow className="fill-gray-200 dark:fill-gray-800" />
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}

function FilterCapsule({ label, onRemove }: { label: string; onRemove: () => void }) {
    return (
        <span className="inline-flex items-center px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/20 text-xs font-medium text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800 shadow-sm">
            {label}
            <button
                onClick={onRemove}
                className="ml-1.5 p-0.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors"
            >
                <X className="h-3 w-3" />
            </button>
        </span>
    );
}
