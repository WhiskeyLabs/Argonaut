'use client';

import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ShieldCheck, Clock, BadgeCheck, Activity } from 'lucide-react';
import { useThreatIntelSettings } from '@/hooks/useThreatIntelSettings';
import { useThreatIntel } from '@/hooks/useThreatIntel';
import { db } from '@/lib/db';

interface ThreatProvenanceCardProps {
    cveId?: string | null;
}

function formatTimestamp(ts?: number): string {
    if (!ts) return '—';
    return new Date(ts).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function statusBadgeClass(status?: string): string {
    if (status === 'ok') {
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
    }
    if (status === 'degraded') {
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    }
    if (status === 'error') {
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    }
    if (status === 'loading') {
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    }
    return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300';
}

export function ThreatProvenanceCard({ cveId }: ThreatProvenanceCardProps) {
    const { tiEnabled } = useThreatIntelSettings();
    const normalizedCve = cveId?.startsWith('CVE-') ? cveId : undefined;
    const { data: threat, loading } = useThreatIntel(normalizedCve);
    const kevMeta = useLiveQuery(() => db.ti_meta.get('cisa-kev'));

    return (
        <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white/60 dark:bg-gray-900/60 p-3 backdrop-blur-md shadow-sm">
            <div className="mb-2 flex items-center gap-2">
                <BadgeCheck className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Threat Provenance
                </span>
            </div>

            {!normalizedCve && (
                <p className="text-xs text-gray-500">No CVE available for this finding.</p>
            )}

            {normalizedCve && !tiEnabled && (
                <p className="text-xs text-gray-500">Threat Intel is disabled. Enable TI to load provenance data.</p>
            )}

            {normalizedCve && tiEnabled && loading && (
                <div className="space-y-2 animate-pulse">
                    <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-800" />
                    <div className="h-3 w-full rounded bg-gray-200 dark:bg-gray-800" />
                    <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-gray-800" />
                </div>
            )}

            {normalizedCve && tiEnabled && !loading && (
                <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                        <span className="text-gray-500">CVE</span>
                        <span className="font-mono text-gray-700 dark:text-gray-300">{normalizedCve}</span>
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1 text-gray-500">
                            <ShieldCheck className="h-3 w-3" />
                            Feed status
                        </span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${statusBadgeClass(kevMeta?.status)}`}>
                            {kevMeta?.status || 'unknown'}
                        </span>
                    </div>

                    {threat ? (
                        <>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-500">Primary source</span>
                                <span className="font-mono text-gray-700 dark:text-gray-300">{threat.source}</span>
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-gray-500">KEV catalog version</span>
                                <span className="font-mono text-gray-700 dark:text-gray-300">{threat.kevCatalogVersion || '—'}</span>
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-gray-500">KEV date added</span>
                                <span className="font-mono text-gray-700 dark:text-gray-300">{threat.kevDateAdded || '—'}</span>
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1 text-gray-500">
                                    <Activity className="h-3 w-3" />
                                    EPSS
                                </span>
                                <span className="font-mono text-gray-700 dark:text-gray-300">
                                    {(threat.epssScore * 100).toFixed(2)}% / {(threat.epssPercentile * 100).toFixed(0)}th
                                </span>
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1 text-gray-500">
                                    <Clock className="h-3 w-3" />
                                    Last TI update
                                </span>
                                <span className="font-mono text-gray-700 dark:text-gray-300">{formatTimestamp(threat.lastUpdated)}</span>
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-gray-500">EPSS fetched</span>
                                <span className="font-mono text-gray-700 dark:text-gray-300">{formatTimestamp(threat.epssLastFetched)}</span>
                            </div>
                        </>
                    ) : (
                        <p className="text-xs text-gray-500">No threat record available for {normalizedCve}.</p>
                    )}

                    <div className="flex items-center justify-between border-t border-gray-200 pt-2 text-[10px] dark:border-white/10">
                        <span className="text-gray-500">Upstream updated</span>
                        <span className="font-mono text-gray-700 dark:text-gray-300">{kevMeta?.upstreamUpdatedAt || '—'}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
