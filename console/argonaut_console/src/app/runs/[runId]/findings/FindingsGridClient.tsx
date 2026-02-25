'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import ResearchDrawer from '@/components/ResearchDrawer';

// Simplified Types for the UI
type Finding = {
    _id: string; // The literal ES id
    findingId: string;
    runId: string;
    severity: string;
    description?: string;
    title?: string;
    cve?: string;
    ruleId?: string;
    assetUrl: string;
    priorityScore: number;
    triage?: {
        status: string;
        note?: string;
    };
    context?: {
        reachability?: { reachable: boolean, status: string };
        threat?: { kev: boolean, epss: number };
    };
};

type TriageStatus = 'Open' | 'Fixed' | 'Ignored' | 'FalsePositive';

export default function FindingsGridClient({ runId }: { runId: string }) {
    // ---- State ----
    const [findings, setFindings] = useState<Finding[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);

    // Pagination
    const [cursorStack, setCursorStack] = useState<any[][]>([]); // To go back
    const [currentCursor, setCurrentCursor] = useState<any[] | null>(null);
    const [nextCursor, setNextCursor] = useState<any[] | null>(null);

    // Filters
    const [filters, setFilters] = useState({
        reachableOnly: false,
        kevOnly: false,
        epssMin: false,
        status: [] as string[],
        severity: [] as string[]
    });

    // Selection
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Local changes (Notes debouncing per row)
    const [localNotes, setLocalNotes] = useState<Record<string, string>>({});
    const noteTimeouts = useRef<Record<string, NodeJS.Timeout>>({});

    // Bulk action state
    const [bulkUpdating, setBulkUpdating] = useState(false);

    // Drawer state
    const [drawerFindingId, setDrawerFindingId] = useState<string | null>(null);

    // Fix Generation State
    const [fixGenerating, setFixGenerating] = useState(false);
    const [stageStatus, setStageStatus] = useState<string | null>(null);
    const prevStageStatus = useRef<string | null>(null);

    // Polling for stage status
    useEffect(() => {
        let interval: NodeJS.Timeout;

        const checkStatus = async () => {
            try {
                const res = await fetch(`/api/runs/${runId}/stages/FIX_BUNDLES`);
                if (res.ok) {
                    const data = await res.json();
                    setStageStatus(data.status);
                    if (data.status === 'RUNNING') {
                        setFixGenerating(true);
                    } else {
                        setFixGenerating(false);
                        // If we just finished successfully, refresh the grid
                        if (prevStageStatus.current === 'RUNNING' && data.status === 'SUCCEEDED') {
                            fetchFindings(null);
                        }
                    }
                    prevStageStatus.current = data.status;
                }
            } catch (err) {
                console.error("Failed to fetch stage status", err);
            }
        };

        checkStatus();
        interval = setInterval(checkStatus, 3000);
        return () => clearInterval(interval);
    }, [runId]);

    const handleGenerateTopNFixes = async () => {
        setFixGenerating(true);
        try {
            const requestId = `req_${Date.now()}`;
            const res = await fetch('/api/fixes/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    runId,
                    mode: 'topN',
                    topN: 5,
                    requestId
                })
            });

            if (!res.ok) {
                const data = await res.json();
                alert(data.error || 'Failed to start fix generation');
                setFixGenerating(false);
            }
        } catch (error) {
            console.error(error);
            setFixGenerating(false);
        }
    };

    // ---- Data Fetching ----
    const fetchFindings = useCallback(async (cursor: any[] | null) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('pageSize', '50');
            if (cursor) params.set('cursor', JSON.stringify(cursor));

            if (filters.reachableOnly) params.set('reachableOnly', 'true');
            if (filters.kevOnly) params.set('kevOnly', 'true');
            if (filters.epssMin) params.set('epssMin', 'true');

            filters.status.forEach(s => params.append('status', s));
            filters.severity.forEach(s => params.append('severity', s));

            const res = await fetch(`/api/runs/${runId}/findings?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch findings');
            const data = await res.json();

            setFindings(data.items);
            setTotal(data.total);
            setNextCursor(data.nextCursor);
            setCurrentCursor(cursor);
            setSelectedIds(new Set()); // Reset selection on page change

            // Sync localNotes for new items
            const newLocalNotes: Record<string, string> = {};
            data.items.forEach((item: Finding) => {
                newLocalNotes[item._id] = item.triage?.note || '';
            });
            setLocalNotes(newLocalNotes);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [runId, filters]);

    // Initial / Filter change load
    useEffect(() => {
        setCursorStack([]);
        fetchFindings(null);
    }, [fetchFindings, filters]);

    // ---- Pagination Handlers ----
    const handleNextPage = () => {
        if (!nextCursor) return;
        setCursorStack(prev => [...prev, currentCursor || []]);
        fetchFindings(nextCursor);
    };

    const handlePrevPage = () => {
        if (cursorStack.length === 0) return;
        const newStack = [...cursorStack];
        const prevCursor = newStack.pop();
        setCursorStack(newStack);
        fetchFindings(prevCursor && prevCursor.length > 0 ? prevCursor : null);
    };

    // ---- Selection Handlers ----
    const toggleSelection = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const toggleAll = () => {
        if (selectedIds.size === findings.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(findings.map(f => f._id)));
        }
    };

    // ---- Triage Updates ----
    const updateTriage = async (updates: { findingId: string, triage: { status: string, note?: string } }[]) => {
        if (updates.length === 0) return;
        setBulkUpdating(true);
        try {
            const res = await fetch(`/api/findings/triage`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ runId, updates })
            });
            if (res.ok) {
                // Optimistically update local data
                setFindings(prev => prev.map(f => {
                    const up = updates.find(u => u.findingId === f._id);
                    if (up) {
                        return { ...f, triage: { status: up.triage.status, note: up.triage.note ?? f.triage?.note, updatedAt: new Date().toISOString() } };
                    }
                    return f;
                }));
                setSelectedIds(new Set());
            } else {
                console.error("Bulk update failed", await res.text());
            }
        } catch (error) {
            console.error(error);
        } finally {
            setBulkUpdating(false);
        }
    };

    const handleBulkStatus = (status: TriageStatus) => {
        const updates = Array.from(selectedIds).map(id => {
            const finding = findings.find(f => f._id === id);
            return {
                findingId: id,
                triage: {
                    status,
                    note: localNotes[id] || undefined
                }
            };
        });
        updateTriage(updates);
    };

    const handleNoteChange = (id: string, newNote: string) => {
        setLocalNotes(prev => ({ ...prev, [id]: newNote }));

        if (noteTimeouts.current[id]) {
            clearTimeout(noteTimeouts.current[id]);
        }

        noteTimeouts.current[id] = setTimeout(() => {
            const finding = findings.find(f => f._id === id);
            if (finding) {
                updateTriage([{
                    findingId: id,
                    triage: {
                        status: finding.triage?.status || 'Open',
                        note: newNote
                    }
                }]);
            }
        }, 800);
    };

    // ---- Render Helpers ----
    const renderSeverity = (sev: string) => {
        const colors: Record<string, string> = {
            'CRITICAL': 'text-red-400 bg-red-400/10 border-red-400/20',
            'HIGH': 'text-orange-400 bg-orange-400/10 border-orange-400/20',
            'MEDIUM': 'text-amber-400 bg-amber-400/10 border-amber-400/20',
            'LOW': 'text-neutral-400 bg-neutral-400/10 border-neutral-400/20'
        };
        const c = colors[sev?.toUpperCase()] || colors['LOW'];
        return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${c}`}>{sev}</span>;
    };

    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="p-4 border-b border-white/5 bg-neutral-900/50 flex flex-wrap items-center justify-between gap-4 shrink-0">
                <div className="flex flex-wrap items-center gap-2">
                    {/* Filters */}
                    <label className="flex items-center gap-1.5 text-xs text-neutral-300">
                        <input type="checkbox" className="rounded bg-neutral-800 border-neutral-700"
                            checked={filters.reachableOnly} onChange={e => setFilters(f => ({ ...f, reachableOnly: e.target.checked }))} />
                        Reachable
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-neutral-300 ml-3">
                        <input type="checkbox" className="rounded bg-neutral-800 border-neutral-700"
                            checked={filters.kevOnly} onChange={e => setFilters(f => ({ ...f, kevOnly: e.target.checked }))} />
                        KEV
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-neutral-300 ml-3">
                        <input type="checkbox" className="rounded bg-neutral-800 border-neutral-700"
                            checked={filters.epssMin} onChange={e => setFilters(f => ({ ...f, epssMin: e.target.checked }))} />
                        EPSS {'>'} 0.5
                    </label>

                    <div className="h-4 w-px bg-white/10 mx-2"></div>

                    <span className="text-xs text-neutral-500 uppercase tracking-wider font-bold">Status:</span>
                    {['Open', 'Fixed', 'Ignored', 'FalsePositive'].map(st => (
                        <label key={st} className="flex items-center gap-1.5 text-xs text-neutral-300">
                            <input type="checkbox" className="rounded bg-neutral-800 border-neutral-700"
                                checked={filters.status.includes(st)}
                                onChange={e => {
                                    setFilters(f => {
                                        const newStatuses = e.target.checked
                                            ? [...f.status, st]
                                            : f.status.filter(x => x !== st);
                                        return { ...f, status: newStatuses };
                                    });
                                }} />
                            {st}
                        </label>
                    ))}
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleGenerateTopNFixes}
                        disabled={fixGenerating || stageStatus === 'RUNNING'}
                        className={`px-3 py-1.5 text-xs font-bold rounded flex items-center gap-2 transition-all shadow-sm ${fixGenerating || stageStatus === 'RUNNING'
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 cursor-not-allowed animate-pulse'
                            : 'bg-blue-600/90 hover:bg-blue-600 text-white border border-blue-500/50'
                            }`}
                    >
                        <svg className={`w-3.5 h-3.5 ${fixGenerating ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        {fixGenerating || stageStatus === 'RUNNING' ? 'Generating Fixes...' : 'Generate fixes for top 5'}
                    </button>

                    <div className="h-4 w-px bg-white/10 mx-1"></div>

                    <span className="text-xs text-neutral-400 font-mono">{total} findings</span>
                    {selectedIds.size > 0 && (
                        <div className="flex items-center gap-2 ml-4 text-xs">
                            <span className="text-blue-400 font-medium mr-2">{selectedIds.size} selected</span>
                            <button disabled={bulkUpdating} onClick={() => handleBulkStatus('Fixed')} className="px-2.5 py-1 font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded hover:bg-emerald-500/20 disabled:opacity-50">Fix</button>
                            <button disabled={bulkUpdating} onClick={() => handleBulkStatus('Ignored')} className="px-2.5 py-1 font-medium bg-neutral-500/10 text-neutral-400 border border-neutral-500/20 rounded hover:bg-neutral-500/20 disabled:opacity-50">Ignore</button>
                            <button disabled={bulkUpdating} onClick={() => handleBulkStatus('FalsePositive')} className="px-2.5 py-1 font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded hover:bg-orange-500/20 disabled:opacity-50">FP</button>
                            <button disabled={bulkUpdating} onClick={() => handleBulkStatus('Open')} className="px-2.5 py-1 font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded hover:bg-blue-500/20 disabled:opacity-50">Open</button>
                        </div>
                    )}
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-auto bg-[#0A0A0A]">
                <table className="w-full text-left border-collapse text-sm">
                    <thead className="sticky top-0 bg-[#111] shadow-md z-10 border-b border-white/10">
                        <tr>
                            <th className="p-3 w-12 text-center text-neutral-400 font-medium">
                                <input type="checkbox" className="rounded bg-neutral-800 border-neutral-700"
                                    checked={findings.length > 0 && selectedIds.size === findings.length}
                                    onChange={toggleAll}
                                />
                            </th>
                            <th className="p-3 text-xs uppercase tracking-wider text-neutral-500 font-bold w-32">Priority</th>
                            <th className="p-3 text-xs uppercase tracking-wider text-neutral-500 font-bold w-24">Severity</th>
                            <th className="p-3 text-xs uppercase tracking-wider text-neutral-500 font-bold max-w-sm">Description</th>
                            <th className="p-3 text-xs uppercase tracking-wider text-neutral-500 font-bold w-48">Asset URL</th>
                            <th className="p-3 text-xs uppercase tracking-wider text-neutral-500 font-bold w-32">Status</th>
                            <th className="p-3 text-xs uppercase tracking-wider text-neutral-500 font-bold">Notes</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {loading ? (
                            <tr><td colSpan={7} className="p-8 text-center text-neutral-500">Loading findings...</td></tr>
                        ) : findings.length === 0 ? (
                            <tr><td colSpan={7} className="p-8 text-center text-neutral-500">No findings matched your filters.</td></tr>
                        ) : (
                            findings.map(f => {
                                const isSelected = selectedIds.has(f._id);
                                const rawStatus = f.triage?.status || 'Open';
                                const displayStatus = rawStatus === 'DEMO_CURATED' ? 'Open' : rawStatus;

                                return (
                                    <tr key={f._id} className={`hover:bg-white/[0.02] transition-colors ${isSelected ? 'bg-blue-500/[0.03]' : ''}`}>
                                        <td className="p-3 text-center">
                                            <input type="checkbox" className="rounded bg-neutral-800 border-neutral-700"
                                                checked={isSelected} onChange={() => toggleSelection(f._id)} />
                                        </td>
                                        <td className="p-3">
                                            <span className="font-mono text-neutral-300">{f.priorityScore.toFixed(1)}</span>
                                        </td>
                                        <td className="p-3">
                                            {renderSeverity(f.severity)}
                                        </td>
                                        <td className="p-3 max-w-sm">
                                            <button
                                                onClick={() => setDrawerFindingId(f.findingId)}
                                                className="text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors text-left flex items-start gap-1 focus:outline-none"
                                                title={f.title || f.cve || f.ruleId || f.description || 'Finding Details'}
                                            >
                                                <span className="truncate">{f.title || f.cve || f.ruleId || (f.description ? f.description.substring(0, 100) + '...' : 'Unknown Finding')}</span>
                                                <svg className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-50 hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                </svg>
                                            </button>
                                            {f.description && (
                                                <div className="text-xs text-neutral-400 mt-1 truncate max-w-sm" title={f.description}>
                                                    {f.description}
                                                </div>
                                            )}
                                            <div className="text-[10px] text-neutral-600 font-mono mt-1">
                                                {f.findingId}
                                            </div>
                                            {/* Context badges */}
                                            <div className="flex gap-1.5 mt-1.5">
                                                {f.context?.reachability?.reachable && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border text-purple-400 border-purple-400/20 bg-purple-400/10">Reachable</span>}
                                                {f.context?.threat?.kev && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border text-red-400 border-red-400/20 bg-red-400/10">KEV</span>}
                                                {f.context?.threat?.epss && f.context.threat.epss >= 0.5 && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border text-orange-400 border-orange-400/20 bg-orange-400/10">EPSS &ge;50%</span>}
                                            </div>
                                        </td>
                                        <td className="p-3 w-48">
                                            <div className="truncate text-xs font-mono text-neutral-400" title={f.assetUrl}>{f.assetUrl}</div>
                                        </td>
                                        <td className="p-3">
                                            <select
                                                className="bg-transparent border border-white/10 rounded px-2 py-1 text-xs text-neutral-300 focus:outline-none focus:border-blue-500"
                                                value={displayStatus}
                                                disabled={bulkUpdating}
                                                onChange={(e) => updateTriage([{ findingId: f._id, triage: { status: e.target.value, note: localNotes[f._id] } }])}
                                            >
                                                <option value="Open">Open</option>
                                                <option value="Fixed">Fixed</option>
                                                <option value="Ignored">Ignored</option>
                                                <option value="FalsePositive">False Positive</option>
                                            </select>
                                        </td>
                                        <td className="p-3">
                                            <input
                                                type="text"
                                                disabled={bulkUpdating}
                                                placeholder="Add note..."
                                                className="w-full bg-transparent border-b border-white/10 focus:border-blue-500 text-xs px-2 py-1 outline-none text-neutral-300 placeholder:text-neutral-600 transition-colors"
                                                value={localNotes[f._id] ?? ''}
                                                onChange={(e) => handleNoteChange(f._id, e.target.value)}
                                            />
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="p-3 border-t border-white/5 bg-[#0a0a0a] flex items-center justify-between shrink-0">
                <span className="text-xs text-neutral-500">Page {cursorStack.length + 1}</span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handlePrevPage}
                        disabled={cursorStack.length === 0 || loading}
                        className="px-3 py-1.5 text-xs font-medium text-neutral-400 bg-neutral-800/50 hover:bg-neutral-800 hover:text-white rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        Previous
                    </button>
                    <button
                        onClick={handleNextPage}
                        disabled={!nextCursor || loading}
                        className="px-3 py-1.5 text-xs font-medium text-neutral-400 bg-neutral-800/50 hover:bg-neutral-800 hover:text-white rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        Next
                    </button>
                </div>
            </div>

            {/* Research Drawer Component */}
            <ResearchDrawer
                isOpen={drawerFindingId !== null}
                onClose={() => setDrawerFindingId(null)}
                runId={runId}
                findingId={drawerFindingId}
            />
        </div>
    );
}
