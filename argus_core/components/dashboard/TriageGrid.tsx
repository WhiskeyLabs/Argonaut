import { db } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { UniversalFinding } from '@/lib/types/finding';
import { ChevronDown, Square, CheckSquare, FileCode } from 'lucide-react';
import { useState } from 'react';

export function TriageGrid({
    sessionId,
    onSelect,
    selectedId
}: {
    sessionId: string;
    onSelect?: (id: string) => void;
    selectedId?: string;
}) {
    const findings = useLiveQuery(
        () => db.findings.where('sessionId').equals(sessionId).toArray(),
        [sessionId]
    );

    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
        'Upgrade Libraries': true,
        'Sanitize Inputs': true,
        'Config Changes': true,
        'Review Code': true,
    });

    const toggleGroup = (group: string) => {
        setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
    };

    if (!findings) return <div className="p-4 text-center text-gray-500">Loading findings...</div>;

    // Grouping Logic
    const grouped = findings.reduce((acc, finding) => {
        const action = finding.fixAction || 'Review Code';
        if (!acc[action]) acc[action] = [];
        acc[action].push(finding);
        return acc;
    }, {} as Record<string, UniversalFinding[]>);

    return (
        <div className="flex h-full flex-col font-sans text-sm">
            {/* Table Header */}
            <div className="flex items-center border-b border-gray-200 dark:border-white/5 bg-gray-50/50 dark:bg-gray-950/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <div className="w-10">
                    <Square className="h-4 w-4 text-gray-400 dark:text-gray-700" />
                </div>
                <div className="w-24">Severity</div>
                <div className="flex-1">Vulnerability</div>
                <div className="w-64">Location</div>
                <div className="w-64">Evidence Peek</div>
            </div>

            {/* Table Body (Scrollable) */}
            <div className="flex-1 overflow-y-auto">
                {Object.entries(grouped).map(([group, groupFindings]) => (
                    <div key={group} className="mb-2">
                        {/* Group Header */}
                        <div
                            className="sticky top-0 z-10 flex cursor-pointer items-center border-y border-gray-200 dark:border-white/5 bg-gray-50/95 dark:bg-gray-900/95 px-4 py-2 backdrop-blur-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                            onClick={() => toggleGroup(group)}
                        >
                            <ChevronDown
                                className={`mr-2 h-4 w-4 text-gray-500 transition-transform ${expandedGroups[group] ? '' : '-rotate-90'
                                    }`}
                            />
                            <span className="font-bold text-primary-600 dark:text-primary-500">ACTION:</span>
                            <span className="ml-2 font-medium text-gray-900 dark:text-gray-300">{group}</span>
                            <span className="ml-3 rounded-full bg-gray-200 dark:bg-white/5 px-2 py-0.5 text[10px] font-bold text-gray-600 dark:text-gray-400">
                                {groupFindings.length}
                            </span>
                        </div>

                        {/* Group Rows */}
                        {expandedGroups[group] && (
                            <div className="flex flex-col">
                                {groupFindings.map((finding) => {
                                    const isSelected = selectedId === finding.id;
                                    return (
                                        <div
                                            key={finding.id}
                                            onClick={() => onSelect?.(finding.id)}
                                            className={`group flex cursor-pointer items-center border-b border-gray-100 dark:border-white/5 px-4 py-3 transition-colors ${isSelected
                                                ? 'bg-primary-50 dark:bg-primary-500/10 shadow-[inset_3px_0_0_0_#e23b2e]' // Ember active state
                                                : 'hover:bg-gray-50 dark:hover:bg-white/[0.02]'
                                                }`}
                                        >
                                            {/* Checkbox */}
                                            <div className="w-10">
                                                {isSelected ? (
                                                    <CheckSquare className="h-4 w-4 text-primary-600 dark:text-primary-500" />
                                                ) : (
                                                    <div className="h-4 w-4 rounded border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500" />
                                                )}
                                            </div>

                                            {/* Severity Pill */}
                                            <div className="w-24 pr-4">
                                                <span
                                                    className={`inline-flex items-center justify-center rounded px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${finding.severity === 'critical'
                                                        ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-400 ring-1 ring-primary-500/20 dark:ring-primary-500/50'
                                                        : finding.severity === 'high'
                                                            ? 'bg-secondary-100 dark:bg-secondary-900/40 text-secondary-700 dark:text-secondary-400 ring-1 ring-secondary-500/20 dark:ring-secondary-500/50'
                                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 ring-1 ring-gray-200 dark:ring-gray-700'
                                                        }`}
                                                >
                                                    {finding.severity}
                                                </span>
                                            </div>

                                            {/* Vulnerability Details */}
                                            <div className="flex-1 pr-4">
                                                <div className="font-medium text-gray-900 dark:text-gray-200">{finding.title}</div>
                                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                                    <span className="font-mono">{finding.ruleId}</span>
                                                    <span className="h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-700" />
                                                    <span>{finding.packageName || 'unknown'}</span>
                                                </div>
                                            </div>

                                            {/* Location */}
                                            <div className="w-64 pr-4 font-mono text-xs text-gray-500 dark:text-gray-400 truncate">
                                                {finding.location.filepath}:{finding.location.startLine}
                                            </div>

                                            {/* Evidence Peek */}
                                            <div className="w-64">
                                                <div className="flex items-center gap-2 rounded bg-gray-100 dark:bg-black/20 px-2 py-1 font-mono text-xs text-gray-500">
                                                    <FileCode className="h-3 w-3 text-gray-400 dark:text-gray-600" />
                                                    <span className="truncate">{finding.messageFingerprint?.substring(0, 20) || 'No evidence'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
