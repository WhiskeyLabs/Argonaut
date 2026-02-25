'use client';

import React from 'react';
import { Package, ShieldCheck, Globe } from 'lucide-react';
import { name, version } from '@/data/app-info';
import { siteConfig } from '@/data/config/site.settings';

const runtime = 'browser';
const buildChannel = process.env.NODE_ENV === 'production' ? 'Production' : 'Development';

export function AboutPanel() {
    return (
        <div className="space-y-5">
            <div className="rounded-xl border border-gray-200 dark:border-white/10">
                <div className="flex items-center gap-1.5 border-b border-gray-200 bg-gray-50/80 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-700 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-300">
                    <Package className="h-3.5 w-3.5" />
                    Build Metadata
                </div>
                <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
                    <InfoRow label="Application" value={name} />
                    <InfoRow label="Version" value={version} />
                    <InfoRow label="Channel" value={buildChannel} />
                    <InfoRow label="Runtime" value={runtime} />
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-white/10">
                <div className="flex items-center gap-1.5 border-b border-gray-200 bg-gray-50/80 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-700 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-300">
                    <Globe className="h-3.5 w-3.5" />
                    Deployment Context
                </div>
                <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
                    <InfoRow label="Domain" value={siteConfig.domain || 'N/A'} />
                    <InfoRow label="Site URL" value={siteConfig.siteUrl || 'N/A'} />
                    <InfoRow label="Locale" value={siteConfig.locale || 'N/A'} />
                    <InfoRow label="Language" value={siteConfig.language || 'N/A'} />
                </div>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-800/30 dark:bg-emerald-900/10">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Product Posture
                </div>
                <p className="text-[11px] text-emerald-900/90 dark:text-emerald-100/90">
                    Argus is designed for local-first analysis with explicit control over enrichment and AI behaviors.
                    See Privacy & Data Controls (Phase 6.6) for enforcement policy ownership.
                </p>
            </div>
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-gray-900/40">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
            <p className="mt-0.5 truncate text-xs font-medium text-gray-800 dark:text-gray-100" title={value}>
                {value}
            </p>
        </div>
    );
}
