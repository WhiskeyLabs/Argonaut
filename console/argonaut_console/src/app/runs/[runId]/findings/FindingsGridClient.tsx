'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Filter,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Shield,
    Zap,
    ChevronLeft,
    ChevronRight,
    Search,
    ExternalLink,
    Clock,
    Flame,
    Activity,
    Check,
    Wrench,
    X
} from 'lucide-react';
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
    const [fixActionId, setFixActionId] = useState<string | null>(null);
    const [fixResult, setFixResult] = useState<{ status: string; summary?: string; findingIds?: string[]; bundles?: any[] } | null>(null);
    const [showFixResult, setShowFixResult] = useState(false);
    const fixPollRef = useRef<NodeJS.Timeout | null>(null);

    // Poll fix request status when we have a pending actionId
    useEffect(() => {
        if (!fixActionId) return;

        const pollStatus = async () => {
            try {
                const res = await fetch(`/api/fixes/status?actionId=${fixActionId}`, {
                    headers: { 'X-Agent-Key': 'argonaut-fix-agent-2026' }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.request?.status === 'SUCCEEDED' || data.request?.status === 'FAILED') {
                        setFixGenerating(false);
                        setFixResult({
                            status: data.request.status,
                            summary: data.request.error, // outcome summary string
                            findingIds: data.request.findingIds,
                            bundles: data.bundles || []
                        });
                        setShowFixResult(true);
                        setFixActionId(null);
                        if (fixPollRef.current) clearInterval(fixPollRef.current);
                    }
                }
            } catch (err) {
                console.error('Fix status poll error:', err);
            }
        };

        pollStatus();
        fixPollRef.current = setInterval(pollStatus, 3000);
        return () => { if (fixPollRef.current) clearInterval(fixPollRef.current); };
    }, [fixActionId]);

    const handleGenerateTopNFixes = async () => {
        setFixGenerating(true);
        setFixResult(null);
        setShowFixResult(false);
        try {
            const res = await fetch('/api/fixes/request', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Agent-Key': 'argonaut-fix-agent-2026'
                },
                body: JSON.stringify({
                    runId,
                    mode: 'topN',
                    topN: 5,
                    source: 'console'
                })
            });

            if (res.ok) {
                const data = await res.json();
                setFixActionId(data.actionId);
            } else {
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
        const severityMap: Record<string, { class: string, icon: any }> = {
            'CRITICAL': { class: 'text-accent-pink border-accent-pink/30 bg-accent-pink/5', icon: Flame },
            'HIGH': { class: 'text-accent-yellow border-accent-yellow/30 bg-accent-yellow/5', icon: AlertTriangle },
            'MEDIUM': { class: 'text-accent-blue border-accent-blue/30 bg-accent-blue/5', icon: Activity },
            'LOW': { class: 'text-neutral-400 border-white/10 bg-white/5', icon: Clock }
        };
        const upperSev = sev?.toUpperCase() || 'LOW';
        const config = severityMap[upperSev] || severityMap['LOW'];
        const Icon = config.icon;

        return (
            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border flex items-center gap-1.5 w-fit ${config.class}`}>
                <Icon className="w-3 h-3" />
                {sev}
            </span>
        );
    };

    return (
        <div className="argonaut-panel h-full flex flex-col overflow-hidden border-white/10">
            {/* Toolbar */}
            <div className="p-6 border-b border-white/10 bg-white/2 flex flex-wrap items-center justify-between gap-6 shrink-0">
                <div className="flex flex-wrap items-center gap-6">
                    {/* Filters Group */}
                    <div className="flex items-center gap-4 bg-white/5 px-4 py-2 rounded-full border border-white/5">
                        <Filter className="w-3.5 h-3.5 text-neutral-500" />
                        <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400 cursor-pointer hover:text-white transition-colors">
                            <input type="checkbox" className="w-3 h-3 rounded border-white/10 bg-black/20 text-accent-blue focus:ring-accent-blue/50"
                                checked={filters.reachableOnly} onChange={e => setFilters(f => ({ ...f, reachableOnly: e.target.checked }))} />
                            Reachable
                        </label>
                        <div className="w-px h-3 bg-white/10" />
                        <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400 cursor-pointer hover:text-white transition-colors">
                            <input type="checkbox" className="w-3 h-3 rounded border-white/10 bg-black/20 text-accent-blue focus:ring-accent-blue/50"
                                checked={filters.kevOnly} onChange={e => setFilters(f => ({ ...f, kevOnly: e.target.checked }))} />
                            KEV
                        </label>
                        <div className="w-px h-3 bg-white/10" />
                        <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400 cursor-pointer hover:text-white transition-colors">
                            <input type="checkbox" className="w-3 h-3 rounded border-white/10 bg-black/20 text-accent-blue focus:ring-accent-blue/50"
                                checked={filters.epssMin} onChange={e => setFilters(f => ({ ...f, epssMin: e.target.checked }))} />
                            High EPSS
                        </label>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-600">Status</span>
                        <div className="flex items-center gap-1.5">
                            {['Open', 'Fixed', 'Ignored', 'FalsePositive'].map(st => (
                                <button
                                    key={st}
                                    onClick={() => {
                                        setFilters(f => ({
                                            ...f,
                                            status: f.status.includes(st) ? f.status.filter(x => x !== st) : [...f.status, st]
                                        }));
                                    }}
                                    className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest border transition-all ${filters.status.includes(st)
                                        ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/30 shadow-[0_0_10px_rgba(33,150,243,0.1)]'
                                        : 'bg-white/5 text-neutral-500 border-white/5 hover:border-white/20'
                                        }`}
                                >
                                    {st}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={handleGenerateTopNFixes}
                        disabled={fixGenerating}
                        className={`btn-neon-blue px-5 py-2 flex items-center gap-2 !text-[10px] ${fixGenerating ? 'opacity-50 !cursor-wait' : ''}`}
                    >
                        {fixGenerating ? (
                            <Activity className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <Wrench className="w-3.5 h-3.5" />
                        )}
                        {fixGenerating ? 'Elastic Agent Remediating...' : 'Generate Fixes for Selected'}
                    </button>

                    <div className="flex items-center gap-2 px-3 py-1.5 bg-black/20 rounded border border-white/5">
                        <span className="text-[10px] font-mono font-bold text-neutral-400 uppercase tracking-widest">
                            {total} <span className="text-neutral-600 font-normal">Hits</span>
                        </span>
                    </div>
                </div>
            </div>

            {/* Bulk Actions Bar (Sticky but overlay) */}
            {selectedIds.size > 0 && (
                <div className="px-6 py-3 bg-accent-blue/10 border-b border-accent-blue/20 flex items-center justify-between shrink-0 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded bg-accent-blue/20 flex items-center justify-center border border-accent-blue/30">
                            <Check className="w-3.5 h-3.5 text-accent-blue" />
                        </div>
                        <span className="text-xs font-bold text-accent-blue uppercase tracking-widest font-barlow">
                            {selectedIds.size} Findings Selected
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button disabled={bulkUpdating} onClick={() => handleBulkStatus('Fixed')} className="px-4 py-1.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded hover:bg-emerald-500/20 active:scale-95 transition-all uppercase tracking-widest disabled:opacity-50">Mark Fixed</button>
                        <button disabled={bulkUpdating} onClick={() => handleBulkStatus('Ignored')} className="px-4 py-1.5 text-[10px] font-bold bg-neutral-500/10 text-neutral-400 border border-neutral-500/20 rounded hover:bg-neutral-500/20 active:scale-95 transition-all uppercase tracking-widest disabled:opacity-50">Ignore</button>
                        <button disabled={bulkUpdating} onClick={() => handleBulkStatus('FalsePositive')} className="px-4 py-1.5 text-[10px] font-bold bg-accent-pink/10 text-accent-pink border border-accent-pink/20 rounded hover:bg-accent-pink/20 active:scale-95 transition-all uppercase tracking-widest disabled:opacity-50">False Positive</button>
                        <div className="w-px h-4 bg-accent-blue/20 mx-2" />
                        <button onClick={() => setSelectedIds(new Set())} className="text-[10px] font-bold text-neutral-500 hover:text-white uppercase tracking-widest px-2">Cancel</button>
                    </div>
                </div>
            )}

            {/* Grid */}
            <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-[#0D0D0D] z-10 border-b border-white/10">
                        <tr>
                            <th className="p-4 w-12 text-center">
                                <input type="checkbox" className="w-3.5 h-3.5 rounded border-white/10 bg-white/5 text-accent-blue focus:ring-accent-blue/50 cursor-pointer"
                                    checked={findings.length > 0 && selectedIds.size === findings.length}
                                    onChange={toggleAll}
                                />
                            </th>
                            <th className="p-4 text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-bold w-24 font-barlow">Priority</th>
                            <th className="p-4 text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-bold w-32 font-barlow">Severity</th>
                            <th className="p-4 text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-bold font-barlow">Finding Details</th>
                            <th className="p-4 text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-bold w-48 font-barlow">Asset Location</th>
                            <th className="p-4 text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-bold w-40 font-barlow">Triage</th>
                            <th className="p-4 text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-bold font-barlow">Analysis Notes</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 bg-black/20">
                        {loading ? (
                            <tr><td colSpan={7} className="p-16 text-center">
                                <Activity className="w-8 h-8 text-neutral-800 animate-pulse mx-auto mb-4" />
                                <span className="text-xs uppercase tracking-[0.3em] text-neutral-600 animate-pulse">Scanning Data Plane...</span>
                            </td></tr>
                        ) : findings.length === 0 ? (
                            <tr><td colSpan={7} className="p-16 text-center">
                                <Shield className="w-8 h-8 text-neutral-800 mx-auto mb-4 opacity-20" />
                                <p className="text-xs uppercase tracking-[0.2em] text-neutral-600">No telemetry matches the current filter profile.</p>
                            </td></tr>
                        ) : (
                            findings.map(f => {
                                const isSelected = selectedIds.has(f._id);
                                const rawStatus = f.triage?.status || 'Open';
                                const displayStatus = rawStatus === 'DEMO_CURATED' ? 'Open' : rawStatus;

                                return (
                                    <tr key={f._id} className={`group hover:bg-white/[0.03] transition-all ${isSelected ? 'bg-accent-blue/5 border-l-2 border-l-accent-blue' : 'border-l-2 border-l-transparent'}`}>
                                        <td className="p-4 text-center">
                                            <input type="checkbox" className="w-3.5 h-3.5 rounded border-white/10 bg-white/5 text-accent-blue focus:ring-accent-blue/50 cursor-pointer"
                                                checked={isSelected} onChange={() => toggleSelection(f._id)} />
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-col">
                                                <span className="font-mono text-sm font-bold text-white leading-none mb-1">{f.priorityScore.toFixed(1)}</span>
                                                <div className="w-12 h-1 bg-white/5 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-accent-blue"
                                                        style={{ width: `${Math.min(f.priorityScore, 10) * 10}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            {renderSeverity(f.severity)}
                                        </td>
                                        <td className="p-4 max-w-xl">
                                            <div className="flex flex-col gap-1.5">
                                                <button
                                                    onClick={() => setDrawerFindingId(f.findingId)}
                                                    className="text-sm font-bold text-white hover:text-accent-blue transition-all text-left flex items-start gap-2 focus:outline-none"
                                                >
                                                    <span className="truncate group-hover:underline decoration-accent-blue/30 underline-offset-4">{f.title || f.cve || f.ruleId || 'Unknown Finding'}</span>
                                                    <ExternalLink className="w-3 h-3 mt-1 opacity-20 group-hover:opacity-100 transition-opacity" />
                                                </button>
                                                {f.description && (
                                                    <div className="text-[11px] leading-relaxed text-neutral-400 line-clamp-2" title={f.description}>
                                                        {f.description}
                                                    </div>
                                                )}
                                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                                    <span className="text-[9px] font-mono text-neutral-600 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                                                        {f.findingId}
                                                    </span>
                                                    {f.context?.reachability?.reachable && (
                                                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest bg-accent-pink/10 text-accent-pink border border-accent-pink/20">
                                                            <Flame className="w-2.5 h-2.5" />
                                                            Reachable
                                                        </span>
                                                    )}
                                                    {f.context?.threat?.kev && (
                                                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest bg-red-400/10 text-red-100 border border-red-400/30">
                                                            KEV
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-col gap-1">
                                                <div className="truncate text-[10px] font-mono font-medium text-neutral-400" title={f.assetUrl || ''}>
                                                    {f.assetUrl ? f.assetUrl.split('/').pop() : 'no-asset'}
                                                </div>
                                                <div className="truncate text-[9px] font-mono text-neutral-600" title={f.assetUrl || ''}>
                                                    {f.assetUrl ? (f.assetUrl.split('/').slice(0, -1).join('/') || '/') : ''}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <select
                                                className="w-full bg-black/40 border border-white/10 rounded px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-300 focus:outline-none focus:border-accent-blue transition-all cursor-pointer appearance-none hover:border-white/20"
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
                                        <td className="p-4">
                                            <div className="relative group/note">
                                                <input
                                                    type="text"
                                                    disabled={bulkUpdating}
                                                    placeholder="Add engineering context..."
                                                    className="w-full bg-transparent border-b border-white/5 focus:border-accent-blue text-xs px-1 py-1 outline-none text-neutral-300 placeholder:text-neutral-700 transition-all font-light"
                                                    value={localNotes[f._id] ?? ''}
                                                    onChange={(e) => handleNoteChange(f._id, e.target.value)}
                                                />
                                                <Search className="w-3 h-3 absolute right-1 top-2 text-neutral-800 group-focus-within/note:text-accent-blue/50 transition-colors pointer-events-none" />
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination / Footer */}
            <div className="px-6 py-4 border-t border-white/10 bg-white/2 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-600">
                        Surface Layer <span className="text-neutral-400 ml-1">{cursorStack.length + 1}</span>
                    </span>
                    <div className="h-4 w-px bg-white/5" />
                    <span className="text-[9px] font-mono text-neutral-700 uppercase tracking-widest">
                        Ready for Triage
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handlePrevPage}
                        disabled={cursorStack.length === 0 || loading}
                        className="p-2 text-neutral-500 hover:text-white bg-white/5 border border-white/5 rounded-lg disabled:opacity-20 disabled:cursor-not-allowed transition-all hover:bg-white/10"
                        title="Previous Plane"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                        onClick={handleNextPage}
                        disabled={!nextCursor || loading}
                        className="p-2 text-neutral-500 hover:text-white bg-white/5 border border-white/5 rounded-lg disabled:opacity-20 disabled:cursor-not-allowed transition-all hover:bg-white/10"
                        title="Next Plane"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Fix Result Toast */}
            {showFixResult && fixResult && (
                <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-500">
                    <div className={`min-w-[340px] max-w-md rounded-xl border shadow-2xl backdrop-blur-xl p-5 ${fixResult.status === 'SUCCEEDED'
                        ? 'bg-emerald-950/90 border-emerald-500/30 shadow-emerald-500/10'
                        : 'bg-red-950/90 border-red-500/30 shadow-red-500/10'
                        }`}>
                        <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex items-center gap-2">
                                {fixResult.status === 'SUCCEEDED' ? (
                                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                ) : (
                                    <XCircle className="w-5 h-5 text-red-400" />
                                )}
                                <span className="text-sm font-bold text-white">
                                    {fixResult.status === 'SUCCEEDED' ? 'Elastic Agent — Fix Bundles Generated' : 'Elastic Agent — Fix Generation Failed'}
                                </span>
                            </div>
                            <button onClick={() => setShowFixResult(false)} className="text-neutral-500 hover:text-white transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="text-[10px] text-neutral-500 mb-2 italic">Dispatched by Elastic Agent Builder AI Agent via Argonaut Fix Worker</div>
                        {fixResult.summary && (
                            <div className="text-[11px] font-mono text-neutral-300 bg-black/30 rounded-lg px-3 py-2 mb-3 border border-white/5">
                                {fixResult.summary}
                            </div>
                        )}
                        <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest">
                            {fixResult.bundles && fixResult.bundles.length > 0 && (
                                <span className="text-emerald-400">
                                    <Wrench className="w-3 h-3 inline mr-1" />
                                    {fixResult.bundles.length} bundle{fixResult.bundles.length !== 1 ? 's' : ''}
                                </span>
                            )}
                            {fixResult.findingIds && (
                                <span className="text-neutral-500">
                                    {fixResult.findingIds.length} finding{fixResult.findingIds.length !== 1 ? 's' : ''} processed
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}

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
