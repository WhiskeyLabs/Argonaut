
import React from 'react';
import { ShieldAlert, ShieldCheck, AlertTriangle } from 'lucide-react';

interface ReachabilityFunnelProps {
    totalAssets: number;
    vulnerableCount: number;
    reachableCount: number;
}

export function ReachabilityFunnel({ totalAssets, vulnerableCount, reachableCount }: ReachabilityFunnelProps) {
    return (
        <div className="w-full flex items-center justify-between bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4 mb-4 shadow-sm">

            {/* Step 1: Total Assets */}
            <div className="flex flex-col flex-1 px-4">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Total Assets</span>
                <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">{totalAssets}</span>
                    <span className="text-sm text-gray-400">Ingested</span>
                </div>
            </div>

            {/* Separator */}
            <div className="mx-4 text-gray-300">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </div>

            {/* Step 2: Vulnerable (Blue/Neutral) */}
            <div className="flex flex-col flex-1 px-4">
                <span className="text-xs font-semibold text-indigo-900 dark:text-indigo-400 uppercase tracking-wider mb-1">Vulnerable</span>
                <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-indigo-900 dark:text-indigo-300">{vulnerableCount}</span>
                    <span className="text-sm text-gray-400">CVE Matches</span>
                </div>
            </div>

            {/* Separator */}
            <div className="mx-4 text-gray-300">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </div>

            {/* Step 3: Reachable (Red - Actionable) */}
            <div className="flex flex-col flex-1 px-6 py-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/50 rounded-lg">
                <span className="text-xs font-bold text-red-800 dark:text-red-400 uppercase tracking-wider mb-1">Reachable</span>
                <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-red-700 dark:text-red-400">{reachableCount}</span>
                    <span className="text-sm text-red-600/70 dark:text-red-300/70">Actionable</span>
                </div>
            </div>
        </div>
    );
}
