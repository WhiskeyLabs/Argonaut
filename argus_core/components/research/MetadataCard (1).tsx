import React from 'react';
import { ResearchCardsViewModel } from '@/lib/viewmodels/researchCards';

interface Props {
    vm: ResearchCardsViewModel;
}

export function MetadataCard({ vm }: Props) {
    const { metadata } = vm;

    return (
        <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-black/40 overflow-hidden shadow-sm">
            <div className="border-b border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-white/5 px-3 py-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Metadata
                </h3>
            </div>
            <div className="p-3 space-y-3 text-sm">

                {/* Rule ID */}
                <div className="flex justify-between items-center group">
                    <span className="text-gray-500 dark:text-gray-400">Rule ID</span>
                    <span className="font-mono text-xs truncate max-w-[150px] text-gray-700 dark:text-gray-300" title={metadata.ruleId}>
                        {metadata.ruleId}
                    </span>
                </div>

                {/* Tool */}
                <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">Tool</span>
                    <span className="font-medium capitalize text-gray-900 dark:text-gray-100">{metadata.tool}</span>
                </div>

                {/* Location */}
                <div className="flex justify-between items-center group">
                    <span className="text-gray-500 dark:text-gray-400">Location</span>
                    <span className="font-mono text-xs truncate max-w-[150px] text-right text-gray-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors cursor-pointer" title={metadata.location}>
                        {metadata.location}
                    </span>
                </div>

                {/* Tags */}
                {metadata.tags.length > 0 && (
                    <div className="pt-2 border-t border-gray-200 dark:border-white/5">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Tags</p>
                        <div className="flex flex-wrap gap-1.5">
                            {metadata.tags.map((tag) => (
                                <span key={tag} className="px-1.5 py-0.5 text-[10px] rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 uppercase tracking-wider">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Recommendation */}
                {vm.recommendedAction && (
                    <div className="pt-3 border-t border-gray-200 dark:border-white/5">
                        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">RECOMMENDED ACTION</p>
                        <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300 line-clamp-3" title={vm.recommendedAction}>
                            {vm.recommendedAction}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
