'use client';

import React, { useState, useEffect } from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';

interface ResearchDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    runId: string;
    findingId: string | null;
}

type TabKey = 'evidence' | 'graph' | 'threat' | 'fix' | 'actions';

export default function ResearchDrawer({ isOpen, onClose, runId, findingId }: ResearchDrawerProps) {
    const [activeTab, setActiveTab] = useState<TabKey>('evidence');
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [generating, setGenerating] = useState(false);

    useEffect(() => {
        let active = true;

        const fetchData = async () => {
            if (!isOpen || !findingId) return;
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/findings/${findingId}?runId=${runId}`);
                if (!res.ok) {
                    throw new Error('Failed to fetch research context');
                }
                const json = await res.json();
                if (active) {
                    setData(json);
                }
            } catch (err: any) {
                if (active) {
                    setError(err.message || 'Unknown error');
                }
            } finally {
                if (active) setLoading(false);
            }
        };

        fetchData();

        return () => {
            active = false;
        };
    }, [isOpen, findingId, runId]);

    if (!isOpen) return null;

    const renderEvidence = () => {
        if (!data?.finding) return <div className="text-neutral-500">No evidence found.</div>;
        const { finding, reachability } = data;
        return (
            <div className="space-y-4">
                <div className="p-3 bg-neutral-900 border border-white/10 rounded">
                    <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Finding Definition</h3>
                    <div className="text-sm text-neutral-300 font-mono mb-2">{finding.findingId}</div>
                    <div className="text-sm text-neutral-200">{finding.description}</div>
                </div>

                <div className="p-3 bg-neutral-900 border border-white/10 rounded">
                    <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Location</h3>
                    <div className="text-sm text-neutral-300 font-mono break-all">{finding.assetUrl}</div>
                </div>

                <div className="p-3 bg-neutral-900 border border-white/10 rounded">
                    <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Reachability Context</h3>
                    {reachability ? (
                        <div className="text-sm text-neutral-300">
                            Status: <span className={reachability.reachable ? 'text-purple-400' : 'text-neutral-500'}>{reachability.status}</span>
                        </div>
                    ) : (
                        <div className="text-sm text-neutral-500">No reachability analysis performed.</div>
                    )}
                </div>
            </div>
        );
    };

    const renderGraph = () => {
        if (!data?.graphView?.available || !data.graphView.doc) {
            return (
                <div className="flex h-64 items-center justify-center border border-dashed border-white/10 rounded">
                    <span className="text-neutral-500 text-sm">Graph unavailable for this finding</span>
                </div>
            );
        }

        const { nodes, edges } = data.graphView.doc;
        // ReactFlow takes 'id', 'data.label', 'position' etc
        // Transforming basic nodes to reactflow
        const rfNodes = (nodes || []).map((n: any, i: number) => ({
            id: n.id,
            data: { label: n.label || n.id },
            position: { x: (i % 3) * 200, y: Math.floor(i / 3) * 100 }, // Dummy layout to make them visible
            style: {
                background: '#111',
                color: '#ddd',
                border: '1px solid #333',
                fontSize: 10,
                padding: '10px'
            }
        }));

        const rfEdges = (edges || []).map((e: any, i: number) => ({
            id: `e-${i}`,
            source: e.from,
            target: e.to,
            animated: true,
            style: { stroke: '#444' }
        }));

        return (
            <div className="h-[400px] border border-white/10 rounded bg-[#050505]">
                <ReactFlow nodes={rfNodes} edges={rfEdges} fitView>
                    <Background color="#333" gap={16} />
                    <Controls showInteractive={false} />
                </ReactFlow>
            </div>
        );
    };

    const renderThreat = () => {
        if (!data?.finding?.context?.threat) return <div className="text-neutral-500">No threat intel enriched yet.</div>;
        const threat = data.finding.context.threat;
        return (
            <div className="space-y-4">
                <div className="p-3 bg-neutral-900 border border-white/10 rounded">
                    <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Threat Intel</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <div className="text-xs text-neutral-500 mb-1">CISA KEV</div>
                            <div className={`text-sm font-medium ${threat.kev ? 'text-red-400' : 'text-neutral-400'}`}>
                                {threat.kev ? 'True (Known Exploited)' : 'False'}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-neutral-500 mb-1">EPSS Score</div>
                            <div className="text-sm text-neutral-300 font-mono">
                                {threat.epss ? (threat.epss * 100).toFixed(1) + '%' : 'N/A'}
                            </div>
                        </div>
                        {threat.cve && (
                            <div>
                                <div className="text-xs text-neutral-500 mb-1">CVE ID</div>
                                <div className="text-sm text-neutral-300 font-mono">{threat.cve}</div>
                            </div>
                        )}
                        {threat.source && (
                            <div>
                                <div className="text-xs text-neutral-500 mb-1">Intel Source</div>
                                <div className="text-sm text-neutral-300 font-mono">{threat.source}</div>
                            </div>
                        )}
                        {threat.intelVersion && (
                            <div>
                                <div className="text-xs text-neutral-500 mb-1">Intel Version</div>
                                <div className="text-sm text-neutral-300 font-mono">{threat.intelVersion}</div>
                            </div>
                        )}
                    </div>
                </div>

                {data.finding.priorityExplanation?.summary && (
                    <div className="p-3 bg-neutral-900 border border-white/10 rounded">
                        <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Priority Explanation</h3>
                        <div className="text-sm text-neutral-300">
                            {data.finding.priorityExplanation.summary}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const handleGenerateFix = async () => {
        if (!findingId) return;
        setGenerating(true);
        try {
            const requestId = `req_${Date.now()}`;
            const res = await fetch('/api/fixes/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    runId,
                    findingIds: [findingId],
                    mode: 'single',
                    requestId
                })
            });

            if (!res.ok) {
                const data = await res.json();
                alert(data.error || 'Failed to start fix generation');
                setGenerating(false);
            } else {
                // Poll for results or wait for a bit
                // For simplicity in this demo, we'll just wait and refresh
                setTimeout(async () => {
                    const res = await fetch(`/api/findings/${findingId}?runId=${runId}`);
                    if (res.ok) {
                        const json = await res.json();
                        setData(json);
                    }
                    setGenerating(false);
                }, 5000);
            }
        } catch (error) {
            console.error(error);
            setGenerating(false);
        }
    };

    const renderFix = () => {
        if (generating) {
            return (
                <div className="flex flex-col h-48 items-center justify-center border border-dashed border-blue-500/30 rounded bg-blue-500/5 animate-pulse">
                    <svg className="w-8 h-8 text-blue-400 animate-spin mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span className="text-blue-400 text-sm font-medium">Generating Fix Bundle...</span>
                    <span className="text-neutral-500 text-[10px] mt-2 font-mono uppercase tracking-widest">Argus Fix Engine Running</span>
                </div>
            );
        }

        if (data?.fix?.available && data.fix.latestBundle) {
            const bundle = data.fix.latestBundle;
            return (
                <div className="space-y-4">
                    <div className="p-4 border border-emerald-500/20 bg-emerald-500/5 rounded">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-emerald-400 font-bold flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Fix Bundle Available
                            </h3>
                            <span className="text-[10px] font-mono text-neutral-500 uppercase">{new Date(bundle.createdAt).toLocaleString()}</span>
                        </div>

                        <div className="space-y-3 mb-6">
                            <div>
                                <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Summary</div>
                                <div className="text-sm text-neutral-200 leading-relaxed">{bundle.payload?.patchSummary || 'Automated fix for finding.'}</div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Confidence</div>
                                    <div className="text-sm font-mono text-emerald-400">{(bundle.payload?.confidence * 100).toFixed(0)}%</div>
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Files Touched</div>
                                    <div className="text-sm text-neutral-400 font-mono truncate">{bundle.payload?.filesTouched?.join(', ') || 'N/A'}</div>
                                </div>
                            </div>
                        </div>

                        <button className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-xs rounded transition-all shadow-lg shadow-emerald-500/20 uppercase tracking-widest">
                            Review and Apply Fix
                        </button>
                    </div>
                </div>
            );
        }

        return (
            <div className="flex flex-col h-48 items-center justify-center border border-dashed border-white/10 rounded bg-neutral-900/50 group">
                <span className="text-neutral-500 text-sm mb-4">No fix currently generated for this finding.</span>
                <button
                    onClick={handleGenerateFix}
                    className="px-6 py-2 border border-blue-500/50 text-blue-400 hover:bg-blue-500 hover:text-white hover:border-blue-500 rounded transition-all text-xs font-bold uppercase tracking-widest shadow-lg shadow-blue-500/10 active:scale-95"
                >
                    Generate Fix
                </button>
            </div>
        );
    };

    const renderActions = () => {
        const actions = data?.actions || [];
        if (actions.length === 0) {
            return <div className="text-neutral-500 text-sm">No recorded actions for this finding.</div>;
        }

        return (
            <div className="space-y-3">
                {actions.map((act: any) => (
                    <div key={act.actionId} className="p-3 bg-neutral-900 border border-white/10 rounded relative pl-6">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-neutral-800 rounded-l"></div>
                        <div className="flex justify-between items-start mb-2">
                            <div className="text-xs font-bold text-neutral-300">{act.actionType}</div>
                            <div className="text-[10px] text-neutral-500 font-mono">{new Date(act.createdAt).toLocaleString()}</div>
                        </div>
                        <div className="text-xs text-neutral-400 break-all bg-black/20 p-2 rounded border border-white/5 font-mono">
                            {JSON.stringify(act.payload, null, 2)}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 bg-black/50 z-40 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            ></div>

            {/* Drawer */}
            <div
                className={`fixed inset-y-0 right-0 w-[500px] bg-[#0A0A0A] border-l border-white/10 z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0 shadow-2xl shadow-black' : 'translate-x-full'}`}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
                    <h2 className="text-lg font-bold text-white tracking-tight">Research Details</h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-neutral-400 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {loading ? (
                    <div className="p-8 text-center text-neutral-500">Loading context...</div>
                ) : error ? (
                    <div className="p-8 text-center text-red-400 font-mono text-sm bg-red-400/5 m-4 border border-red-400/20 rounded">
                        Error: {error}
                    </div>
                ) : (
                    <>
                        {/* Tabs Navigation */}
                        <div className="flex border-b border-white/10 px-4 pt-2 shrink-0">
                            {(['evidence', 'graph', 'threat', 'fix', 'actions'] as TabKey[]).map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === tab ? 'text-blue-400 border-blue-400' : 'text-neutral-500 border-transparent hover:text-neutral-300'} `}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-y-auto p-4">
                            {activeTab === 'evidence' && renderEvidence()}
                            {activeTab === 'graph' && renderGraph()}
                            {activeTab === 'threat' && renderThreat()}
                            {activeTab === 'fix' && renderFix()}
                            {activeTab === 'actions' && renderActions()}
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
