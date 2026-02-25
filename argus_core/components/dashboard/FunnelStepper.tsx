'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useSessionMetrics } from '@/hooks/useSessionMetrics';

interface FunnelStepperProps {
    sessionId: string;
}

type FunnelStage = 'total' | 'vulnerable' | 'dependency-linked';

export function FunnelStepper({ sessionId }: FunnelStepperProps) {
    const metrics = useSessionMetrics(sessionId);
    const searchParams = useSearchParams();

    // Derive active stage from URL
    const urlFilter = searchParams.get('filter');
    const activeStage: FunnelStage =
        urlFilter === 'vulnerable' ? 'vulnerable'
            : urlFilter === 'dependency-linked' ? 'dependency-linked'
                : 'total';

    if (!metrics) return <div className="animate-pulse h-24 bg-gray-100 rounded-xl" />;

    // Styling helpers
    const baseBox = "group relative flex flex-col justify-center rounded-xl px-6 py-4 transition-all cursor-pointer";
    const dimBox = `${baseBox} bg-transparent hover:bg-gray-50 dark:hover:bg-white/5`;
    const activeRing = "border border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.15)] dark:shadow-[0_0_20px_rgba(59,130,246,0.15)] hover:border-blue-500/40 hover:bg-blue-100 dark:hover:bg-blue-500/20";

    return (
        <div className="grid grid-cols-3 gap-0 rounded-2xl border border-gray-200 dark:border-white/5 bg-white dark:bg-white/5 p-1 shadow-sm dark:shadow-none">
            {/* Step 1: Total Assets */}
            <Link
                href="?"
                className={`${activeStage === 'total' ? `${baseBox} ${activeRing}` : dimBox}`}
            >
                <span className={`text-xs font-semibold uppercase tracking-wider ${activeStage === 'total' ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-500'}`}>
                    Total Assets
                </span>
                <div className="mt-1 flex items-baseline gap-2">
                    <span className={`text-3xl font-bold ${activeStage === 'total' ? 'text-blue-700 dark:text-white dark:drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]' : 'text-gray-900 dark:text-gray-200'}`}>
                        {metrics.totalFindings}
                    </span>
                    <span className={`text-sm font-medium ${activeStage === 'total' ? 'text-blue-600 dark:text-blue-200' : 'text-gray-400 dark:text-gray-500'}`}>Ingested</span>
                </div>
                <ChevronRight className="absolute right-0 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-300 dark:text-gray-700" />
                {activeStage === 'total' && <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-blue-500/20" />}
            </Link>

            {/* Step 2: Vulnerable */}
            <Link
                href="?filter=vulnerable"
                className={`${activeStage === 'vulnerable' ? `${baseBox} ${activeRing}` : dimBox}`}
            >
                <span className={`text-xs font-semibold uppercase tracking-wider ${activeStage === 'vulnerable' ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-amber-600 dark:text-amber-400'}`}>
                    Vulnerable
                </span>
                <div className="mt-1 flex items-baseline gap-2">
                    <span className={`text-3xl font-bold ${activeStage === 'vulnerable' ? 'text-amber-700 dark:text-white dark:drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]' : 'text-amber-600 dark:text-amber-400'}`}>
                        {metrics.vulnerableCount}
                    </span>
                    <span className={`text-sm font-medium ${activeStage === 'vulnerable' ? 'text-amber-600 dark:text-amber-200' : 'text-amber-500/70 dark:text-amber-500/60'}`}>
                        High/Crit
                    </span>
                </div>
                <ChevronRight className="absolute right-0 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-300 dark:text-gray-700" />
                {activeStage === 'vulnerable' && <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-amber-500/20" />}
            </Link>

            {/* Step 3: Dependency-Linked */}
            <Link
                href="?filter=dependency-linked"
                className={`${activeStage === 'dependency-linked' ? `${baseBox} ${activeRing}` : dimBox}`}
            >
                <span className={`text-xs font-bold uppercase tracking-wider ${activeStage === 'dependency-linked' ? 'text-blue-600 dark:text-blue-400' : 'text-blue-600 dark:text-blue-400'}`}>
                    Dependency-Linked
                </span>
                <div className="mt-1 flex items-baseline gap-2">
                    <span className={`text-3xl font-bold ${activeStage === 'dependency-linked' ? 'text-blue-700 dark:text-white dark:drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]' : 'text-blue-700 dark:text-blue-300'}`}>
                        {metrics.dependencyLinked.count}
                    </span>
                    <span className={`text-sm font-medium ${activeStage === 'dependency-linked' ? 'text-blue-600 dark:text-blue-200' : 'text-blue-600 dark:text-blue-300'}`}>
                        Actionable
                    </span>
                </div>
                {activeStage === 'dependency-linked' && <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-blue-500/20" />}
            </Link>
        </div>
    );
}
