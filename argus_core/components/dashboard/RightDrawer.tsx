'use client';

import { db } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, CheckCircle2, AlertTriangle, ExternalLink, Copy } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { reachabilityService } from '@/lib/services/reachabilityService';
import { PathList } from '@/components/dashboard/PathList';
import { DependencyStatusBadge } from '@/components/dashboard/DependencyStatusBadge';
import { ReachabilityStatus, ReachabilityResult } from '@/lib/types/reachability';
import { useFindingTriage } from '@/hooks/useFindingTriage';
import { Severity, FindingStatus } from '@/lib/types/finding';
import { useFindingResearch } from '@/hooks/useFindingResearch';
import { useAISettings } from '@/hooks/useAISettings';
import { useAIAnalysis } from '@/hooks/useAIAnalysis';
import { AISuggestedFixCard } from '@/components/research/AISuggestedFixCard';
import { saveResearchReturnState } from '@/lib/navigation/researchReturnState';
import type { DashboardReturnState } from '@/lib/navigation/researchReturnState';
import { setLastResearchContext } from '@/lib/navigation/navMemory';


export function RightDrawer({
    isOpen,
    onClose,
    findingId,
    sessionId,
    dashboardViewState
}: {
    isOpen: boolean;
    onClose: () => void;
    findingId: string | null;
    sessionId: string;
    dashboardViewState?: Omit<DashboardReturnState, 'sessionId' | 'savedAt'>;
}) {
    const router = useRouter();
    const [paths, setPaths] = useState<string[][]>([]);
    const [status, setStatus] = useState<ReachabilityStatus>('UNAVAILABLE');
    const [stats, setStats] = useState<{ impactRadiusCount: number; pathLength: number } | null>(null);
    const { updateSeverity, updateStatus } = useFindingTriage();

    // Deep Context & AI Logic
    const { context } = useFindingResearch(sessionId, findingId || '');
    const { aiEnabled } = useAISettings(sessionId);
    const { result: aiResult, state: aiState } = useAIAnalysis(context, aiEnabled);


    const finding = useLiveQuery(
        () => (findingId ? db.findings.get(findingId) : undefined),
        [findingId]
    );

    useEffect(() => {
        if (isOpen && finding && findingId) {
            const ctx = {
                packageName: finding.packageName,
                meta: {
                    sessionId,
                    findingId
                },
                // Legacy support/Type satisfaction (partial)
                severity: finding.severity || 'low'
            };

            reachabilityService.buildGraph(ctx).then((result) => {
                setStatus(result.status);
                setStats(result.stats);

                if (result.selectedPathNodeIds.length > 0) {
                    // Map IDs to labels using the result graph nodes
                    const nodeMap = new Map(result.graph.nodes.map(n => [n.id, n]));
                    const pathLabels = result.selectedPathNodeIds.map(id => {
                        const node = nodeMap.get(id);
                        return node?.label || id;
                    });
                    setPaths([pathLabels]);
                } else {
                    setPaths([]);
                }
            }).catch(err => {
                console.error('Failed to build graph text:', err);
                setPaths([]);
                setStatus('ERROR');
            });
        }
    }, [isOpen, findingId, finding, sessionId]);

    if (!isOpen || !finding) return null;

    // TODO: Create a "Checklist" or "Remediation" field in UniversalFinding schema
    // For now, we'll mock the checklist/remediation display based on severity/reachability
    // This maintains visual parity with the demo while we migrate schema
    const checklist = [
        { label: 'Publicly Accessible', state: 'pass' },
        { label: 'Active Execution Path', state: finding.reachability === 'reachable' ? 'pass' : 'fail' },
        { label: 'Exploitable Configuration', state: finding.severity === 'critical' ? 'fail' : 'pass' },
    ];

    const remediation = {
        description: finding.description || 'Upgrade the affected package to the latest safe version.',
        content: `npm update ${finding.packageName || 'package'}`
    };

    return (
        <div className="fixed bottom-40 right-6 top-[4.5rem] z-30 flex w-[480px] flex-col rounded-2xl border border-gray-200 dark:border-white/10 bg-white/95 dark:bg-gray-950/90 shadow-2xl backdrop-blur-xl transition-transform duration-300">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-gray-100 dark:border-white/5 p-6">
                <div>
                    <span className={`mb-2 inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${finding.severity === 'critical'
                        ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-400 ring-1 ring-primary-500/20 dark:ring-primary-500/50'
                        : 'bg-secondary-100 dark:bg-secondary-900/50 text-secondary-700 dark:text-secondary-400 ring-1 ring-secondary-500/20 dark:ring-secondary-500/50'
                        }`}>
                        {finding.severity}
                    </span>
                    <h2 className="text-xl font-bold leading-tight text-gray-900 dark:text-white">{finding.title}</h2>
                    <div className="mt-1 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-500">
                        <span className="font-mono">{finding.ruleId}</span>
                        <ExternalLink className="h-3 w-3" />
                    </div>
                </div>
                <button onClick={onClose} className="rounded-lg p-1 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white transition-colors">
                    <X className="h-5 w-5" />
                </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-white/10">

                {/* Dependency Status (Truth Pill) */}
                <div className="mb-6">
                    <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {aiState === 'success' ? 'Review Fix Suggestions' : 'Analysis Status'}
                    </h3>
                    <DependencyStatusBadge analysis={finding?.dependencyAnalysis} />
                </div>

                {/* Dependency Path Visualization */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Dependency Path</h3>
                            {stats && stats.impactRadiusCount > 0 && (
                                <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
                                    ({stats.impactRadiusCount} ancestors)
                                </span>
                            )}
                        </div>
                        {finding.findingType === 'SAST' && (
                            <span className="text-[10px] bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded font-medium">Not Applicable</span>
                        )}
                        {finding.findingType === 'SCA' && status === 'REAL' && (
                            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded font-medium">Verified Lockfile</span>
                        )}
                        {finding.findingType === 'SCA' && status === 'NO_MATCH' && (
                            <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">Package Not Found</span>
                        )}
                    </div>

                    {finding.findingType === 'SAST' ? (
                        <div className="rounded-lg border border-dashed border-gray-200 dark:border-white/10 p-4 text-center">
                            <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                                Evidence Not Applicable for Code Findings
                            </p>
                        </div>
                    ) : finding.findingType === 'SCA' && !finding.packageName ? (
                        <div className="rounded-lg border border-dashed border-primary-200 dark:border-primary-900/30 p-4 text-center">
                            <p className="text-xs text-primary-600 dark:text-primary-400">
                                Missing Package Identity for Dependency Graph
                            </p>
                            <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-500">
                                Ensure your scanner report includes 'purl' or 'packageName' properties.
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            <PathList paths={paths} status={status} />
                        </div>
                    )}
                </div>

                {/* Unified Remediation */}
                <div className="mb-6">
                    <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Suggested Fix</h3>

                    {aiState === 'success' && aiResult ? (
                        <AISuggestedFixCard
                            className="border-gray-200 dark:border-white/10 shadow-none"
                            fix={aiResult as any}
                            contextFilePath={finding.location.filepath}
                        />
                    ) : finding.fixAction ? (
                        <AISuggestedFixCard
                            className="border-gray-200 dark:border-white/10 shadow-none"
                            fix={{
                                id: 'drawer-fix',
                                type: finding.fixAction === 'upgrade_libraries' ? 'Upgrade' : 'Config',
                                summary: finding.fixActionLabel || 'Standard Remediation',
                                patch: {
                                    before: '',
                                    after: finding.fixAction === 'upgrade_libraries'
                                        ? (() => {
                                            const pkg = finding.packageName || 'package';
                                            const type = finding.purl?.split(':')[1]?.split('/')[0] || 'npm';
                                            switch (type) {
                                                case 'pypi': return `pip install --upgrade ${pkg}`;
                                                case 'golang': return `go get -u ${pkg}`;
                                                case 'maven': return `mvn versions:use-latest-releases -Dincludes=${pkg}`;
                                                case 'npm': default: return `npm update ${pkg}`;
                                            }
                                        })()
                                        : (finding.description || 'Apply configuration changes.')
                                },
                                source: {
                                    type: 'STATIC_RULE',
                                    ref: finding.tool || 'Scanner'
                                },
                                confidence: 100
                            } as any}
                            showLoadingAI={aiState === 'loading'}
                            contextFilePath={finding.location.filepath}
                        />
                    ) : (
                        <div className="rounded-lg border border-dashed border-gray-200 dark:border-white/10 p-4 text-center">
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                No automated fix available.
                            </p>
                        </div>
                    )}
                </div>


                {/* User Overrides (Triage) */}
                <div className="mb-6 rounded-xl border border-gray-200 dark:border-white/5 bg-gray-50/[0.5] dark:bg-white/[0.02] p-4">
                    <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Triage & Classification</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400">Severity</label>
                            <select
                                value={finding.severity}
                                onChange={(e) => updateSeverity(finding, e.target.value as Severity)}
                                className="w-full rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[10px] h-7 dark:border-white/10 dark:bg-gray-900 dark:text-white appearance-none cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                            >
                                <option value="critical">Critical</option>
                                <option value="high">High</option>
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                                <option value="info">Info</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400">Status</label>
                            <select
                                value={finding.status}
                                onChange={(e) => updateStatus(finding, e.target.value as FindingStatus)}
                                className="w-full rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[10px] h-7 dark:border-white/10 dark:bg-gray-900 dark:text-white appearance-none cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                            >
                                <option value="open">Open</option>
                                <option value="in_progress">In Progress</option>
                                <option value="ignored">Ignored</option>
                                <option value="false_positive">False Positive</option>
                                <option value="risk_accepted">Risk Accepted</option>
                                <option value="fixed">Fixed</option>
                            </select>
                        </div>
                    </div>
                </div>

            </div>

            {/* Sticky Bottom Actions */}
            <div className="border-t border-gray-100 dark:border-white/5 p-4 flex flex-col gap-3">
                <button
                    onClick={() => {
                        if (!findingId) return;
                        setLastResearchContext(sessionId, findingId);
                        const stateKey = dashboardViewState
                            ? saveResearchReturnState(sessionId, dashboardViewState)
                            : null;
                        const target = stateKey
                            ? `/research/${sessionId}/${findingId}?stateKey=${encodeURIComponent(stateKey)}`
                            : `/research/${sessionId}/${findingId}`;
                        router.push(target);
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-secondary-600 to-primary-600 dark:from-secondary-500 dark:to-primary-600 px-4 py-3 text-sm font-bold text-white shadow-[0_4_20px_rgba(226,59,46,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                    Research / Remediate
                    <ExternalLink className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
