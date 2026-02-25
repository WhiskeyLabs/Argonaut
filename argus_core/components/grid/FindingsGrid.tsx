import React, { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useFindingsBatchLoader } from '../../hooks/useFindingsBatchLoader';
import { ColumnMeta } from './columns';
import { FindingsSort } from '../../hooks/useFindingsQuery';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight } from 'lucide-react';
import { UniversalFinding } from '@/lib/types/finding';

export type GridItem =
    | { type: 'header'; id: string; label: string; count: number; collapsed?: boolean }
    | { type: 'finding'; id: string };

interface FindingsGridProps {
    items: GridItem[];
    columns: ColumnMeta[];
    preloadedFindingsMap?: Map<string, UniversalFinding>;
    sort: FindingsSort;
    onSortChange: (sort: FindingsSort) => void;
    onGroupToggle?: (groupName: string) => void;
    onFindingClick?: (findingId: string) => void;
    onColumnResize?: (columnId: string, width: number) => void;
    // Selection Props
    selectedIds?: Set<string>;
    onToggleSelect?: (id: string) => void;
    onSelectAll?: () => void;
    onScrollTopChange?: (top: number) => void;
    restoreScrollTop?: number;
    restoreScrollToken?: number;
}

export function FindingsGrid({
    items,
    columns,
    preloadedFindingsMap,
    sort,
    onSortChange,
    onGroupToggle,
    onFindingClick,
    onColumnResize,
    selectedIds,
    onToggleSelect,
    onSelectAll,
    onScrollTopChange,
    restoreScrollTop,
    restoreScrollToken
}: FindingsGridProps) {
    const parentRef = useRef<HTMLDivElement>(null);

    // 0. Column Sizing State
    const [colSizing, setColSizing] = useState<Record<string, number>>({});

    // 1. Virtualizer setup
    const rowVirtualizer = useVirtualizer({
        count: items.length,
        getScrollElement: () => parentRef.current,
        estimateSize: (i) => items[i].type === 'header' ? 30 : 44, // Action headers 30px, finding rows 44px
        overscan: 10,
    });

    // 2. Data Fetching for Visible Rows
    const virtualItems = rowVirtualizer.getVirtualItems();

    // Logic to determine which IDs are currently needed (only for findings)
    const neededIds = virtualItems
        .map(v => items[v.index])
        .filter((item): item is Extract<GridItem, { type: 'finding' }> => item.type === 'finding')
        .map(item => item.id);

    // De-duplicate neededIds just in case
    const uniqueNeededIds = Array.from(new Set(neededIds));

    const usePreloaded = !!preloadedFindingsMap && preloadedFindingsMap.size > 0;
    const findingsData = useFindingsBatchLoader(usePreloaded ? [] : uniqueNeededIds);

    // 3. O(1) Access Map
    const hydratedFindingsMap = useMemo(
        () => new Map(findingsData.map(f => [f.id, f])),
        [findingsData]
    );
    const findingsMap = usePreloaded ? (preloadedFindingsMap as Map<string, UniversalFinding>) : hydratedFindingsMap;

    // --- Handlers ---

    // Header Click -> Sort (uses column registry sortField)
    const handleHeaderClick = (colId: string) => {
        const col = columns.find(c => c.id === colId);
        const field = col?.sortField;
        if (!field) return;

        if (sort.field === field) {
            onSortChange({ field, direction: sort.direction === 'asc' ? 'desc' : 'asc' });
        } else {
            const defaultDir = col?.defaultSortDirection || 'asc';
            onSortChange({ field, direction: defaultDir });
        }
    };

    // Column Resize Logic
    const resizingRef = useRef<{ id: string, startX: number, startWidth: number } | null>(null);

    const startResize = (e: React.MouseEvent, colId: string, currentWidth: number) => {
        e.stopPropagation();
        e.preventDefault();
        resizingRef.current = { id: colId, startX: e.clientX, startWidth: currentWidth };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!resizingRef.current) return;
        const { id, startX, startWidth } = resizingRef.current;
        const diff = e.clientX - startX;
        const newWidth = Math.max(50, startWidth + diff); // Min 50px
        setColSizing(prev => ({ ...prev, [id]: newWidth }));
    };

    const handleMouseUp = () => {
        if (resizingRef.current && onColumnResize) {
            const { id } = resizingRef.current;
            const finalWidth = colSizing[id];
            if (finalWidth) {
                onColumnResize(id, finalWidth);
            }
        }
        resizingRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
    };

    React.useEffect(() => {
        if (!parentRef.current || restoreScrollTop === undefined) return;
        parentRef.current.scrollTop = Math.max(0, restoreScrollTop);
    }, [restoreScrollToken, restoreScrollTop]);

    return (
        <div className="h-full w-full flex flex-col border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-950 shadow-sm overflow-hidden text-sm">

            {/* Header */}
            <div className="flex items-center border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 sticky top-0 z-10 select-none">
                {/* Selection Column Header */}
                <div className="flex items-center justify-center w-[40px] px-2 py-1.5 border-r border-gray-100 dark:border-gray-800">
                    <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded-none border-gray-300 text-blue-600 focus:ring-0 cursor-pointer"
                        onChange={onSelectAll}
                    // Semi-controlled: We don't know if "all" are selected easily here without passing active count
                    // Just act as a trigger for now
                    />
                </div>

                {columns.map(col => {
                    const width = colSizing[col.id] || col.defaultWidth;
                    const isFlex = col.id === 'title' && !colSizing[col.id]; // Vulnerability column flexes

                    const isSorted = sort.field === col.sortField;

                    return (
                        <div
                            key={col.id}
                            className={`relative px-4 py-1.5 font-semibold text-gray-500 uppercase tracking-wider text-left flex items-center group cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors
                                ${isSorted ? 'text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-800' : ''}`}
                            style={{
                                width: isFlex ? undefined : width,
                                flex: isFlex ? 1 : 'none',
                                minWidth: width
                            }}
                            onClick={() => handleHeaderClick(col.id)}
                        >
                            <span className="truncate mr-2">{col.label}</span>
                            {isSorted ? (
                                sort.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                            ) : (
                                <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-30" />
                            )}

                            {/* Resizer Handle */}
                            <div
                                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 active:bg-blue-600 z-20"
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => startResize(e, col.id, width)}
                            />
                        </div>
                    );
                })}
            </div>

            {/* Virtual Scroll Body */}
            <div
                ref={parentRef}
                className="flex-1 overflow-auto" // The Scroll Container
                style={{ contain: 'strict' }} // CSS Performance Hint
                onScroll={(e) => onScrollTopChange?.(e.currentTarget.scrollTop)}
            >
                <div
                    style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative'
                    }}
                >
                    {virtualItems.map((virtualRow) => {
                        const item = items[virtualRow.index];

                        if (item.type === 'header') {
                            return (
                                <div
                                    key={virtualRow.key}
                                    className="absolute left-0 top-0 w-full flex items-center border-y border-gray-200 dark:border-gray-800 bg-gray-50/95 dark:bg-gray-900/95 px-4 py-1 font-medium text-gray-900 dark:text-gray-200 backdrop-blur-sm z-10 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                    style={{
                                        height: `${virtualRow.size}px`,
                                        transform: `translateY(${virtualRow.start}px)`
                                    }}
                                    onClick={() => onGroupToggle?.(item.label)}
                                >
                                    <span className="mr-2 text-gray-400 dark:text-gray-500">
                                        {item.collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                    </span>
                                    <span className="mr-2 text-primary-600 dark:text-primary-500 font-bold uppercase text-xs tracking-wider">Action:</span>
                                    <span>{item.label}</span>
                                    <span className="ml-2 rounded-full bg-gray-200 dark:bg-gray-800 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-400">
                                        {item.count}
                                    </span>
                                </div>
                            );
                        }

                        // Type is 'finding'
                        const finding = findingsMap.get(item.id);
                        const isSelected = selectedIds?.has(item.id);

                        return (
                            <div
                                key={virtualRow.key}
                                className={`absolute left-0 top-0 w-full flex items-center border-b border-gray-100 dark:border-gray-900 transition-colors cursor-pointer
                                    ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-900'}`}
                                style={{
                                    height: `${virtualRow.size}px`,
                                    transform: `translateY(${virtualRow.start}px)`
                                }}
                                onClick={() => onFindingClick?.(item.id)}
                            >
                                {finding ? (
                                    // Render Cells
                                    <>
                                        {/* Selection Checkbox */}
                                        <div
                                            className="flex items-center justify-center w-[40px] h-full border-r border-gray-100 dark:border-gray-800"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onToggleSelect?.(item.id);
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={!!isSelected}
                                                readOnly
                                                className="h-3.5 w-3.5 rounded-none border-gray-300 text-blue-600 focus:ring-0 cursor-pointer pointer-events-none"
                                            // pointer-events-none to let div handle click
                                            />
                                        </div>

                                        {columns.map(col => {
                                            const width = colSizing[col.id] || col.defaultWidth;
                                            const isFlex = col.id === 'title' && !colSizing[col.id];

                                            return (
                                                <div
                                                    key={col.id}
                                                    className="px-4 py-2 overflow-hidden"
                                                    style={{
                                                        width: isFlex ? undefined : width,
                                                        flex: isFlex ? 1 : 'none',
                                                        minWidth: width
                                                    }}
                                                >
                                                    {col.renderCell(finding)}
                                                </div>
                                            );
                                        })}
                                    </>
                                ) : (
                                    // Skeleton State
                                    <div className="px-4 py-2 w-full flex items-center space-x-4 animate-pulse">
                                        <div className="h-4 w-4 bg-gray-200 rounded"></div>
                                        <div className="h-2 w-8 bg-gray-200 rounded"></div>
                                        <div className="h-2 w-12 bg-gray-200 rounded"></div>
                                        <div className="h-2 w-48 bg-gray-200 rounded"></div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

        </div>
    );
}
