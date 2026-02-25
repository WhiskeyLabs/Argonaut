import React from 'react';
import { X, CheckCircle, AlertTriangle, Slash, ShieldAlert, Archive } from 'lucide-react';
import { FindingStatus } from '@/lib/types/finding';

interface BulkActionsBarProps {
    selectedCount: number;
    onClearSelection: () => void;
    onAction: (action: FindingStatus) => void;
}

export function BulkActionsBar({ selectedCount, onClearSelection, onAction }: BulkActionsBarProps) {
    if (selectedCount === 0) return null;

    return (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-6 py-3 rounded-full shadow-xl border border-gray-700 dark:border-gray-200">
            <div className="flex items-center gap-3 border-r border-gray-700 dark:border-gray-200 pr-4">
                <span className="font-bold text-sm whitespace-nowrap">{selectedCount} selected</span>
                <button
                    onClick={onClearSelection}
                    className="p-1 hover:bg-gray-800 dark:hover:bg-gray-100 rounded-full transition-colors"
                    title="Clear selection"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div className="flex items-center gap-2">
                <ActionButton
                    icon={<CheckCircle className="h-4 w-4" />}
                    label="Resolve"
                    onClick={() => onAction('fixed')}
                    variant="success"
                />
                <ActionButton
                    icon={<ShieldAlert className="h-4 w-4" />}
                    label="False Positive"
                    onClick={() => onAction('false_positive')}
                />
                <ActionButton
                    icon={<AlertTriangle className="h-4 w-4" />}
                    label="Accept Risk"
                    onClick={() => onAction('risk_accepted')}
                    variant="warning"
                />
                <ActionButton
                    icon={<Slash className="h-4 w-4" />}
                    label="Ignore"
                    onClick={() => onAction('ignored')}
                />
                <ActionButton
                    icon={<Archive className="h-4 w-4" />}
                    label="Reopen"
                    onClick={() => onAction('open')}
                />
            </div>
        </div>
    );
}

interface ActionButtonProps {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    variant?: 'default' | 'success' | 'warning' | 'danger';
}

function ActionButton({
    icon,
    label,
    onClick,
    variant = 'default'
}: ActionButtonProps) {
    const variants = {
        default: 'hover:bg-gray-800 dark:hover:bg-gray-200 text-gray-300 dark:text-gray-600',
        success: 'text-green-400 dark:text-green-600 hover:bg-green-900/30 dark:hover:bg-green-100',
        warning: 'text-yellow-400 dark:text-yellow-600 hover:bg-yellow-900/30 dark:hover:bg-yellow-100',
        danger: 'text-red-400 dark:text-red-600 hover:bg-red-900/30 dark:hover:bg-red-100',
    };

    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${variants[variant]}`}
        >
            {icon}
            {label}
        </button>
    );
}
