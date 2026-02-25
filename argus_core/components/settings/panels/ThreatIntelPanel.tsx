'use client';

import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { threatIntelService } from '@/lib/services/threatIntelService';
import { useThreatIntelSettings } from '@/hooks/useThreatIntelSettings';
import {
    RefreshCw,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    Clock,
    ShieldCheck,
    Shield,
    Activity,
    Loader2,
    LockKeyhole,
    ArrowUpRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

// Staleness thresholds
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days
const AGING_THRESHOLD_MS = 24 * 60 * 60 * 1000;        // 24 hours

function getStalenessInfo(lastSuccessAt?: number) {
    if (!lastSuccessAt) return { label: 'Never fetched', color: 'text-gray-400', dot: 'bg-gray-400' };
    const age = Date.now() - lastSuccessAt;
    if (age < AGING_THRESHOLD_MS) {
        return { label: 'Fresh', color: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' };
    }
    if (age < STALE_THRESHOLD_MS) {
        return {
            label: `${formatDistanceToNow(lastSuccessAt, { addSuffix: false })} old`,
            color: 'text-amber-600 dark:text-amber-400',
            dot: 'bg-amber-500',
        };
    }
    return {
        label: `Stale (${formatDistanceToNow(lastSuccessAt, { addSuffix: false })})`,
        color: 'text-red-600 dark:text-red-400',
        dot: 'bg-red-500',
    };
}

function StatusIcon({ status }: { status: string }) {
    switch (status) {
        case 'ok':
            return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
        case 'degraded':
            return <AlertTriangle className="h-4 w-4 text-amber-500" />;
        case 'error':
            return <XCircle className="h-4 w-4 text-red-500" />;
        case 'loading':
            return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
        default:
            return <Clock className="h-4 w-4 text-gray-400" />;
    }
}

export function ThreatIntelPanel() {
    const { tiEnabled, tiWorkflowEnabled, blockedByPrivacy, setTIEnabled, isLoading: tiLoading } = useThreatIntelSettings();
    const [isRefreshing, setIsRefreshing] = React.useState(false);

    // Live query: KEV meta
    const kevMeta = useLiveQuery(() => db.ti_meta.get('cisa-kev'));
    const kevCount = useLiveQuery(() => db.threat_intel.count());

    const staleness = getStalenessInfo(kevMeta?.lastSuccessAt);

    const toggleDisabled = tiLoading || (blockedByPrivacy && !tiWorkflowEnabled);

    const handleRefresh = async () => {
        if (isRefreshing) return;
        if (blockedByPrivacy) return;
        setIsRefreshing(true);
        try {
            await threatIntelService.refreshFeeds();
        } finally {
            setIsRefreshing(false);
        }
    };

    return (
        <div className="space-y-5">
            {/* TI Master Toggle */}
            <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/[0.02]">
                <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                        Threat Intel Enrichment
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Controls whether TI enrichment appears across findings and research views
                    </p>
                </div>
                <button
                    onClick={() => {
                        if (blockedByPrivacy && !tiWorkflowEnabled) return;
                        void setTIEnabled(!tiWorkflowEnabled);
                    }}
                    disabled={toggleDisabled}
                    className={`w-10 h-5 rounded-full transition-all relative shrink-0 ${tiWorkflowEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-700'
                        } ${toggleDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    title={tiEnabled ? 'Disable Threat Intel' : 'Enable Threat Intel'}
                >
                    <div
                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all"
                        style={{ left: tiWorkflowEnabled ? '22px' : '2px' }}
                    />
                </button>
            </div>

            {blockedByPrivacy && (
                <div className="rounded-xl border border-red-200 bg-red-50/70 p-3 text-[11px] text-red-800 dark:border-red-800/50 dark:bg-red-900/15 dark:text-red-200">
                    <p className="flex items-center gap-1.5 font-semibold uppercase tracking-wide">
                        <LockKeyhole className="h-3.5 w-3.5" />
                        Threat intel blocked by privacy policy
                    </p>
                    <p className="mt-1">
                        Public TI enrichment is disabled by effective privacy mode. Enable egress in Privacy &amp; Data Controls to fetch KEV/EPSS.
                    </p>
                </div>
            )}

            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-[11px] text-amber-900 dark:border-amber-700/30 dark:bg-amber-900/10 dark:text-amber-200">
                <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p>
                    Privacy and outbound data permissions are owned by <span className="font-semibold">Privacy &amp; Data Controls</span> (Phase 6.6).
                    This page focuses on feed health, diagnostics, and operational freshness.
                </p>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-600 dark:border-white/10 dark:bg-gray-900/40 dark:text-gray-300">
                <Link
                    href="/soc2-compliance"
                    className="inline-flex items-center gap-1 font-semibold text-primary-600 hover:text-primary-500 dark:text-primary-400"
                >
                    SOC 2 controls reference for TI egress and monitoring
                    <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
            </div>

            {/* Feed Health Table */}
            <div className="rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50/80 dark:bg-white/[0.02] border-b border-gray-200 dark:border-white/10 flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Feed Health
                    </h3>
                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing || !tiEnabled}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all
                            ${isRefreshing || !tiEnabled
                                ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                                : 'text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-white/5'
                            }`}
                        title={!tiEnabled ? 'Enable Threat Intel to refresh' : 'Refresh feeds'}
                    >
                        <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>

                <table className="w-full text-xs">
                    <thead>
                        <tr className="border-b border-gray-100 dark:border-white/5">
                            <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Feed</th>
                            <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>
                            <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Freshness</th>
                            <th className="text-right px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Items</th>
                        </tr>
                    </thead>
                    <tbody>
                        {/* CISA KEV Row */}
                        <tr className="border-b border-gray-100 dark:border-white/5 last:border-0">
                            <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                    <ShieldCheck className="h-3.5 w-3.5 text-gray-500" />
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">CISA KEV</p>
                                        <p className="text-[10px] text-gray-400 mt-0.5">Known Exploited Vulnerabilities</p>
                                    </div>
                                </div>
                            </td>
                            <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                    <StatusIcon status={kevMeta?.status || 'empty'} />
                                    <span className="capitalize text-gray-700 dark:text-gray-300">
                                        {kevMeta?.status || 'empty'}
                                    </span>
                                </div>
                            </td>
                            <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                    <span className={`w-1.5 h-1.5 rounded-full ${staleness.dot}`} />
                                    <span className={staleness.color}>
                                        {kevMeta?.lastSuccessAt
                                            ? formatDistanceToNow(kevMeta.lastSuccessAt, { addSuffix: true })
                                            : 'Never'}
                                    </span>
                                </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                                <span className="font-mono text-gray-700 dark:text-gray-300">
                                    {kevCount?.toLocaleString() ?? '—'}
                                </span>
                            </td>
                        </tr>

                        {/* EPSS Row */}
                        <tr>
                            <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                    <Activity className="h-3.5 w-3.5 text-gray-500" />
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">FIRST.org EPSS</p>
                                        <p className="text-[10px] text-gray-400 mt-0.5">Exploit Prediction Scoring</p>
                                    </div>
                                </div>
                            </td>
                            <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                    <Activity className="h-4 w-4 text-blue-500" />
                                    <span className="text-gray-700 dark:text-gray-300">On-demand</span>
                                </div>
                            </td>
                            <td className="px-4 py-3">
                                <span className="text-gray-500 dark:text-gray-400">Per-CVE lookup</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                                <span className="font-mono text-gray-500">—</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Error Details (if any) */}
            {kevMeta?.status === 'error' && kevMeta.lastErrorMessage && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50">
                    <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-xs font-medium text-red-800 dark:text-red-200">
                            Last Error{kevMeta.lastErrorCode ? ` (${kevMeta.lastErrorCode})` : ''}
                        </p>
                        <p className="text-[11px] text-red-700 dark:text-red-300 mt-0.5">
                            {kevMeta.lastErrorMessage}
                        </p>
                    </div>
                </div>
            )}

            {/* Catalog Info */}
            {kevMeta?.upstreamUpdatedAt && (
                <div className="text-[10px] text-gray-400 flex items-center gap-1.5 px-1">
                    <Clock className="h-3 w-3" />
                    <span>
                        Catalog version: {kevMeta.upstreamUpdatedAt}
                        {kevMeta.lastItemCount !== undefined && ` · ${kevMeta.lastItemCount.toLocaleString()} entries`}
                    </span>
                </div>
            )}
        </div>
    );
}
