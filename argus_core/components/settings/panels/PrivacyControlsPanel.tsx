'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    Shield,
    LockKeyhole,
    Database,
    Globe,
    Zap,
    BarChart3,
    Trash2,
    ArrowUpRight,
    Brain,
    EarthLock,
} from 'lucide-react';
import { usePrivacySettings } from '@/hooks/usePrivacySettings';
import { purgeLocalAnalysisData } from '@/lib/privacy/purge';
import { clearAllNavMemory } from '@/lib/navigation/navMemory';

function ToggleRow({
    title,
    description,
    value,
    onChange,
    disabled,
    sent,
    neverSent,
    controlTag,
    nested,
}: {
    title: string;
    description: string;
    value: boolean;
    onChange: (next: boolean) => void;
    disabled?: boolean;
    sent?: string;
    neverSent?: string;
    controlTag?: string;
    nested?: boolean;
}) {
    return (
        <div className={`rounded-xl border p-3 ${nested ? 'border-gray-200/70 bg-gray-50/55 dark:border-white/10 dark:bg-white/[0.03]' : 'border-gray-200 dark:border-white/10'} ${disabled ? 'opacity-65' : ''}`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{title}</p>
                        {controlTag && (
                            <span
                                title="SOC 2 control mapping reference (not a pass/fail compliance state)"
                                className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-700 dark:border-white/20 dark:bg-white/[0.06] dark:text-gray-200"
                            >
                                {controlTag}
                            </span>
                        )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{description}</p>
                </div>
                <button
                    type="button"
                    onClick={() => onChange(!value)}
                    disabled={disabled}
                    className={`relative h-5 w-10 shrink-0 rounded-full transition-all ${value ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-700'} ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                    title={value ? 'Disable' : 'Enable'}
                >
                    <div
                        className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all"
                        style={{ left: value ? '22px' : '2px' }}
                    />
                </button>
            </div>
            {sent && neverSent && (
                <div className="mt-2 grid gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                    <p><span className="font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Sent when enabled:</span> {sent}</p>
                    <p><span className="font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Never sent:</span> {neverSent}</p>
                </div>
            )}
        </div>
    );
}

export function PrivacyControlsPanel() {
    const {
        snapshot,
        policy,
        setLocalOnlyMode,
        setSessionPersistence,
        setAutoDeleteOnClose,
        setTiPublicEnrichment,
        setAiCloudAssistance,
        setAiAllowCodeSnippets,
        setTelemetryOptIn,
        isLoading,
    } = usePrivacySettings();
    const [purging, setPurging] = useState(false);

    const modeBadge = useMemo(() => {
        if (policy.mode === 'EXTENDED_INTELLIGENCE') {
            return {
                labelTop: 'Extended',
                labelBottom: 'Intelligence',
                icon: Brain,
                className:
                    'border-emerald-400/70 bg-gradient-to-b from-emerald-100 to-emerald-50 text-emerald-800 shadow-[0_0_0_1px_rgba(16,185,129,0.15),0_0_14px_rgba(16,185,129,0.2)] dark:border-emerald-500/50 dark:bg-gradient-to-b dark:from-emerald-500/20 dark:to-emerald-500/10 dark:text-emerald-300 dark:shadow-[0_0_0_1px_rgba(16,185,129,0.25),0_0_16px_rgba(16,185,129,0.2)]',
            };
        }

        return {
            labelTop: 'Private',
            labelBottom: 'Mode',
            icon: EarthLock,
            className:
                'border-gray-300/80 bg-gradient-to-b from-gray-100 to-gray-50 text-gray-700 shadow-[0_0_0_1px_rgba(107,114,128,0.12),0_0_10px_rgba(107,114,128,0.12)] dark:border-gray-600/60 dark:bg-gradient-to-b dark:from-gray-700/40 dark:to-gray-700/20 dark:text-gray-200 dark:shadow-[0_0_0_1px_rgba(148,163,184,0.2),0_0_12px_rgba(148,163,184,0.1)]',
        };
    }, [policy.mode]);

    useEffect(() => {
        if (!snapshot.sessionPersistence) {
            void setSessionPersistence(true);
        }
    }, [snapshot.sessionPersistence, setSessionPersistence]);

    useEffect(() => {
        if (snapshot.aiCloudAssistance && !snapshot.aiAllowCodeSnippets) {
            void setAiAllowCodeSnippets(true);
            return;
        }
        if (!snapshot.aiCloudAssistance && snapshot.aiAllowCodeSnippets) {
            void setAiAllowCodeSnippets(false);
        }
    }, [
        snapshot.aiCloudAssistance,
        snapshot.aiAllowCodeSnippets,
        setAiAllowCodeSnippets,
    ]);

    const confirmEgressEnable = async (
        action: () => Promise<void>,
        details: string
    ) => {
        const ok = window.confirm(
            `This enables limited metadata egress from your browser.\n\n${details}\n\nSource code and full repository contents are never transmitted unless snippet sharing is explicitly enabled.`
        );
        if (!ok) return;
        await action();
    };

    const handlePurge = async () => {
        const ok = window.confirm(
            'Delete all locally stored sessions, findings, threat intel cache, and derived artifacts?\n\nThis cannot be undone.'
        );
        if (!ok) return;
        try {
            setPurging(true);
            await purgeLocalAnalysisData();
            clearAllNavMemory();
        } finally {
            setPurging(false);
        }
    };

    return (
        <div className="space-y-5">
            <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-white/10 dark:bg-white/[0.02]">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white">
                            <LockKeyhole className="h-4 w-4 text-primary-500" />
                            Privacy Mode
                        </p>
                        <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                            Policy is enforced locally at runtime before AI or TI egress occurs.
                        </p>
                    </div>
                    <span
                        className={`inline-flex min-w-[168px] items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-center ${modeBadge.className}`}
                    >
                        <modeBadge.icon className="h-4 w-4 shrink-0" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.14em] leading-tight">
                            <span className="block">{modeBadge.labelTop}</span>
                            <span className="block">{modeBadge.labelBottom}</span>
                        </span>
                    </span>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-600 dark:border-white/10 dark:bg-gray-900/40 dark:text-gray-300">
                    <p className="font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200">Auditor Call-Out</p>
                    <p className="mt-1">
                        The system defaults to local-only execution. External AI and enrichment calls are explicit opt-in, constrained,
                        and auditable.
                    </p>
                    <Link
                        href="/soc2-compliance"
                        className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary-600 hover:text-primary-500 dark:text-primary-400"
                    >
                        View SOC 2 Control Mapping
                        <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-white/10">
                <div className="flex items-center gap-1.5 border-b border-gray-200 bg-gray-50/80 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-700 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-300">
                    <Shield className="h-3.5 w-3.5" />
                    Core Policy
                </div>
                <div className="space-y-3 p-4">
                    <ToggleRow
                        title="Local-Only Mode (Master Lock)"
                        description="When enabled, outbound AI, threat intel, and telemetry remain blocked."
                        value={snapshot.localOnlyMode}
                        onChange={(next) => setLocalOnlyMode(next)}
                        disabled={isLoading}
                        sent="Nothing leaves your browser"
                        neverSent="Source code, paths, repository contents"
                        controlTag="CC6.1"
                    />
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-white/10">
                <div className="flex items-center gap-1.5 border-b border-gray-200 bg-gray-50/80 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-700 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-300">
                    <Globe className="h-3.5 w-3.5" />
                    Outbound Controls
                </div>
                <div className="space-y-3 p-4">
                    <ToggleRow
                        title="Public Threat Intelligence"
                        description="Allow KEV/EPSS enrichment using CVE identifiers."
                        value={snapshot.tiPublicEnrichment}
                        onChange={(next) => {
                            if (next) {
                                void confirmEgressEnable(
                                    () => setTiPublicEnrichment(true),
                                    'CVE identifiers may be sent to threat-intel sources.'
                                );
                                return;
                            }
                            void setTiPublicEnrichment(false);
                        }}
                        disabled={isLoading || snapshot.localOnlyMode}
                        sent="CVE IDs and feed lookup metadata"
                        neverSent="Source code, file content, lockfile bodies"
                        controlTag="CC6.2"
                    />

                    <ToggleRow
                        title="Hosted Private AI"
                        description="Enable AI enriched fix suggestions from private Argus AI."
                        value={snapshot.aiCloudAssistance}
                        onChange={(next) => {
                            if (next) {
                                void confirmEgressEnable(
                                    async () => {
                                        await setAiCloudAssistance(true);
                                        await setAiAllowCodeSnippets(true);
                                    },
                                    'Tokenized finding metadata will be sent to the configured AI endpoint.'
                                );
                                return;
                            }
                            void Promise.all([setAiCloudAssistance(false), setAiAllowCodeSnippets(false)]);
                        }}
                        disabled={isLoading || snapshot.localOnlyMode}
                        sent="Finding metadata, CVE/package context, and snippet/path fields"
                        neverSent="Raw repository sync, full project archives"
                        controlTag="CC6.7"
                    />

                    <ToggleRow
                        title="Telemetry Opt-In"
                        description="Keep off unless your security/compliance policy explicitly requires operational diagnostics."
                        value={snapshot.telemetryOptIn}
                        onChange={(next) => {
                            if (next) {
                                void confirmEgressEnable(
                                    () => setTelemetryOptIn(true),
                                    'Operational analytics events may be sent to telemetry endpoints.'
                                );
                                return;
                            }
                            void setTelemetryOptIn(false);
                        }}
                        disabled={isLoading || snapshot.localOnlyMode}
                        sent="Operational telemetry events"
                        neverSent="Findings payloads, snippets, lockfiles"
                        controlTag="CC7.2"
                    />

                    {snapshot.localOnlyMode && (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-900/10 dark:text-emerald-200">
                            Local-only mode is active. Outbound controls are hard-disabled until Local-only mode is turned off.
                        </div>
                    )}
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-white/10">
                <div className="flex items-center gap-1.5 border-b border-gray-200 bg-gray-50/80 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-700 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-300">
                    <Database className="h-3.5 w-3.5" />
                    Local Data Controls
                </div>
                <div className="space-y-3 p-4">
                    <button
                        type="button"
                        onClick={handlePurge}
                        disabled={purging}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-800/70 dark:text-red-300 dark:hover:bg-red-900/20"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        {purging ? 'Purging...' : 'Purge All Local Analysis Data'}
                    </button>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        This deletes sessions, findings, threat intel cache, graph indices, and local evidence logs. Settings preferences remain.
                    </p>
                    <ToggleRow
                        title="Auto-Delete On Close"
                        description="Automatically purge local analysis data when the tab/session closes."
                        value={snapshot.autoDeleteOnClose}
                        onChange={(next) => setAutoDeleteOnClose(next)}
                        disabled={isLoading}
                    />
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-gray-900/40">
                    <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        <Shield className="h-3.5 w-3.5 text-emerald-500" />
                        CC6.1 / CC6.7
                    </p>
                    <p className="text-[11px] text-gray-600 dark:text-gray-300">Access and transmission controls are explicit and policy-gated.</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-gray-900/40">
                    <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        <Zap className="h-3.5 w-3.5 text-amber-500" />
                        CC7.1 / CC7.4
                    </p>
                    <p className="text-[11px] text-gray-600 dark:text-gray-300">Evidence events and versioned contracts support operational auditability.</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-gray-900/40">
                    <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        <BarChart3 className="h-3.5 w-3.5 text-blue-500" />
                        Data Minimization
                    </p>
                    <p className="text-[11px] text-gray-600 dark:text-gray-300">CVE and metadata-first enrichment keeps sensitive context constrained.</p>
                </div>
            </div>
        </div>
    );
}
