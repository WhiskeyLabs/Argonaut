'use client';

import React from 'react';
import Link from 'next/link';
import { BookOpen, LifeBuoy, Bug, ArrowUpRight } from 'lucide-react';

const quickLinks = [
    {
        title: 'Getting Started Guide',
        href: '/getting-started',
        description: 'Fast setup for internal beta workflows.',
    },
    {
        title: 'SOC 2 Compliance Mapping',
        href: '/soc2-compliance',
        description: 'Control mapping for CC6 and CC7 reviewer workflows.',
    },
];

const troubleshooting = [
    'If ingest appears stalled, verify file size is within the current Gen 1 limit and refresh once.',
    'If AI suggestions are unavailable, check model endpoint health and your current settings policy.',
    'If threat provenance is empty, confirm CVE normalization and feed freshness in Threat Intel.',
];

export function HelpPanel() {
    return (
        <div className="space-y-5">
            <div className="rounded-xl border border-gray-200 dark:border-white/10">
                <div className="flex items-center gap-1.5 border-b border-gray-200 bg-gray-50/80 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-700 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-300">
                    <BookOpen className="h-3.5 w-3.5" />
                    Quick Links
                </div>
                <div className="space-y-2 p-4">
                    {quickLinks.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="group block rounded-lg border border-gray-200 bg-white px-3 py-2 transition-colors hover:bg-gray-50 dark:border-white/10 dark:bg-gray-900/40 dark:hover:bg-white/[0.04]"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-medium text-gray-800 dark:text-gray-100">{item.title}</p>
                                <ArrowUpRight className="h-3.5 w-3.5 text-gray-400 transition-colors group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                            </div>
                            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{item.description}</p>
                        </Link>
                    ))}
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-white/10">
                <div className="flex items-center gap-1.5 border-b border-gray-200 bg-gray-50/80 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-700 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-300">
                    <LifeBuoy className="h-3.5 w-3.5" />
                    Troubleshooting
                </div>
                <ul className="space-y-2 p-4 text-[11px] text-gray-600 dark:text-gray-300">
                    {troubleshooting.map((item) => (
                        <li key={item} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.02]">
                            {item}
                        </li>
                    ))}
                </ul>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-700/30 dark:bg-amber-900/10">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                    <Bug className="h-3.5 w-3.5" />
                    Beta Support
                </div>
                <p className="text-[11px] text-amber-800/90 dark:text-amber-200/90">
                    For reproducible bugs, include session ID, impacted route, and whether AI/TI was active when the issue occurred.
                </p>
            </div>
        </div>
    );
}
