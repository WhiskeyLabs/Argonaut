'use client';

import React from 'react';
import { Construction } from 'lucide-react';

interface PlaceholderPanelProps {
    title: string;
    subtitle: string;
}

export function PlaceholderPanel({ title, subtitle }: PlaceholderPanelProps) {
    return (
        <div className="flex flex-col items-center justify-center h-full min-h-[260px] text-center">
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gray-100 dark:bg-white/5 mb-4">
                <Construction className="h-6 w-6 text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                {title}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-[280px] leading-relaxed">
                This section is coming soon. Configuration options for {title.toLowerCase()} will appear here.
            </p>
        </div>
    );
}
