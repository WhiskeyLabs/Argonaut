import React from 'react';
import { UniversalFinding } from '../../lib/types/finding';
import { FindingsSort } from '../../hooks/useFindingsQuery';
import { ThreatContextCell } from './cells/ThreatContextCell';
import { ReachabilityCell } from './cells/ReachabilityCell';
import { EvidencePeekCell } from './cells/EvidencePeekCell';

// --- Session Stats for auto-show logic ---
export interface SessionStats {
    uniqueTools: number;
    scaFindingsRatio: number;  // SCA findings / total
    cveDensity: number;        // findings with cveId / total
}

// --- Column metadata registry ---
export type ColumnCategory = 'signal' | 'context' | 'metadata';

export interface ColumnMeta {
    id: string;
    label: string;           // Display name in grid header
    defaultWidth: number;
    minWidth: number;

    // Visibility
    defaultVisible: boolean;
    autoShow?: (stats: SessionStats) => boolean;

    // Rendering
    renderCell: (finding: UniversalFinding) => React.ReactNode;

    // Sorting
    sortField?: FindingsSort['field'];
    sortAccessor?: (finding: UniversalFinding) => string | number;
    defaultSortDirection?: 'asc' | 'desc';

    // Picker metadata
    description?: string;
    category: ColumnCategory;
}

// --- Dexie preference shape (stored in settings table) ---
export interface GridColumnPreference {
    columnId: string;
    visible: boolean;
    width?: number;
}

// --- Helper sub-components ---

const SeverityBadge = ({ severity }: { severity: string }) => {
    const colors: Record<string, string> = {
        critical: 'bg-red-100 text-red-800 border-red-200',
        high: 'bg-orange-100 text-orange-800 border-orange-200',
        medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        low: 'bg-blue-100 text-blue-800 border-blue-200',
        info: 'bg-gray-100 text-gray-800 border-gray-200',
    };

    return (
        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${colors[severity] || colors.info} uppercase tracking-wider`}>
            {severity}
        </span>
    );
};

// --- Column Registry ---
// Order: Severity → Reachability → Threat → Status → Vulnerability → Location → Evidence Peek → Identifier → Package → Tool

export const COLUMN_REGISTRY: ColumnMeta[] = [
    {
        id: 'severity',
        label: 'SEVERITY',
        defaultWidth: 100,
        minWidth: 80,
        defaultVisible: true,
        sortField: 'severityRank',
        sortAccessor: (f) => f.severityRank ?? 99,
        defaultSortDirection: 'desc',
        description: 'Finding severity level',
        category: 'signal',
        renderCell: (f) => <SeverityBadge severity={f.severity} />
    },
    {
        id: 'reachability',
        label: 'REACHABILITY',
        defaultWidth: 120,
        minWidth: 90,
        defaultVisible: true,
        sortField: 'reachabilityRank',
        sortAccessor: (f) => f.reachabilityRank ?? 3,
        defaultSortDirection: 'asc',
        description: 'Whether the vulnerability is reachable in your code',
        category: 'signal',
        renderCell: (f) => <ReachabilityCell reachabilityRank={f.reachabilityRank} />
    },
    {
        id: 'threat',
        label: 'THREAT',
        defaultWidth: 120,
        minWidth: 90,
        defaultVisible: true,
        sortField: 'threatRank',
        sortAccessor: (f) => f.threatRank ?? 3,
        defaultSortDirection: 'desc',
        description: 'KEV status and EPSS score from threat intelligence feeds',
        category: 'signal',
        renderCell: (f) => <ThreatContextCell cveId={f.cveId || f.ruleId} threat={f.threat} />
    },
    {
        id: 'status',
        label: 'STATUS',
        defaultWidth: 90,
        minWidth: 70,
        defaultVisible: true,
        sortField: 'status',
        sortAccessor: (f) => f.status,
        description: 'Triage status (open, fixed, ignored, etc.)',
        category: 'signal',
        renderCell: (f) => (
            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide border ${f.status === 'open' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                f.status === 'fixed' ? 'bg-green-50 text-green-600 border-green-200' :
                    'bg-gray-50 text-gray-500 border-gray-200'
                }`}>
                {f.status}
            </span>
        )
    },
    {
        id: 'title',
        label: 'VULNERABILITY',
        defaultWidth: 300,
        minWidth: 150,
        defaultVisible: true,
        sortField: 'title',
        sortAccessor: (f) => f.title,
        description: 'Vulnerability title and description',
        category: 'context',
        renderCell: (f) => (
            <div className="flex flex-col truncate">
                <span className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate" title={f.title}>
                    {f.title}
                </span>
                <span className="text-xs text-gray-500 truncate" title={f.description}>
                    {f.description}
                </span>
            </div>
        )
    },
    {
        id: 'location',
        label: 'LOCATION',
        defaultWidth: 180,
        minWidth: 100,
        defaultVisible: true,
        sortField: 'location',
        sortAccessor: (f) => f.location?.filepath || '',
        description: 'File path and line number of the finding',
        category: 'context',
        renderCell: (f) => (
            <div className="flex flex-col truncate">
                <span className="text-xs font-mono text-gray-600 dark:text-gray-400 truncate" title={f.location?.filepath}>
                    {f.location?.filepath?.split('/').pop() || '-'}
                </span>
                <span className="text-[10px] text-gray-400 truncate">
                    {f.location?.startLine ? `L${f.location.startLine}` : ''}
                </span>
            </div>
        )
    },
    {
        id: 'evidence_peek',
        label: 'EVIDENCE',
        defaultWidth: 200,
        minWidth: 120,
        defaultVisible: true,
        sortField: 'evidenceScore',
        sortAccessor: (f) => f.evidenceScore ?? (f.location?.snippet ? 1 : 0),
        defaultSortDirection: 'desc',
        description: 'Quick preview of supporting evidence',
        category: 'context',
        renderCell: (f) => <EvidencePeekCell evidencePeek={f.evidencePeek} />
    },
    {
        id: 'identifier',
        label: 'IDENTIFIER',
        defaultWidth: 140,
        minWidth: 100,
        defaultVisible: false,
        autoShow: (stats) => stats.cveDensity >= 0.2,
        sortField: 'ruleId',
        sortAccessor: (f) => f.cveId || f.ruleId || '',
        description: 'CVE ID or rule identifier',
        category: 'metadata',
        renderCell: (f) => (
            <span className="font-mono text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded truncate" title={f.cveId || f.ruleId}>
                {f.cveId || f.ruleId || '-'}
            </span>
        )
    },
    {
        id: 'package',
        label: 'PACKAGE',
        defaultWidth: 150,
        minWidth: 100,
        defaultVisible: false,
        autoShow: (stats) => stats.scaFindingsRatio >= 0.15,
        sortField: 'packageName',
        sortAccessor: (f) => f.packageName || '',
        description: 'Affected package name and version',
        category: 'metadata',
        renderCell: (f) => (
            <span className="font-mono text-xs text-gray-600 dark:text-gray-400 truncate" title={f.packageName}>
                {f.packageName || '-'}
            </span>
        )
    },
    {
        id: 'tool',
        label: 'TOOL',
        defaultWidth: 110,
        minWidth: 80,
        defaultVisible: false,
        autoShow: (stats) => stats.uniqueTools > 1,
        sortField: 'toolId',
        sortAccessor: (f) => f.toolId || '',
        description: 'Scanner tool that produced this finding',
        category: 'metadata',
        renderCell: (f) => <span className="font-mono text-xs text-gray-600 dark:text-gray-400 uppercase tracking-tighter">{f.toolId}</span>
    },
];

/**
 * Resolve which columns should be visible.
 * Priority: User Override > Auto-Show > Default Visible.
 */
export function resolveVisibleColumns(
    registry: ColumnMeta[],
    sessionStats: SessionStats,
    preferences?: GridColumnPreference[]
): ColumnMeta[] {
    const prefMap = new Map(preferences?.map(p => [p.columnId, p]) || []);

    return registry.filter(col => {
        const pref = prefMap.get(col.id);

        // 1. User override takes priority
        if (pref !== undefined) return pref.visible;

        // 2. Auto-show evaluated next
        if (col.autoShow) return col.autoShow(sessionStats);

        // 3. Default visibility baseline
        return col.defaultVisible;
    });
}

/**
 * Apply user width preferences to the resolved columns.
 */
export function applyWidthPreferences(
    columns: ColumnMeta[],
    preferences?: GridColumnPreference[]
): ColumnMeta[] {
    if (!preferences?.length) return columns;
    const prefMap = new Map(preferences.map(p => [p.columnId, p]));

    return columns.map(col => {
        const pref = prefMap.get(col.id);
        if (pref?.width) {
            return { ...col, defaultWidth: pref.width };
        }
        return col;
    });
}

// --- Legacy compat exports (will remove after FindingsGrid migration) ---
/** @deprecated Use COLUMN_REGISTRY + resolveVisibleColumns */
export type ColumnDef = ColumnMeta;
/** @deprecated Use COLUMN_REGISTRY */
export const findingsColumns = COLUMN_REGISTRY;
/** @deprecated Use resolveVisibleColumns */
export function computeVisibleColumns(columns: ColumnMeta[], sessionStats: SessionStats): ColumnMeta[] {
    return resolveVisibleColumns(columns, sessionStats);
}
