import React from 'react';
import { useRouter } from 'next/navigation';
import { X, Shield, AlertTriangle, CheckCircle, Terminal, ExternalLink, Flame, Activity } from 'lucide-react';
import { UniversalFinding } from '../../lib/types/finding';
import { useFindingsBatchLoader } from '../../hooks/useFindingsBatchLoader';
import { AISuggestedFixCard } from '../research/AISuggestedFixCard';
import { useFindingResearch } from '../../hooks/useFindingResearch';
import { useAISettings } from '../../hooks/useAISettings';
import { useAIAnalysis } from '../../hooks/useAIAnalysis';
import { useThreatIntel } from '../../hooks/useThreatIntel';
import { setLastResearchContext } from '@/lib/navigation/navMemory';

interface FindingsDrawerProps {
    findingId: string | null;
    sessionId: string; // [NEW] Required for deep dive link
    onClose: () => void;
}

export function FindingsDrawer({ findingId, sessionId, onClose }: FindingsDrawerProps) {
    const router = useRouter(); // [NEW] For navigation

    // We reuse the batch loader for a single item. It deduplicates requests automatically.
    const findings = useFindingsBatchLoader(findingId ? [findingId] : []);
    const finding = findings.find(f => f.id === findingId);

    // Deep Context & AI Logic
    const { context } = useFindingResearch(sessionId, findingId || '');
    const { aiEnabled } = useAISettings(sessionId);
    const { result: aiResult, state: aiState, generateFix } = useAIAnalysis(context, aiEnabled);
    const { data: threatData } = useThreatIntel(finding?.ruleId);

    if (!findingId) return null;


    return (
        <div className="fixed right-4 top-20 bottom-8 w-[480px] bg-white dark:bg-gray-950 shadow-2xl border border-gray-200 dark:border-gray-800 rounded-2xl transform transition-transform duration-300 z-[100] flex flex-col font-sans overflow-hidden">

            {/* Close Button - Enhanced Visibility */}
            <button
                onClick={onClose}
                className="absolute top-5 right-5 p-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors z-50 shadow-sm"
                aria-label="Close Drawer"
            >
                <X className="h-4 w-4 text-gray-600 dark:text-gray-300" />
            </button>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-6 py-8 space-y-8">

                {finding ? (
                    <>
                        {/* Header Section */}
                        <div className="space-y-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wide
                                ${finding.severity === 'critical' ? 'bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-500' :
                                    finding.severity === 'high' ? 'bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-500' :
                                        'bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-500'
                                }`}
                            >
                                {finding.severity}
                            </span>

                            {/* Threat Intel Badge */}
                            {threatData && (threatData.kev || threatData.epssScore > 0.01) && (
                                <span className={`inline-flex items-center ml-2 px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wide border
                                    ${threatData.kev ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800' :
                                        'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800'}`}
                                >
                                    {threatData.kev ? (
                                        <><Flame className="w-3 h-3 mr-1" /> Active Exploit</>
                                    ) : (
                                        <><Activity className="w-3 h-3 mr-1" /> High Risk (EPSS {(threatData.epssScore * 100).toFixed(1)}%)</>
                                    )}
                                </span>
                            )}

                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight mb-1">
                                    {finding.title || 'Security Finding'}
                                </h1>
                                <span className="inline-flex items-center text-sm text-gray-500 dark:text-gray-400">
                                    {finding.ruleId}
                                    {/* Link logic would go here if we had a ruleUrl field */}
                                </span>
                            </div>
                        </div>

                        {/* Reachability Analysis (Blue Box - Kept as requested) */}
                        <div className="rounded-xl border border-blue-100 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-900/20 p-5">
                            <h3 className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-4 flex items-center">
                                <span className="mr-2">⚡</span> Reachability Analysis
                            </h3>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 rounded border border-blue-100 dark:border-blue-800/50 shadow-sm">
                                    <div className="flex items-center space-x-3">
                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Publicly Accessible</span>
                                    </div>
                                    <span className="text-[10px] font-mono text-gray-400 uppercase">Verified</span>
                                </div>

                                <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 rounded border border-blue-100 dark:border-blue-800/50 shadow-sm">
                                    <div className="flex items-center space-x-3">
                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Active Execution Path</span>
                                    </div>
                                    <span className="text-[10px] font-mono text-gray-400 uppercase">Verified</span>
                                </div>

                                <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 rounded border border-blue-100 dark:border-blue-800/50 shadow-sm opacity-75">
                                    <div className="flex items-center space-x-3">
                                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">No WAF Protection</span>
                                    </div>
                                    <span className="text-[10px] font-mono text-gray-400 uppercase">Inferred</span>
                                </div>
                            </div>
                        </div>

                        {/* Remediation Section */}
                        <div className="space-y-3">
                            {/* Prioritize AI Fix if available, else fallback to standard rule */}
                            {aiState === 'success' && aiResult ? (
                                <AISuggestedFixCard
                                    className="border-gray-100 dark:border-gray-800 shadow-none border"
                                    fix={aiResult as any}
                                />
                            ) : (
                                <AISuggestedFixCard
                                    className="border-gray-100 dark:border-gray-800 shadow-none border"
                                    fix={{
                                        id: 'drawer-fix',
                                        type: 'Upgrade',
                                        summary: finding.fixActionLabel || 'Standard Remediation',
                                        patch: {
                                            before: '',
                                            after: (finding.packageName || finding.purl) ? (() => {
                                                const pkg = finding.packageName || 'package';
                                                const type = finding.purl?.split(':')[1]?.split('/')[0] || 'npm';
                                                switch (type) {
                                                    case 'pypi': return `pip install --upgrade ${pkg}`;
                                                    case 'golang': return `go get -u ${pkg}`;
                                                    case 'maven': return `mvn versions:use-latest-releases -Dincludes=${pkg}`;
                                                    case 'npm': default: return `npm update ${pkg}`;
                                                }
                                            })() : 'Follow standard remediation practices.'
                                        },
                                        source: {
                                            type: 'STATIC_RULE',
                                            ref: finding.tool || 'Scanner'
                                        },
                                        confidence: 100
                                    } as any}
                                    showLoadingAI={aiState === 'loading'}
                                />
                            )}
                        </div>


                        {/* Location */}
                        <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Location</h3>
                            <div className="font-mono text-xs text-gray-500 break-all">
                                {finding.location.filepath}:{finding.location.startLine}
                            </div>
                        </div>

                    </>
                ) : (
                    <div className="flex items-center justify-center h-48 space-x-2 text-gray-400 animate-pulse">
                        <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce delay-75"></div>
                    </div>
                )}
            </div>

            {/* Footer Actions - Stacked Buttons */}
            <div className="p-6 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/50 space-y-3">
                <button className="w-full flex items-center justify-center px-4 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white rounded-lg font-medium shadow-lg shadow-red-500/20 transition-all transform active:scale-95">
                    Create Jira Ticket
                </button>
                <button
                    onClick={() => {
                        if (!findingId) return;
                        setLastResearchContext(sessionId, findingId);
                        router.push(`/research/${sessionId}/${findingId}`);
                    }}
                    className="w-full flex items-center justify-center px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-lg font-medium transition-colors">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in Research
                </button>

                {/* Session Audit (Mock) */}
                <div className="pt-4 mt-2">
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center">
                        <div className="h-1.5 w-1.5 rounded-full bg-gray-400 mr-2"></div>
                        Session Audit
                    </h4>
                    <div className="space-y-2 text-[10px] font-mono text-gray-500">
                        <div className="flex justify-between">
                            <span>Ingested 4 files</span>
                            <span className="text-gray-400">10:42 AM</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Session started</span>
                            <span className="text-gray-400">10:35 AM</span>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );
}
