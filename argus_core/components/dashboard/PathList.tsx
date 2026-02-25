import React from 'react';
import { ArrowRight, Package, GitCommit, SearchX, Link2Off } from 'lucide-react';
import { ReachabilityStatus } from '@/lib/types/reachability';

interface PathListProps {
    paths: string[][];
    status?: ReachabilityStatus;
    limit?: number;
    maxHops?: number;
}

export function PathList({ paths, status, limit = 3, maxHops = 7 }: PathListProps) {
    // If we have paths, show them (Success case)
    if (paths && paths.length > 0) {
        const displayPaths = paths.slice(0, limit);
        const hasMore = paths.length > limit;

        return (
            <div className="space-y-3">
                {displayPaths.map((path, idx) => {
                    const isCompressed = path.length > maxHops;
                    const displayNodes = isCompressed
                        ? [...path.slice(0, 3), '...', ...path.slice(-3)]
                        : path;

                    return (
                        <div key={idx} className="relative pl-4 border-l-2 border-gray-100 dark:border-white/10 group hover:border-primary-500/30 transition-colors">
                            <div className="absolute -left-[5px] top-3 h-2.5 w-2.5 rounded-full border-2 border-gray-100 dark:border-zinc-800 bg-gray-300 dark:bg-zinc-700 group-hover:bg-primary-500 group-hover:border-primary-500 transition-colors"></div>

                            <div className="flex flex-wrap items-center gap-y-2 text-sm">
                                {displayNodes.map((node, nodeIdx) => {
                                    const isProjectRoot = !isCompressed && nodeIdx === 0;
                                    const isVulnerable = !isCompressed && nodeIdx === displayNodes.length - 1;
                                    const isEllipsis = node === '...';

                                    // Special case for compressed nodes:
                                    // First element is still root, last element is still vulnerable
                                    const showRootStyle = isCompressed ? nodeIdx === 0 : isProjectRoot;
                                    const showVulnStyle = isCompressed ? nodeIdx === displayNodes.length - 1 : isVulnerable;

                                    return (
                                        <React.Fragment key={nodeIdx}>
                                            {isEllipsis ? (
                                                <span className="px-2 py-1 text-gray-400 dark:text-gray-600 font-mono text-xs">...</span>
                                            ) : (
                                                <span className={`flex items-center gap-1.5 px-2 py-1 rounded border font-mono text-xs
                                                    ${showRootStyle
                                                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                                                        : showVulnStyle
                                                            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 font-bold'
                                                            : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300'
                                                    }`}>
                                                    <Package className="h-3 w-3 opacity-50" />
                                                    {node}
                                                </span>
                                            )}
                                            {nodeIdx < displayNodes.length - 1 && (
                                                <ArrowRight className="h-3 w-3 text-gray-400 mx-1" />
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}

                {hasMore && (
                    <div className="text-center text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-white/5 py-2 rounded-lg border border-gray-100 dark:border-white/5">
                        + {paths.length - limit} more execution paths
                    </div>
                )}
            </div>
        );
    }

    // Error / Empty States based on Status
    if (status === 'NO_MATCH') {
        return (
            <div className="flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-gray-200 dark:border-white/5 rounded-xl bg-gray-50/50 dark:bg-white/5">
                <SearchX className="h-8 w-8 text-amber-500/50 mb-2" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Package not found</p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 max-w-[200px]">
                    The vulnerable package name does not match any entry in the provided lockfile.
                </p>
            </div>
        );
    }

    if (status === 'NO_PATH') {
        return (
            <div className="flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-gray-200 dark:border-white/5 rounded-xl bg-gray-50/50 dark:bg-white/5">
                <Link2Off className="h-8 w-8 text-orange-500/50 mb-2" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No Execution Path</p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 max-w-[200px]">
                    The package exists in the lockfile but is not reachable from the project root (possibly a dev dependency or orphaned).
                </p>
            </div>
        );
    }

    // Default / UNAVAILABLE
    return (
        <div className="flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-gray-200 dark:border-white/5 rounded-xl">
            <GitCommit className="h-8 w-8 text-gray-300 dark:text-gray-700 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">No dependency paths detected.</p>
            <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">
                Upload a lockfile to trace how this vulnerability reaches your code.
            </p>
        </div>
    );
}
