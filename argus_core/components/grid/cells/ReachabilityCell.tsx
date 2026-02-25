import React from 'react';

interface ReachabilityCellProps {
    reachabilityRank?: number;
}

const REACHABILITY_CONFIG: Record<number, { shape: string; label: string; color: string; className: string }> = {
    0: { shape: '●', label: 'Reachable', color: '#059669', className: 'text-emerald-600' },
    1: { shape: '◐', label: 'Potential', color: '#d97706', className: 'text-amber-500' },
    2: { shape: '○', label: 'No Path', color: '#9ca3af', className: 'text-gray-400' },
    3: { shape: '◌', label: 'Unknown', color: '#d1d5db', className: 'text-gray-300' },
};

export const ReachabilityCell: React.FC<ReachabilityCellProps> = ({ reachabilityRank = 3 }) => {
    const config = REACHABILITY_CONFIG[reachabilityRank] || REACHABILITY_CONFIG[3];

    return (
        <div
            className="flex items-center gap-1.5"
            title={config.label}
        >
            <span
                className={`text-sm leading-none ${config.className}`}
                style={{ fontFamily: 'serif' }}
                aria-hidden="true"
            >
                {config.shape}
            </span>
            <span className={`text-xs ${config.className}`}>
                {config.label}
            </span>
        </div>
    );
};
