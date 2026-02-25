import React from 'react';
import { ResearchCardsViewModel } from '@/lib/viewmodels/researchCards';

interface Props {
    vm: ResearchCardsViewModel;
}

export function MetadataCard({ vm }: Props) {
    const { metadata } = vm;
    const locationValue = metadata.location || 'Unavailable';

    const copyLocation = async () => {
        try {
            await navigator.clipboard.writeText(locationValue);
        } catch {
            // Best-effort convenience action; no hard failure UI needed.
        }
    };

    return (
        <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white/60 dark:bg-gray-900/60 p-4 shadow-sm">
            <div className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                    Evidence
                </h3>

                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-[12px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Tool</p>
                        <p className="text-sm font-medium capitalize text-gray-900 dark:text-gray-100 text-right">
                            {metadata.tool || 'Unavailable'}
                        </p>
                    </div>

                    <div className="flex items-start justify-between gap-3">
                        <p className="text-[12px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Location</p>
                        <button
                            type="button"
                            onClick={() => void copyLocation()}
                            className="max-w-[68%] text-right font-mono text-xs text-gray-700 underline-offset-2 transition-colors hover:text-emerald-600 hover:underline dark:text-gray-300 dark:hover:text-emerald-400"
                            title={`Copy location: ${locationValue}`}
                        >
                            {locationValue}
                        </button>
                    </div>

                    <div className="flex items-start justify-between gap-3">
                        <p className="text-[12px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Tags</p>
                        <div className="flex max-w-[68%] flex-wrap justify-end gap-1.5">
                            {metadata.tags.length > 0 ? (
                                Array.from(new Set(metadata.tags)).map((tag) => (
                                    <span
                                        key={tag}
                                        className="rounded-md border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                                    >
                                        {tag}
                                    </span>
                                ))
                            ) : (
                                <span className="text-xs text-gray-500 dark:text-gray-400">Unavailable</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
