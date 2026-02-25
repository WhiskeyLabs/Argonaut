"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
    ShieldAlert,
    GitGraph,
    AlertTriangle,
    X,
    Ban,
    Wrench,
    Loader2,
    Zap,
    ZapOff,
    Upload,
    Package,
    Info,
    GraduationCap
} from "lucide-react";
import { reachabilityService } from "@/lib/services/reachabilityService";
import { GraphViewModelService } from "@/lib/services/graphViewModelService";
import { RecentLockfilesWidget } from "@/components/dashboard/RecentLockfilesWidget";
import ReachabilityGraph from "@/components/research/ReachabilityGraph";
import { CodeDiffPanel } from "@/components/research/CodeDiffPanel";
import { PatchReviewModal } from "@/components/research/PatchReviewModal";
import { PatchBundle } from "@/lib/types/patch";
import { AISuggestedFixCard } from "@/components/research/AISuggestedFixCard";
import { useFindingResearch } from "@/hooks/useFindingResearch";
import { useAISettings } from "@/hooks/useAISettings";
import { useAIAnalysis } from "@/hooks/useAIAnalysis";
import { dismissFinding, applyFix } from "@/lib/services/findingsActionService";
import { VulnerabilityStatsCard } from "@/components/research/VulnerabilityStatsCard";
import { MetadataCard } from "@/components/research/MetadataCard";
import { buildResearchCardsViewModel } from "@/lib/viewmodels/researchCards";
import { ThreatProvenanceCard } from "@/components/research/ThreatProvenanceCard";
import { TopNav } from "@/components/dashboard/TopNav";

import { DependencyStatusBadge } from "@/components/dashboard/DependencyStatusBadge";
import { useFindingTriage } from "@/hooks/useFindingTriage";
import { Severity, FindingStatus } from "@/lib/types/finding";
import { NormalizedSeverity, NormalizedStatus } from "@/lib/types/research";
import { createSimpleDiff } from "@/lib/utils/simpleDiff";
import { toast } from "react-hot-toast"; // Assuming react-hot-toast for toast.success/error
import { setLastActiveSessionId, setLastResearchContext } from "@/lib/navigation/navMemory";

interface ResearchPageClientProps {
    sessionId: string;
    findingId: string;
}

export default function ResearchPageClient({ sessionId, findingId }: ResearchPageClientProps) {
    const searchParams = useSearchParams();
    const stateKey = searchParams.get('stateKey');
    const closeHref = stateKey
        ? `/dashboard/${sessionId}?stateKey=${encodeURIComponent(stateKey)}`
        : `/dashboard/${sessionId}`;
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [toastMessage, setToastMessage] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

    // Data Hook
    const { context, finding, loading, error } = useFindingResearch(sessionId, findingId);

    // Triage Hook
    const { updateSeverity, updateStatus } = useFindingTriage();

    // AI Hooks (Must come before error check)
    const { aiEnabled, setAIEnabled } = useAISettings(sessionId);
    const [showPatchModal, setShowPatchModal] = useState(false);
    const [generatedPatch, setGeneratedPatch] = useState<PatchBundle | null>(null);
    const [isGeneratingPatch, setIsGeneratingPatch] = useState(false);
    const [dismissPromptOpen, setDismissPromptOpen] = useState(false);
    const [dismissReason, setDismissReason] = useState("");
    const [dismissNote, setDismissNote] = useState("");
    const [isDismissing, setIsDismissing] = useState(false);

    useEffect(() => {
        setLastActiveSessionId(sessionId);
        setLastResearchContext(sessionId, findingId);
    }, [sessionId, findingId]);

    const { result: aiResult, state: aiState, generateFix } = useAIAnalysis(context, aiEnabled);

    // Stable State Handlers (Prevent UI Valid/Loading flicker)
    const [internalSeverity, setInternalSeverity] = useState<Severity>('info');
    const [internalStatus, setInternalStatus] = useState<FindingStatus>('open');

    // Sync internal state when finding loads/updates
    React.useEffect(() => {
        if (finding?.severity) setInternalSeverity(finding.severity);
        if (finding?.status) setInternalStatus(finding.status);
    }, [finding?.severity, finding?.status]);

    // View Model
    const vm = useMemo(() => {
        if (!context) return null;

        // Convert internal state (lowercase) to normalized (uppercase) for the VM
        const statusOverride = internalStatus ? internalStatus.toUpperCase() as NormalizedStatus : undefined;
        const severityOverride = internalSeverity ? internalSeverity.toUpperCase() as NormalizedSeverity : undefined;

        return buildResearchCardsViewModel(context, {
            status: statusOverride,
            severity: severityOverride
        });
    }, [context, internalStatus, internalSeverity]);

    const summaryTitle = (context?.title || "").trim();

    const actionSummary = useMemo(() => {
        if (context?.fixActionLabel?.trim()) {
            return context.fixActionLabel.trim();
        }

        if (context?.fixAction === "upgrade_libraries" && context.packageName) {
            return `Upgrade ${context.packageName} to a patched version.`;
        }

        if (context?.fixAction === "sanitize_inputs") {
            return "Sanitize untrusted inputs before use.";
        }
        if (context?.fixAction === "config_changes") {
            return "Apply the recommended security configuration changes.";
        }
        if (context?.fixAction === "review_code") {
            return "Review code path and apply targeted remediation.";
        }

        return null;
    }, [context?.fixAction, context?.fixActionLabel, context?.packageName]);

    const showActionCard = useMemo(() => {
        if (!actionSummary) return false;
        const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
        if (!summaryTitle) return true;
        return normalize(actionSummary) !== normalize(summaryTitle);
    }, [actionSummary, summaryTitle]);

    // Callbacks
    const handleNodeClick = (nodeId: string) => {
        setSelectedNodeId(prev => prev === nodeId ? null : nodeId);
    };

    // Lockfile Handlers
    const handleLockfileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            await reachabilityService.setLockfile(sessionId, text, file.name);
            setToastMessage({ message: 'Lockfile attached! Graph building...', type: 'success' });
            // Hook will auto-reload due to session change
        } catch (err) {
            console.error(err);
            setToastMessage({ message: 'Failed to process lockfile', type: 'error' });
        }
    };

    const handleRecentLockfile = async (content: string, filename: string) => {
        try {
            await reachabilityService.setLockfile(sessionId, content, filename);
            setToastMessage({ message: 'Recent lockfile attached!', type: 'success' });
        } catch (err) {
            console.error(err);
            setToastMessage({ message: 'Failed to attach lockfile', type: 'error' });
        }
    };

    const handleDismissConfirm = async () => {
        if (!dismissReason) return;
        try {
            setIsDismissing(true);
            const reasonText = dismissNote.trim()
                ? `${dismissReason}: ${dismissNote.trim()}`
                : dismissReason;
            const result = await dismissFinding(findingId, reasonText);
            if (result.success) {
                setInternalStatus("ignored");
                setToastMessage({ message: "Finding dismissed", type: "info" });
                setDismissPromptOpen(false);
                setDismissReason("");
                setDismissNote("");
                return;
            }
            setToastMessage({ message: result.error || "Failed to dismiss", type: "error" });
        } catch {
            setToastMessage({ message: "Failed to dismiss", type: "error" });
        } finally {
            setIsDismissing(false);
        }
    };



    // Reachability might be loading independently or unavailable
    const reachability = context?.reachability;

    // Epic 6: High-fidelity Graph ViewModel
    const graphViewModel = useMemo(() => {
        if (!reachability || !context) return null;
        return GraphViewModelService.mapResultToViewModel(reachability, context);
    }, [reachability, context]);

    const selectedNode = useMemo(() => {
        if (!selectedNodeId || !graphViewModel) return null;
        return graphViewModel.nodes.find(n => n.id === selectedNodeId);
    }, [selectedNodeId, graphViewModel]);

    // Loading State
    const handleGeneratePatch = async () => {
        setIsGeneratingPatch(true);
        try {
            const result = await generateFix();
            if (result && result.patch) {
                // Convert FixSuggestionArtifact to PatchBundle
                // This is required because result.patch is just {before, after}, not a full bundle with diffs
                const bundle: PatchBundle = {
                    patch_id: result.id,
                    type: result.type === 'Upgrade' ? 'dependency_update' : 'code_fix',
                    summary: result.summary,
                    changes: [{
                        path: context?.location.path || 'unknown',
                        diff: createSimpleDiff(
                            context?.location.path || 'unknown',
                            result.patch.before,
                            result.patch.after,
                            context?.location.startLine || 1
                        )
                    }],
                    risk: {
                        level: 'medium', // Default assumption for AI fixes
                        notes: ['Generated by Argus AI - Review logic carefully']
                    }
                } as unknown as PatchBundle; // Force cast due to potentially strict PatchBundle type

                setGeneratedPatch(bundle);
                setShowPatchModal(true);
                toast.success("Patch bundle generated successfully");
            } else {
                toast.error("Failed to generate patch bundle");
            }
        } catch (error) {
            console.error("Patch generation failed", error);
            toast.error("An error occurred while generating the patch");
        } finally {
            setIsGeneratingPatch(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                    <p>Loading research context...</p>
                </div>
            </div>
        );
    }

    if (error || !context) {
        return (
            // ... (keep existing error UI)
            <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">
                <div className="flex flex-col items-center gap-4 max-w-md text-center p-6 border border-white/10 rounded-xl bg-white/5">
                    <ShieldAlert className="h-12 w-12 text-red-500 mb-2" />
                    <h2 className="text-xl font-bold text-white">Finding Not Found</h2>
                    <p className="text-gray-400">
                        Could not retrieve finding {findingId} from session {sessionId}.
                    </p>
                    <Link href={`/dashboard/${sessionId}`} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md text-white transition-colors mt-4">
                        Return to Dashboard
                    </Link>
                </div>
            </div>
        );
    }



    return (
        <div className="h-screen w-full bg-[#f8f9fa] text-gray-900 dark:bg-[#09090b] dark:text-white overflow-hidden pointer-events-auto">
            <TopNav closeHref={closeHref} />
            <main className="mt-14 h-[calc(100vh-3.5rem)] flex flex-col min-w-0 transition-all duration-300 ease-in-out relative">
                {toastMessage && (
                    <div className={`absolute top-3 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 rounded-full text-xs font-medium shadow-lg transition-all ${toastMessage.type === 'success' ? 'bg-emerald-500 text-white' :
                        toastMessage.type === 'error' ? 'bg-red-500 text-white' :
                            'bg-gray-800 text-white'
                        }`}>
                        {toastMessage.message}
                        <button onClick={() => setToastMessage(null)} className="ml-2 opacity-70 hover:opacity-100">×</button>
                    </div>
                )}

                {/* Content Body */}
                <div className="flex-1 flex overflow-hidden p-3 gap-3">
                    {/* Left Column: Stats & Metadata */}
                    {vm && (
                        <div className="w-[320px] flex flex-col gap-3 shrink-0 overflow-y-auto">
                            <VulnerabilityStatsCard
                                vm={vm}
                                researchTitle={context.title}
                                cveId={context.cve}
                                ruleId={context.identity.ruleId}
                            />

                            <MetadataCard vm={vm} />

                            {showActionCard && (
                                <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white/60 dark:bg-gray-900/60 p-4 shadow-sm">
                                    <div className="space-y-3">
                                        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                                            Action
                                        </h3>
                                        <p className="line-clamp-2 text-sm text-gray-800 dark:text-gray-200">
                                            {actionSummary}
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white/60 dark:bg-gray-900/60 p-4 shadow-sm">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                                            Triage
                                        </h3>
                                        {internalStatus !== "ignored" && (
                                            <button
                                                onClick={() => setDismissPromptOpen((prev) => !prev)}
                                                className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-500 transition-colors"
                                                title="Dismiss finding"
                                            >
                                                <Ban className="h-3 w-3" />
                                                Dismiss
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between gap-3">
                                        <label className="text-[12px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Severity</label>
                                        <select
                                            value={finding?.severity ?? internalSeverity}
                                            onChange={(e) => {
                                                const newSev = e.target.value as Severity;
                                                setInternalSeverity(newSev);
                                                if (finding) updateSeverity(finding, newSev);
                                            }}
                                            disabled={!finding}
                                            className="min-w-[150px] max-w-[62%] flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-gray-900 dark:border-white/10 dark:bg-gray-950 dark:text-white"
                                        >
                                            <option value="critical">Critical</option>
                                            <option value="high">High</option>
                                            <option value="medium">Medium</option>
                                            <option value="low">Low</option>
                                            <option value="info">Info</option>
                                        </select>
                                    </div>

                                    <div className="flex items-center justify-between gap-3">
                                        <label className="text-[12px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Status</label>
                                        <select
                                            value={finding?.status ?? internalStatus}
                                            onChange={(e) => {
                                                const newStatus = e.target.value as FindingStatus;
                                                setInternalStatus(newStatus);
                                                if (finding) updateStatus(finding, newStatus);
                                            }}
                                            disabled={!finding}
                                            className="min-w-[150px] max-w-[62%] flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-gray-900 dark:border-white/10 dark:bg-gray-950 dark:text-white"
                                        >
                                            <option value="open">Open</option>
                                            <option value="in_progress">In Progress</option>
                                            <option value="ignored" disabled>
                                                Ignored (use Dismiss)
                                            </option>
                                            <option value="false_positive">False Positive</option>
                                            <option value="risk_accepted">Risk Accepted</option>
                                            <option value="fixed">Fixed</option>
                                        </select>
                                    </div>

                                    {dismissPromptOpen && (
                                        <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-white/10 dark:bg-gray-950/80">
                                            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                                Dismiss Reason (Required)
                                            </p>
                                            <select
                                                value={dismissReason}
                                                onChange={(e) => setDismissReason(e.target.value)}
                                                className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-white/10 dark:bg-gray-900 dark:text-white"
                                            >
                                                <option value="">Select a reason…</option>
                                                <option value="False positive">False positive</option>
                                                <option value="Accepted risk">Accepted risk</option>
                                                <option value="Out of scope">Out of scope</option>
                                                <option value="Duplicate finding">Duplicate finding</option>
                                                <option value="Deferred remediation">Deferred remediation</option>
                                            </select>
                                            <input
                                                value={dismissNote}
                                                onChange={(e) => setDismissNote(e.target.value)}
                                                placeholder="Optional note"
                                                className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 dark:border-white/10 dark:bg-gray-900 dark:text-white"
                                            />
                                            <div className="flex items-center justify-end gap-2 pt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setDismissPromptOpen(false);
                                                        setDismissReason("");
                                                        setDismissNote("");
                                                    }}
                                                    className="rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-100 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={!dismissReason || isDismissing}
                                                    onClick={() => void handleDismissConfirm()}
                                                    className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
                                                >
                                                    {isDismissing ? "Dismissing..." : "Confirm Dismiss"}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Center Column: Graph */}
                    <div className="flex-1 flex flex-col min-h-0 gap-3">
                        {/* Graph Container */}
                        <div className="flex-1 rounded-xl border border-gray-200 dark:border-white/10 bg-white/40 dark:bg-gray-900/40 backdrop-blur-md overflow-hidden flex flex-col min-h-[400px] shadow-sm">
                            {/* Graph Header */}
                            <div className="border-b border-gray-200 dark:border-white/5 bg-white/50 dark:bg-white/5 px-4 py-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 mb-2">
                                            <GitGraph className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                                Dependency Graph Analysis
                                            </span>
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                                            Impact Radius: {reachability ? reachability.graph.nodes.length : 0} Elements
                                        </h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                                            Reachability path visualized.
                                            {context.packageName && (
                                                <>
                                                    {" "}Vulnerable package:{" "}
                                                    <code className="text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/20 px-1 rounded">
                                                        {context.packageName}
                                                    </code>
                                                </>
                                            )}
                                        </p>
                                    </div>
                                    <div className="shrink-0 pt-0.5">
                                        <DependencyStatusBadge analysis={context.dependencyAnalysis} />
                                    </div>
                                </div>
                            </div>
                            {/* ReactFlow Graph */}
                            <div className="flex-1 min-h-0 relative">
                                {
                                    (graphViewModel && reachability?.status !== 'UNAVAILABLE') ? (
                                        <>
                                            <ReachabilityGraph data={graphViewModel} onNodeClick={handleNodeClick} />

                                            {/* Node Inspector Panel */}
                                            {selectedNode && (
                                                <div className="absolute top-4 right-4 bottom-4 w-72 bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl backdrop-blur-md z-20 flex flex-col animate-slide-in-right overflow-hidden">
                                                    <div className="p-4 border-b border-gray-100 dark:border-white/5 flex items-center justify-between bg-gray-50/50 dark:bg-black/20">
                                                        <div className="flex items-center gap-2">
                                                            <Package className="h-4 w-4 text-primary-500" />
                                                            <h3 className="text-xs font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Node Inspector</h3>
                                                        </div>
                                                        <button
                                                            onClick={() => setSelectedNodeId(null)}
                                                            className="p-1 hover:bg-gray-200 dark:hover:bg-white/10 rounded-md transition-colors"
                                                        >
                                                            <X className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>

                                                    <div className="p-5 flex-1 overflow-y-auto space-y-6">
                                                        {/* Header Info */}
                                                        <div>
                                                            <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-1 line-clamp-2">{selectedNode.packageName}</h2>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] font-mono bg-gray-100 dark:bg-white/5 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-400">
                                                                    v{selectedNode.version || '*'}
                                                                </span>
                                                                {selectedNode.type === 'VULNERABLE_PACKAGE' && (
                                                                    <span className="text-[10px] font-bold bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded">
                                                                        VULNERABLE
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Provenance */}
                                                        <div className="space-y-3">
                                                            <h4 className="text-[10px] font-black uppercase tracking-wider text-gray-400">Provenance</h4>
                                                            <div className="grid grid-cols-2 gap-3">
                                                                <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5">
                                                                    <div className="text-[8px] text-gray-400 uppercase mb-1">Type</div>
                                                                    <div className="text-[10px] font-bold text-gray-700 dark:text-gray-300">
                                                                        {selectedNode.type.replace('_', ' ')}
                                                                    </div>
                                                                </div>
                                                                <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5">
                                                                    <div className="text-[8px] text-gray-400 uppercase mb-1">Status</div>
                                                                    <div className="text-[10px] font-bold text-gray-700 dark:text-gray-300">
                                                                        {selectedNode.status}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {selectedNode.evidence?.nearestDirectParent && (
                                                                <div className="p-3 rounded-xl bg-primary-50/30 dark:bg-primary-900/10 border border-primary-100/50 dark:border-primary-800/30">
                                                                    <div className="text-[8px] text-primary-500 font-bold uppercase mb-1">Nearest Direct Parent</div>
                                                                    <div className="text-[10px] font-bold text-gray-900 dark:text-gray-200">
                                                                        {selectedNode.evidence.nearestDirectParent}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Finding Details */}
                                                        {selectedNode.finding && (
                                                            <div className="space-y-3">
                                                                <h4 className="text-[10px] font-black uppercase tracking-wider text-red-400">Security Context</h4>
                                                                <div className="p-3 rounded-xl bg-red-50/50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 space-y-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                                                        <div className="text-[10px] font-bold text-red-700 dark:text-red-400">
                                                                            {selectedNode.finding.severity} Severity
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-[10px] text-gray-600 dark:text-gray-300 leading-relaxed italic">
                                                                        This node is the primary pivot for current reachability analysis.
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="p-4 border-t border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-black/20">
                                                        <button
                                                            className="w-full py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-[10px] font-bold transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                                                            onClick={() => toast.success(`Provenance analysis for ${selectedNode.packageName} initiated.`, { icon: <Info className="h-4 w-4 text-primary" /> })}
                                                        >
                                                            <Zap className="h-3 w-3" />
                                                            Audit Full Path
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm p-8 text-center">
                                            <div className="bg-gray-100 dark:bg-white/5 p-4 rounded-full mb-3">
                                                <GitGraph className="h-8 w-8 text-gray-400" />
                                            </div>
                                            <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Dependency Graph Unavailable</h4>
                                            <p className="max-w-xs text-xs text-gray-500 mb-6">
                                                Upload a package-lock.json to enable deterministic dependency tracing and reachability analysis.
                                            </p>

                                            <div className="flex flex-col items-center gap-4 w-full max-w-sm">
                                                <label className="flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg cursor-pointer transition-colors w-full text-sm font-medium">
                                                    <Upload className="h-4 w-4" />
                                                    Upload Lockfile
                                                    <input
                                                        type="file"
                                                        accept=".json,package-lock.json"
                                                        className="hidden"
                                                        onChange={handleLockfileUpload}
                                                    />
                                                </label>

                                                <div className="relative w-full flex items-center py-2">
                                                    <div className="flex-grow border-t border-gray-200 dark:border-white/10"></div>
                                                    <span className="flex-shrink-0 mx-4 text-xs text-gray-400">OR USE RECENT</span>
                                                    <div className="flex-grow border-t border-gray-200 dark:border-white/10"></div>
                                                </div>

                                                <div className="w-full max-h-[200px] overflow-y-auto border border-gray-200 dark:border-white/10 rounded-lg">
                                                    <RecentLockfilesWidget
                                                        onSelect={handleRecentLockfile}
                                                        className="mt-0"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )
                                }
                            </div>
                        </div>
                    </div >


                    {/* Right Column: Code Panels + Evidence */}
                    <div className="w-[380px] flex flex-col gap-3 shrink-0 overflow-y-auto">
                        {/* Selected Node Info (if any) */}
                        {
                            selectedNodeId && (
                                <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white/60 dark:bg-gray-900/60 p-3 backdrop-blur-md shadow-sm">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-mono text-sm text-gray-900 dark:text-white">{selectedNodeId.replace('node-', '')}</span>
                                        <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">SELECTED</span>
                                    </div>
                                </div>
                            )
                        }

                        {/* Vulnerable Context */}
                        <div className="flex flex-col rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-black/40 overflow-hidden shadow-sm">
                            <div className="flex items-center justify-between border-b border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-white/5 px-3 py-2">
                                <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    Vulnerable Context
                                </span>
                                <span className="font-mono text-xs text-gray-500 truncate max-w-[150px]" title={context.location.path || ''}>
                                    {context.location.path?.split('/').pop() || 'Unknown'}
                                </span>
                            </div>
                            <div className="p-3 font-mono text-xs text-gray-800 dark:text-gray-300 bg-gray-50 dark:bg-[#0d0d0d] overflow-x-auto">
                                {context.snippet.raw ? (
                                    <pre className="whitespace-pre-wrap">{context.snippet.raw}</pre>
                                ) : (
                                    <div className="flex flex-col gap-1 opacity-50">
                                        <div className="flex">
                                            <span className="mr-3 w-6 text-right text-gray-500 dark:text-gray-700">{context.location.startLine! - 1}</span>
                                            <span>{'// Use file reader integration to view source'}</span>
                                        </div>
                                        <div className="flex bg-red-50 dark:bg-red-900/10 -mx-3 px-3 border-l-2 border-red-500">
                                            <span className="mr-3 w-6 text-right text-red-600 dark:text-red-700">{context.location.startLine}</span>
                                            <span className="text-red-800 dark:text-red-200">{'// Vulnerability detected at line '}{context.location.startLine}</span>
                                        </div>
                                        <div className="flex">
                                            <span className="mr-3 w-6 text-right text-gray-500 dark:text-gray-700">{context.location.startLine! + 1}</span>
                                            <span>{'// '}{context.tool} finding: {context.title}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Suggested Fix (Unified) */}
                        <div className="flex flex-col gap-3">
                            {aiState === 'success' && aiResult ? (
                                // Case 1: AI Fix -> Render as "AI-Generated" (Prioritized)
                                <AISuggestedFixCard
                                    fix={aiResult}
                                    onApply={/* AI fixes might be complex, maybe open modal or apply if simple patch? */ undefined}
                                    contextFilePath={context.location.path}
                                    onGeneratePatch={handleGeneratePatch}
                                    isGeneratingPatch={isGeneratingPatch}
                                />
                            ) : context.fixAction ? (
                                // Case 2: Standard/Deterministic Fix -> Render as "Verified Rule" (Fallback)
                                <AISuggestedFixCard
                                    fix={{
                                        id: 'standard-fix',
                                        type: context.fixAction === 'upgrade_libraries' ? 'Upgrade' : 'Config', // heuristic
                                        summary: context.fixActionLabel || 'Standard Remediation',
                                        patch: {
                                            before: '', // Standard fixes often don't have a specific "before" block readily available in this context unless we parse snippet
                                            after: context.fixAction === 'upgrade_libraries'
                                                ? `npm update ${context.packageName}`
                                                : (context.description || 'Apply configuration changes as recommended.')
                                        },
                                        source: {
                                            type: 'STATIC_RULE',
                                            ref: context.tool
                                        },
                                        confidence: 100
                                    }}
                                    showLoadingAI={aiState === 'loading'}
                                    contextFilePath={context.location.path}
                                    onApply={async () => {
                                        try {
                                            const result = await applyFix(findingId);
                                            if (result.success) {
                                                toast.success('Marked as fixed. Status updated.');
                                            } else {
                                                toast.error(result.error || 'Failed to mark as fixed.');
                                            }
                                        } catch (e) {
                                            console.error('Failed to mark finding as fixed', e);
                                            toast.error('Failed to mark as fixed.');
                                        }
                                    }}
                                />
                            ) : (
                                // Case 3: No Fix / Loading / Error / Disabled
                                <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-black/40 overflow-hidden shadow-sm min-h-[150px] flex flex-col">
                                    <div className="flex items-center justify-between border-b border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-white/5 px-3 py-2">
                                        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400">
                                            <Wrench className="h-3.5 w-3.5" />
                                            Suggested Fix
                                        </span>
                                    </div>

                                    {!aiEnabled ? (
                                        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-gray-400 dark:text-gray-500">
                                            <ZapOff className="h-8 w-8 mb-2 opacity-50" />
                                            <p className="mb-2 font-medium">AI Assistance Disabled</p>
                                            <button
                                                onClick={() => setAIEnabled(true)}
                                                className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                                            >
                                                Enable AI features
                                            </button>
                                        </div>
                                    ) : aiState === 'loading' ? (
                                        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-gray-400">
                                            <Loader2 className="h-6 w-6 animate-spin mb-2 text-emerald-500" />
                                            <p>Analyzing context...</p>
                                        </div>
                                    ) : (
                                        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-gray-400">
                                            <p className="text-sm opacity-50">No automated fix available.</p>
                                            {aiState === 'error' && (
                                                <button onClick={() => generateFix()} className="mt-2 text-xs text-blue-500 hover:underline">
                                                    Retry Analysis
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Provenance & Context Debug */}
                        <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white/60 dark:bg-gray-900/60 p-3 backdrop-blur-md shadow-sm">
                            <div className="flex items-center gap-2 mb-2">
                                <GraduationCap className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Context Provenance</span>
                            </div>
                            <div className="space-y-1.5 text-xs">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-500">input_hash</span>
                                    <span className="font-mono text-gray-700 dark:text-gray-300 truncate max-w-[180px]" title={context.input_hash}>
                                        {context.input_hash.substring(0, 12)}…
                                    </span>
                                </div>

                                {/* Task 4.4: Active Model Provenance */}
                                {aiState === 'success' && aiResult?.modelStatus && (
                                    <div className="flex justify-between items-center pt-1 border-t border-gray-200 dark:border-white/5 mt-1">
                                        <span className="text-gray-500">Model</span>
                                        <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 truncate max-w-[150px]" title={aiResult.modelStatus.provenance.model_name}>
                                            {aiResult.modelStatus.provenance.model_name.split('/').pop()}
                                        </span>
                                    </div>
                                )}
                                {aiState === 'success' && aiResult?.modelStatus && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-500">Latency</span>
                                        <span className="font-mono text-[10px] text-gray-500">
                                            {aiResult.modelStatus.provenance.latency_ms}ms
                                        </span>
                                    </div>
                                )}

                                <div className="flex flex-wrap gap-1.5 pt-1">
                                    {Object.entries(context.availability).map(([key, val]) => (
                                        <span
                                            key={key}
                                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${val
                                                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                                                : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600'
                                                }`}
                                        >
                                            {key.replace('has', '')}: {val ? '✓' : '—'}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Threat Provenance */}
                        <ThreatProvenanceCard cveId={context.cve} />
                    </div>
                </div>
            </main>
            {/* Modals */}
            <PatchReviewModal
                isOpen={showPatchModal}
                onClose={() => setShowPatchModal(false)}
                patch={generatedPatch}
            />
        </div>
    );
}
