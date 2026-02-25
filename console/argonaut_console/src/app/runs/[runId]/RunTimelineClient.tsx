'use client';

import { useEffect, useState, useRef } from 'react';

import { STAGES } from '@argus_core/lib/contracts/executionEnums';
import RunDependencyGraph from '../../../components/graph/RunDependencyGraph';

export default function RunTimelineClient({ initialRun, runId }: { initialRun: any, runId: string }) {
    const [run, setRun] = useState(initialRun);
    const [logs, setLogs] = useState<any[]>([]);
    const [showAllTasks, setShowAllTasks] = useState(false);
    const [selectedStage, setSelectedStage] = useState<string | null>(null);
    const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
    const [errorBanner, setErrorBanner] = useState<string | null>(run.errorSummary || null);
    const [view, setView] = useState<'timeline' | 'graph'>('timeline');
    const [graphData, setGraphData] = useState<any>(null);
    const [loadingGraph, setLoadingGraph] = useState(false);
    const [isEnriching, setIsEnriching] = useState(false);
    const [enrichBanner, setEnrichBanner] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
    const [isReporting, setIsReporting] = useState(false);
    const [reportBanner, setReportBanner] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const logsEndRef = useRef<HTMLDivElement>(null);

    // Fetch logs and run updates
    useEffect(() => {
        let isActive = true;

        const fetchData = async () => {
            try {
                // Fetch logs
                const logsRes = await fetch(`/api/runs/${runId}/tasklogs?limit=1000`);
                if (logsRes.ok) {
                    const logsData = await logsRes.json();
                    if (isActive) setLogs(logsData.logs || []);
                }

                // If run is still running, fetch run details
                if (run.status === 'RUNNING') {
                    const runRes = await fetch(`/api/runs/${runId}`);
                    if (runRes.ok) {
                        const runData = await runRes.json();
                        if (isActive) {
                            setRun(runData.run);
                            if (runData.run.errorSummary) {
                                setErrorBanner(runData.run.errorSummary);
                            }
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to fetch run data", err);
            }
        };

        fetchData();

        if (run.status === 'RUNNING') {
            const interval = setInterval(fetchData, 2000);
            return () => {
                isActive = false;
                clearInterval(interval);
            };
        }

        return () => { isActive = false; };
    }, [runId, run.status, refreshKey]);

    const handleReRunEnrichment = async () => {
        setIsEnriching(true);
        setEnrichBanner(null);
        try {
            const res = await fetch(`/api/runs/${runId}/enrich-threat`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                setEnrichBanner({
                    type: 'success',
                    message: `Applied KEV to ${data.summary.appliedKev} findings, EPSS to ${data.summary.appliedEpss}. (Adjusted ${data.summary.scoreAdjustments} scores).`
                });
                setRefreshKey(k => k + 1); // Refetch
            } else {
                setEnrichBanner({ type: 'error', message: data.error || 'Failed to re-run enrichment' });
            }
        } catch (err: any) {
            setEnrichBanner({ type: 'error', message: err.message });
        } finally {
            setIsEnriching(false);
        }
    };
    const handlePublishReport = async () => {
        setIsReporting(true);
        setReportBanner(null);
        try {
            const res = await fetch(`/api/runs/${runId}/report`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                setReportBanner({
                    type: 'success',
                    message: `Report generated and published to Slack. (Idempotency Key: ${data.slackIdempotencyKey})`
                });
                setRefreshKey(k => k + 1); // Refetch to show new actions if any
            } else {
                setReportBanner({ type: 'error', message: data.error || 'Failed to publish report' });
            }
        } catch (err: any) {
            setReportBanner({ type: 'error', message: err.message });
        } finally {
            setIsReporting(false);
        }
    };

    // Fetch graph data if view is 'graph'
    useEffect(() => {
        if (view === 'graph' && !graphData) {
            const fetchGraph = async () => {
                setLoadingGraph(true);
                try {
                    const res = await fetch(`/api/runs/${runId}/graph`);
                    if (res.ok) {
                        const data = await res.json();
                        setGraphData(data.graph);
                    }
                } catch (err) {
                    console.error("Failed to fetch graph data", err);
                } finally {
                    setLoadingGraph(false);
                }
            };
            fetchGraph();
        }
    }, [view, runId, graphData]);

    // Extract Provenance from logs
    const workflowMetaLog = logs.find(l => l.taskKey === 'workflow:meta' && l.taskType === 'SYSTEM');
    let provenance = null;
    if (workflowMetaLog?.refs) {
        provenance = {
            workflowId: workflowMetaLog.refs.workflowId,
            workflowVersion: workflowMetaLog.refs.workflowVersion,
            agentId: workflowMetaLog.refs.agentId,
            system: workflowMetaLog.refs.workflowSystem
        };
    }

    // Portal the provenance data to the DOM element if it exists
    useEffect(() => {
        const container = document.getElementById('provenance-container');
        if (container) {
            if (provenance) {
                container.innerHTML = `
                    <div class="space-y-2">
                        <div class="flex flex-col">
                            <span class="text-[10px] uppercase font-bold text-blue-500/70 tracking-wider">Workflow</span>
                            <span class="font-mono text-sm text-blue-100">${provenance.workflowId} <span class="text-blue-400">v${provenance.workflowVersion}</span></span>
                        </div>
                        <div class="flex flex-col pt-1">
                            <span class="text-[10px] uppercase font-bold text-blue-500/70 tracking-wider">Agent</span>
                            <span class="font-mono text-sm text-blue-100">${provenance.agentId}</span>
                        </div>
                        <div class="flex flex-col pt-1">
                            <span class="text-[10px] uppercase font-bold text-blue-500/70 tracking-wider">System</span>
                            <span class="font-mono text-xs text-blue-300">${provenance.system}</span>
                        </div>
                    </div>
                `;
            } else if (run.status !== 'RUNNING') {
                container.innerHTML = `<span class="text-[11px] text-neutral-500 italic">No provenance data available.</span>`;
            }
        }
    }, [provenance, run.status]);

    // Filter logs
    const filteredLogs = logs.filter(log => {
        // Mode filter: Milestone vs All
        if (!showAllTasks) {
            const isMilestone = log.taskType === 'SYSTEM' || (log.taskKey || '').startsWith('stage:') || log.status === 'FAILED';
            if (!isMilestone) return false;
        }

        // Chip filters
        if (selectedStage && log.stage !== selectedStage) return false;
        if (selectedStatus && log.status !== selectedStatus) return false;

        return true;
    });

    const getStageColor = (status: string) => {
        switch (status) {
            case 'SUCCESS':
            case 'SUCCEEDED': return 'bg-emerald-500/20 text-emerald-400 ring-emerald-500/30';
            case 'FAILURE':
            case 'FAILED': return 'bg-red-500/20 text-red-400 ring-red-500/30';
            case 'RUNNING': return 'bg-blue-500/20 text-blue-400 ring-blue-500/30';
            case 'SKIPPED': return 'bg-neutral-500/20 text-neutral-400 ring-neutral-500/30';
            default: return 'bg-white/5 text-neutral-500 ring-white/10';
        }
    };

    const getLogIcon = (status: string) => {
        switch (status) {
            case 'SUCCESS':
            case 'SUCCEEDED': return <svg className="w-4 h-4 text-emerald-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;
            case 'FAILURE':
            case 'FAILED': return <svg className="w-4 h-4 text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></svg>;
            case 'STARTED':
            case 'RUNNING': return <svg className="w-4 h-4 text-blue-400 animate-spin" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>;
            default: return <svg className="w-4 h-4 text-neutral-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>;
        }
    };

    return (
        <div className="space-y-6">
            {errorBanner && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-md p-4 flex items-start gap-4">
                    <svg className="w-5 h-5 text-red-500 mt-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
                    <div>
                        <h3 className="text-sm font-bold text-red-400">Run Failed</h3>
                        <p className="text-sm text-neutral-300 mt-1">{errorBanner}</p>
                    </div>
                </div>
            )}

            {enrichBanner && (
                <div className={`border rounded-md p-4 flex items-start gap-4 ${enrichBanner.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                    {enrichBanner.type === 'success' ? (
                        <svg className="w-5 h-5 text-emerald-500 mt-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    ) : (
                        <svg className="w-5 h-5 text-red-500 mt-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
                    )}
                    <div>
                        <h3 className={`text-sm font-bold ${enrichBanner.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                            {enrichBanner.type === 'success' ? 'Enrichment Successful' : 'Enrichment Failed'}
                        </h3>
                        <p className="text-sm text-neutral-300 mt-1">{enrichBanner.message}</p>
                    </div>
                </div>
            )}

            {reportBanner && (
                <div className={`border rounded-md p-4 flex items-start gap-4 ${reportBanner.type === 'success' ? 'bg-blue-500/10 border-blue-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                    {reportBanner.type === 'success' ? (
                        <svg className="w-5 h-5 text-blue-500 mt-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                    ) : (
                        <svg className="w-5 h-5 text-red-500 mt-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
                    )}
                    <div>
                        <h3 className={`text-sm font-bold ${reportBanner.type === 'success' ? 'text-blue-400' : 'text-red-400'}`}>
                            {reportBanner.type === 'success' ? 'Slack Publication Successful' : 'Publication Failed'}
                        </h3>
                        <p className="text-sm text-neutral-300 mt-1">{reportBanner.message}</p>
                    </div>
                </div>
            )}

            {/* Stage Timeline */}
            <div className="argonaut-panel p-6">
                <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-6">
                    <h2 className="text-[11px] uppercase tracking-[0.2em] font-bold text-neutral-400">Execution Stages</h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleReRunEnrichment}
                            disabled={run.status === 'RUNNING' || ((run.stageSummary || {})['THREAT_INTEL']?.status === 'RUNNING') || isEnriching}
                            className={`text-[10px] uppercase font-bold tracking-widest px-3 py-1.5 rounded-sm transition-colors border flex items-center gap-2 ${run.status !== 'RUNNING' && ((run.stageSummary || {})['THREAT_INTEL']?.status !== 'RUNNING') && !isEnriching
                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20'
                                : 'bg-transparent text-neutral-600 border-white/5 cursor-not-allowed'
                                }`}
                        >
                            {isEnriching && (
                                <svg className="w-3 h-3 animate-spin" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                            )}
                            Re-run Enrichment
                        </button>
                        <button
                            onClick={handlePublishReport}
                            disabled={run.status === 'RUNNING' || isReporting}
                            className={`text-[10px] uppercase font-bold tracking-widest px-3 py-1.5 rounded-sm transition-colors border flex items-center gap-2 ${run.status !== 'RUNNING' && !isReporting
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                                : 'bg-transparent text-neutral-600 border-white/5 cursor-not-allowed'
                                }`}
                        >
                            {isReporting && (
                                <svg className="w-3 h-3 animate-spin" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                            )}
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 12.5C6 11.1193 7.11929 10 8.5 10C9.88071 10 11 11.1193 11 12.5C11 13.8807 9.88071 15 8.5 15C7.11929 15 6 13.8807 6 12.5ZM2 12.5C2 11.1193 3.11929 10 4.5 10C5.88071 10 7 11.1193 7 12.5C7 13.8807 5.88071 15 4.5 15C3.11929 15 2 13.8807 2 12.5ZM10 12.5C10 11.1193 11.1193 10 12.5 10C13.8807 10 15 11.1193 15 12.5C15 13.8807 13.8807 15 12.5 15C11.1193 15 10 13.8807 10 12.5ZM6 16.5C6 15.1193 7.11929 14 8.5 14C9.88071 14 11 15.1193 11 16.5C11 17.8807 9.88071 19 8.5 19C7.11929 19 6 17.8807 6 16.5ZM14 16.5C14 15.1193 15.1193 14 16.5 14C17.8807 14 19 15.1193 19 16.5C19 17.8807 17.8807 19 16.5 19C15.1193 19 14 17.8807 14 16.5ZM14 12.5C14 11.1193 15.1193 10 16.5 10C17.8807 10 19 11.1193 19 12.5C19 13.8807 17.8807 15 16.5 15C15.1193 15 14 13.8807 14 12.5ZM18 12.5C18 11.1193 19.1193 10 20.5 10C21.8807 10 23 11.1193 23 12.5C23 13.8807 21.8807 15 20.5 15C19.1193 15 18 13.8807 18 12.5ZM14 8.5C14 7.11929 15.1193 6 16.5 6C17.8807 6 19 7.11929 19 8.5C19 9.88071 17.8807 11 16.5 11C15.1193 11 14 9.88071 14 8.5Z" /></svg>
                            Publish Slack Report
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                    {STAGES.map((stageKey, idx) => {
                        const stageData = (run.stageSummary || {})[stageKey] || { status: 'NOT_STARTED' };
                        const isActive = stageData.status === 'RUNNING';

                        let durationStr = '';
                        if (stageData.startedAt && stageData.endedAt) {
                            const ms = new Date(stageData.endedAt).getTime() - new Date(stageData.startedAt).getTime();
                            if (ms < 1000) durationStr = `${ms}ms`;
                            else durationStr = `${(ms / 1000).toFixed(1)}s`;
                        }

                        return (
                            <div key={stageKey} className={`relative flex flex-col p-3 rounded-md border ${isActive ? 'bg-blue-500/5 border-blue-500/30' : 'bg-neutral-900 border-white/5'}`}>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-bold tracking-wider text-neutral-500">0{idx + 1}</span>
                                    {isActive && (
                                        <span className="flex h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></span>
                                    )}
                                </div>
                                <h3 className={`text-[11px] font-bold tracking-widest uppercase mb-3 ${isActive ? 'text-white' : 'text-neutral-400'}`}>
                                    {stageKey}
                                </h3>
                                <div className="mt-auto flex items-center justify-between">
                                    <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-[9px] uppercase font-bold tracking-widest ring-1 ring-inset ${getStageColor(stageData.status)}`}>
                                        {stageData.status}
                                    </span>
                                    {durationStr && (
                                        <span className="text-[10px] font-mono text-neutral-500">{durationStr}</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Task Log Stream */}
            <div className="argonaut-panel flex flex-col h-[600px] overflow-hidden">
                <div className="p-4 border-b border-white/5 bg-neutral-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
                    <div className="flex items-center gap-6">
                        <button
                            onClick={() => setView('timeline')}
                            className={`text-[11px] uppercase tracking-[0.2em] font-bold transition-colors pb-1 border-b-2 ${view === 'timeline' ? 'text-blue-400 border-blue-400' : 'text-neutral-500 border-transparent hover:text-neutral-300'}`}
                        >
                            Task Stream
                        </button>
                        <button
                            onClick={() => setView('graph')}
                            className={`text-[11px] uppercase tracking-[0.2em] font-bold transition-colors pb-1 border-b-2 ${view === 'graph' ? 'text-blue-400 border-blue-400' : 'text-neutral-500 border-transparent hover:text-neutral-300'}`}
                        >
                            Dependency Graph
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <select
                            className="bg-neutral-950 border border-white/10 text-neutral-300 text-[11px] uppercase tracking-wider rounded-sm px-2 py-1 outline-none"
                            value={selectedStage || ''}
                            onChange={e => setSelectedStage(e.target.value || null)}
                        >
                            <option value="">All Stages</option>
                            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>

                        <button
                            onClick={() => setShowAllTasks(!showAllTasks)}
                            className={`text-[10px] uppercase font-bold tracking-widest px-3 py-1.5 rounded-sm transition-colors border ${showAllTasks
                                ? 'bg-white/10 text-white border-white/20'
                                : 'bg-transparent text-neutral-400 border-white/10 hover:bg-white/5'
                                }`}
                        >
                            {showAllTasks ? 'Showing All' : 'Milestones Only'}
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden relative">
                    {view === 'timeline' ? (
                        <div className="h-full overflow-y-auto p-4 space-y-2 font-mono text-sm">
                            {filteredLogs.length === 0 ? (
                                <div className="text-center py-12 text-neutral-500 italic text-[11px] uppercase tracking-widest">
                                    No tasks found matching criteria
                                </div>
                            ) : (
                                filteredLogs.map(log => (
                                    <div
                                        key={log.id || log.seq}
                                        className={`flex items-start gap-3 p-2.5 rounded-sm border ${log.status === 'FAILED' ? 'bg-red-500/5 border-red-500/20' :
                                            log.taskType === 'SYSTEM' ? 'bg-blue-500/5 border-blue-500/10' :
                                                'bg-transparent border-transparent hover:bg-white/5'
                                            }`}
                                        id={`log-${log.seq}`}
                                    >
                                        <div className="mt-0.5 shrink-0">
                                            {getLogIcon(log.status)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline gap-2 mb-1">
                                                <span className="text-neutral-500 text-[10px]">[{log.seq}]</span>
                                                <span className="text-[10px] font-bold text-emerald-500">{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                                <span className="text-[10px] uppercase font-bold tracking-widest text-blue-400">[{log.stage}]</span>
                                                {log.taskType === 'SYSTEM' && (
                                                    <span className="text-[9px] uppercase tracking-widest bg-blue-500/20 text-blue-300 px-1 rounded-sm">SYS</span>
                                                )}
                                            </div>
                                            <p className={`text-[13px] break-words ${log.status === 'FAILED' ? 'text-red-400' : 'text-neutral-300'}`}>
                                                {log.message}
                                            </p>

                                            {log.refs && Object.keys(log.refs).length > 0 && (
                                                <div className="mt-2 text-[10px] text-neutral-500 bg-black/20 p-2 rounded-sm overflow-x-auto">
                                                    {JSON.stringify(log.refs)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={logsEndRef} />
                        </div>
                    ) : (
                        <div className="h-full">
                            {loadingGraph ? (
                                <div className="flex items-center justify-center h-full text-neutral-500 animate-pulse uppercase tracking-[0.2em] text-[11px]">
                                    Generating Graph...
                                </div>
                            ) : graphData ? (
                                <RunDependencyGraph data={graphData} />
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-neutral-500 space-y-4">
                                    <div className="p-4 rounded-full bg-white/5 border border-white/10">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
                                    </div>
                                    <span className="uppercase tracking-[0.2em] text-[11px]">Graph not available for this run</span>
                                    <p className="text-[10px] text-neutral-600 max-w-[200px] text-center">Ensure the DEP_GRAPH stage has completed successfully.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
