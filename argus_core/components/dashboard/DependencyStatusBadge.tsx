import { ShieldCheck, AlertCircle, Link, HelpCircle, CheckCircle2 } from 'lucide-react';
import { DependencyAnalysis } from '@/lib/types/finding';

interface DependencyStatusBadgeProps {
    analysis?: DependencyAnalysis;
}

export function DependencyStatusBadge({ analysis }: DependencyStatusBadgeProps) {
    const status = analysis?.status || 'UNAVAILABLE';

    if (status === 'REAL') {
        return (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900/30 dark:bg-emerald-900/20 px-3 py-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50">
                    <Link className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                        Dependency-Linked
                    </p>
                    <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/70">
                        Validated by Lockfile
                    </p>
                </div>
            </div>
        );
    }

    if (status === 'NOISE') {
        return (
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/5 px-3 py-2 opacity-75">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 dark:bg-white/10">
                    <ShieldCheck className="h-4 w-4 text-gray-500" />
                </div>
                <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                        Filtered Noise
                    </p>
                    <p className="text-[10px] text-gray-400">
                        {analysis?.reason || 'Excluded by policy'}
                    </p>
                </div>
            </div>
        );
    }

    // Default / UNAVAILABLE
    return (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50/50 dark:border-white/10 dark:bg-white/5 px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-white/5">
                <HelpCircle className="h-4 w-4 text-gray-400" />
            </div>
            <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    Analysis Unavailable
                </p>
                <p className="text-[10px] text-gray-400">
                    Missing lockfile or graph data
                </p>
            </div>
        </div>
    );
}
