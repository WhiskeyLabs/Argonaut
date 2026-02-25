'use client';

import React from 'react';
import Link from 'next/link';
import { BrainCircuit, Cpu, Sparkles, Shield, LockKeyhole, ArrowUpRight, AlertTriangle, PlugZap } from 'lucide-react';
import { useAISettings } from '@/hooks/useAISettings';
import { usePrivacySettings } from '@/hooks/usePrivacySettings';

const DEFAULT_MODEL_NAME = 'Qwen3-Coder-A35B';

export function AILlmPanel() {
    const { aiEnabled, aiWorkflowEnabled, blockedByPrivacy, snippetsAllowedByPolicy, setAIEnabled, isLoading } = useAISettings();
    const { policy } = usePrivacySettings();
    const toggleDisabled = isLoading || (blockedByPrivacy && !aiWorkflowEnabled);

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50/50 p-4 dark:border-white/10 dark:bg-white/[0.02]">
                <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">AI Workflow Toggle</p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        Controls whether AI-assisted remediation appears in the workbench
                    </p>
                </div>
                <button
                    onClick={() => {
                        if (blockedByPrivacy && !aiWorkflowEnabled) return;
                        void setAIEnabled(!aiWorkflowEnabled);
                    }}
                    disabled={toggleDisabled}
                    className={`relative h-5 w-10 shrink-0 rounded-full transition-all ${
                        aiWorkflowEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-700'
                    } ${toggleDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                    title={aiWorkflowEnabled ? 'Disable AI Analysis' : 'Enable AI Analysis'}
                >
                    <div
                        className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all"
                        style={{ left: aiWorkflowEnabled ? '22px' : '2px' }}
                    />
                </button>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-[11px] text-amber-900 dark:border-amber-700/30 dark:bg-amber-900/10 dark:text-amber-200">
                <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p>
                    Privacy and outbound data permissions are owned by <span className="font-semibold">Privacy &amp; Data Controls</span> (Phase 6.6).
                    This page focuses on model UX and analysis behavior.
                </p>
            </div>

            {blockedByPrivacy && (
                <div className="rounded-xl border border-red-200 bg-red-50/70 p-3 text-[11px] text-red-800 dark:border-red-800/50 dark:bg-red-900/15 dark:text-red-200">
                    <p className="flex items-center gap-1.5 font-semibold uppercase tracking-wide">
                        <LockKeyhole className="h-3.5 w-3.5" />
                        AI blocked by privacy policy
                    </p>
                    <p className="mt-1">
                        Hosted AI is currently disabled by effective policy (<span className="font-semibold">{policy.mode.replace('_', ' ')}</span>).
                        Update Privacy settings to allow cloud AI egress.
                    </p>
                </div>
            )}

            <div className="rounded-xl border border-gray-200 dark:border-white/10">
                <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.02]">
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                        <BrainCircuit className="h-3.5 w-3.5" />
                        Model
                    </h3>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/20 dark:text-emerald-300">
                        Active
                    </span>
                </div>
                <div className="space-y-3 p-4">
                    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-gray-900/50">
                        <div className="flex items-center gap-2">
                            <Cpu className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                            <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">{DEFAULT_MODEL_NAME}</p>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400">Configured inference model</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-600 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-400">
                        <Sparkles className="h-3.5 w-3.5" />
                        Source and confidence are displayed in the Suggested Fix card. Snippet sharing is {snippetsAllowedByPolicy ? 'enabled' : 'disabled'} by policy.
                    </div>
                    <Link
                        href="/soc2-compliance"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-600 hover:text-primary-500 dark:text-primary-400"
                    >
                        SOC 2 mapping
                        <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-white/10">
                <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.02]">
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                        <PlugZap className="h-3.5 w-3.5" />
                        Bring Your Own Model
                    </h3>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-300">
                        Coming Soon
                    </span>
                </div>

                <div className="space-y-3 p-4">
                    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-gray-900/50">
                        <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">Custom Model Connector</p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400">Connect self-hosted or third-party LLM endpoints</p>
                        </div>
                        <button
                            disabled
                            className="relative h-5 w-10 shrink-0 cursor-not-allowed rounded-full bg-gray-300 opacity-60 dark:bg-gray-700"
                            title="Feature coming soon"
                            aria-label="Custom model connector coming soon"
                        >
                            <div className="absolute left-[2px] top-0.5 h-4 w-4 rounded-full bg-white shadow-sm" />
                        </button>
                    </div>

                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-700/40 dark:bg-amber-900/15 dark:text-amber-200">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <p>Model onboarding is not available yet. This feature is coming soon.</p>
                    </div>

                    <button
                        type="button"
                        disabled
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-gray-100 px-3 text-sm font-semibold text-gray-500 opacity-70 grayscale transition-colors dark:border-white/15 dark:bg-white/[0.03] dark:text-gray-400"
                        title="Coming soon"
                    >
                        Add New Model
                    </button>
                </div>
            </div>
        </div>
    );
}
