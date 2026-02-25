'use client';

import React, { useState, useMemo } from 'react';
import { useFindingsQuery, FindingsFilter, FindingsSort } from '../../hooks/useFindingsQuery';
import { useGridColumns } from '../../hooks/useGridColumns';
import { SessionStats } from './columns';
import { FindingsGrid } from './FindingsGrid';
import { FindingsToolbar } from './FindingsToolbar';
import { RightDrawer } from '../dashboard/RightDrawer';
import { Loader2 } from 'lucide-react';

import { useSearchParams } from 'next/navigation';
import { consumeResearchReturnState } from '@/lib/navigation/researchReturnState';

import { FindingStatus } from '@/lib/types/finding';
import { bulkUpdateStatus } from '@/lib/services/findingsActionService';
import { BulkActionsBar } from './BulkActionsBar';
import { ExportModal } from './ExportModal';

interface FindingsViewProps {
    sessionId: string;
}

export function FindingsView({ sessionId }: FindingsViewProps) {
    const searchParams = useSearchParams();
    const stateKey = searchParams.get('stateKey');

    // 1. Local State for View Controls
    const [filter, setFilter] = useState<FindingsFilter>(() => {
        // Initialize from URL params
        const initialFilter: FindingsFilter = {};
        const urlFilter = searchParams.get('filter');

        if (urlFilter === 'dependency-linked') {
            initialFilter.dependencyLinked = true;
        } else if (urlFilter === 'vulnerable') {
            initialFilter.vulnerable = true;
        }
        return initialFilter;
    });

    const [sort, setSort] = useState<FindingsSort>({ field: 'reachabilityRank', direction: 'asc' });
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const [gridScrollTop, setGridScrollTop] = useState(0);
    const [restoreScrollToken, setRestoreScrollToken] = useState(0);

    // Drawer State (Row → Drawer → Research per PRD 6.3.4)
    const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);

    // Multi-Select State (Epic 5)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Export State (Task 5.4)
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);

    // Sync URL params to filter state
    React.useEffect(() => {
        if (stateKey) return;
        const urlFilter = searchParams.get('filter');

        if (urlFilter === 'dependency-linked') {
            setFilter({ dependencyLinked: true });
        } else if (urlFilter === 'vulnerable') {
            setFilter({ vulnerable: true });
        } else if (urlFilter === null) {
            // "Total Assets" clicked -> Clear all filters
            setFilter({});
        }
        // Clear selection on filter change
        setSelectedIds(new Set());
    }, [searchParams, stateKey]);

    React.useEffect(() => {
        if (!stateKey) return;
        const restored = consumeResearchReturnState(stateKey);
        if (!restored || restored.sessionId !== sessionId) return;

        setFilter(restored.filter || {});
        setSort(restored.sort || { field: 'reachabilityRank', direction: 'asc' });
        setCollapsedGroups(new Set(restored.collapsedGroups || []));
        setGridScrollTop(Math.max(0, restored.scrollTop || 0));
        setRestoreScrollToken(prev => prev + 1);
        setSelectedIds(new Set());
    }, [stateKey, sessionId]);

    // 2. The Engine (Query Hook)
    // This is the only place we subscribe to the live query.
    const { resultIds, findings, scopeCount, totalCount, facetCounts, isLoading } = useFindingsQuery(sessionId, filter, sort);
    const preloadedFindingsMap = useMemo(
        () => new Map((findings || []).map(f => [f.id, f])),
        [findings]
    );

    // 2b. Session Stats for column auto-show
    const sessionStats: SessionStats = useMemo(() => {
        const total = findings?.length || 1;
        const uniqueTools = new Set(findings?.map(f => f.toolId) || []).size;
        const scaCount = findings?.filter(f => f.findingType === 'SCA' || !!f.packageName).length || 0;
        const cveCount = findings?.filter(f => !!f.cveId).length || 0;
        return {
            uniqueTools,
            scaFindingsRatio: scaCount / total,
            cveDensity: cveCount / total,
        };
    }, [findings]);

    // 2c. Column Resolution (registry + Dexie prefs + session stats)
    const { columns, registry, preferences, toggleColumn, updateWidth, resetAll } = useGridColumns(sessionStats);

    // Toggle Group Handler
    const toggleGroup = (groupName: string) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupName)) next.delete(groupName);
            else next.add(groupName);
            return next;
        });
    };

    // Drawer Handlers (PRD: "right drawer = quick detail")
    const handleFindingClick = (findingId: string) => {
        setSelectedFindingId(findingId);
    };

    const handleDrawerClose = () => {
        setSelectedFindingId(null);
    };

    // --- Bulk Action Handlers ---

    const handleToggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSelectAll = () => {
        if (selectedIds.size === resultIds.length && resultIds.length > 0) {
            // Deselect All
            setSelectedIds(new Set());
        } else {
            // Select All (Visible via Filter)
            setSelectedIds(new Set(resultIds));
        }
    };

    const handleClearSelection = () => {
        setSelectedIds(new Set());
    };

    const handleBulkAction = async (action: FindingStatus) => {
        if (selectedIds.size === 0) return;

        const ids = Array.from(selectedIds);
        // Optimistic UI? Or wait for service?
        // Service handles IndexedDB immediately, which should trigger live query update.
        await bulkUpdateStatus(ids, action);

        // Clear selection after action
        setSelectedIds(new Set());
    };


    // 3. Transform Data for Grid (Grouping)
    // If we have findings, we group them by fixAction.
    // If we only have resultIds (loading/partial), we just show a list.

    let gridItems: import('./FindingsGrid').GridItem[] = [];

    if (findings && findings.length > 0) {
        // Group findings by fixAction
        const grouped = findings.reduce((acc, finding) => {
            const action = finding.fixAction || 'Review Code';
            if (!acc[action]) acc[action] = [];
            acc[action].push(finding);
            return acc;
        }, {} as Record<string, typeof findings>);

        // Sort groups? Maybe alphabetical or by custom order?
        // Let's sort keys for stability.
        const sortedGroups = Object.keys(grouped).sort();

        // Flatten
        gridItems = sortedGroups.flatMap(groupName => {
            const groupFindings = grouped[groupName];
            const isCollapsed = collapsedGroups.has(groupName);

            const headerItem: import('./FindingsGrid').GridItem = {
                type: 'header',
                id: `header-${groupName}`,
                label: groupName,
                count: groupFindings.length,
                collapsed: isCollapsed
            };

            if (isCollapsed) {
                return [headerItem];
            }

            return [
                headerItem,
                ...groupFindings.map(f => ({ type: 'finding', id: f.id } as const))
            ];
        });
    } else {
        // Fallback to IDs if findings specific objects not ready but IDs are?
        // Currently useFindingsQuery guarantees findings if resultIds > 0 with my fix.
        if (resultIds.length > 0) {
            gridItems = resultIds.map(id => ({ type: 'finding', id } as const));
        }
    }

    // 4. Render
    return (
        <>
            <div className="flex flex-col h-full w-full bg-white dark:bg-gray-950 overflow-hidden relative">
                {/* Bulk Actions Overlay */}
                <BulkActionsBar
                    selectedCount={selectedIds.size}
                    onClearSelection={handleClearSelection}
                    onAction={handleBulkAction}
                />

                {/* Toolbar */}
                <div className="flex-none">
                    <FindingsToolbar
                        filter={filter}
                        onFilterChange={setFilter}
                        facetCounts={facetCounts}
                        scopeCount={scopeCount}
                        totalCount={totalCount}
                        onExportClick={() => setIsExportModalOpen(true)}
                        registry={registry}
                        preferences={preferences}
                        sessionStats={sessionStats}
                        onColumnToggle={toggleColumn}
                        onColumnReset={resetAll}
                    />
                </div>

                {/* Export Modal */}
                <ExportModal
                    isOpen={isExportModalOpen}
                    onClose={() => setIsExportModalOpen(false)}
                    sessionId={sessionId}
                    currentViewState={{
                        filters: filter,
                        sort: sort,
                        findings: findings || []
                    }}
                />

                {/* Main Grid Area */}
                <div className="flex-1 overflow-hidden relative">
                    {isLoading && resultIds.length === 0 ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/50 z-20 backdrop-blur-sm">
                            <div className="flex flex-col items-center space-y-2">
                                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                                <span className="text-sm text-gray-500 font-medium">Loading findings...</span>
                            </div>
                        </div>
                    ) : null}

                    {gridItems.length > 0 ? (
                        <FindingsGrid
                            items={gridItems}
                            columns={columns}
                            preloadedFindingsMap={preloadedFindingsMap}
                            sort={sort}
                            onSortChange={setSort}
                            onGroupToggle={toggleGroup}
                            onFindingClick={handleFindingClick}
                            onColumnResize={updateWidth}
                            // Selection Props
                            selectedIds={selectedIds}
                            onToggleSelect={handleToggleSelect}
                            onSelectAll={handleSelectAll}
                            onScrollTopChange={setGridScrollTop}
                            restoreScrollTop={gridScrollTop}
                            restoreScrollToken={restoreScrollToken}
                        />
                    ) : (
                        !isLoading && (
                            <div className="h-full w-full flex flex-col items-center justify-center text-gray-400">
                                <div className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No findings match your filters</div>
                                <button
                                    onClick={() => setFilter({})}
                                    className="text-sm text-blue-600 hover:underline"
                                >
                                    Clear all filters
                                </button>
                            </div>
                        )
                    )}
                </div>

                {/* Footer / Debug (Optional) */}
                <div className="flex-none h-6 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex items-center px-4 text-[10px] text-gray-400 space-x-4">
                    <span>Scope: {scopeCount}</span>
                    <span>Visible: {resultIds.length}</span>
                    <span>Sort: {sort.field} ({sort.direction})</span>
                </div>
            </div>

            {/* Right Drawer (PRD 6.3.4: "right drawer = quick detail") */}
            <RightDrawer
                isOpen={!!selectedFindingId}
                onClose={handleDrawerClose}
                findingId={selectedFindingId}
                sessionId={sessionId}
                dashboardViewState={{
                    filter,
                    sort,
                    collapsedGroups: Array.from(collapsedGroups),
                    scrollTop: gridScrollTop,
                }}
            />
        </>
    );
}
