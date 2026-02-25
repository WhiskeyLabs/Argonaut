import { useLiveQuery } from 'dexie-react-hooks';
import Dexie from 'dexie';
import { db } from '../lib/db';
import { Severity, FindingStatus, UniversalFinding } from '../lib/types/finding';

export interface FindingsFilter {
    status?: FindingStatus[];
    severity?: Severity[];
    toolId?: string[];
    dependencyLinked?: boolean;
    vulnerable?: boolean; // High / Critical
    search?: string[]; // Array of strings for Multi-term AND search
}

export interface FindingsSort {
    field: 'severityRank' | 'toolId' | 'status' | 'packageName' | 'title' | 'location' | 'ruleId' | 'evidenceScore' | 'reachabilityRank' | 'threatRank';
    direction: 'asc' | 'desc';
}

export interface FacetCounts {
    bySeverity: Record<Severity, number>;
    byStatus: Record<FindingStatus, number>;
    byTool: Record<string, number>;
}

export interface FindingsQueryResult {
    resultIds: string[];
    findings: UniversalFinding[];
    scopeCount: number;   // Count matching the funnel filter only (before search/severity/status)
    totalCount: number;   // Visible count after ALL filters
    facetCounts: FacetCounts;
    isLoading: boolean;
}

const DEFAULT_FACETS: FacetCounts = {
    bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    byStatus: { open: 0, fixed: 0, ignored: 0, in_progress: 0, risk_accepted: 0, false_positive: 0 },
    byTool: {},
};

const SORT_INDEX_MAP: Record<FindingsSort['field'], string> = {
    severityRank: '[sessionId+severityRank]',
    toolId: '[sessionId+toolId]',
    status: '[sessionId+status]',
    packageName: '[sessionId+packageName]',
    title: '[sessionId+title]',
    location: '[sessionId+location.filepath]',
    ruleId: '[sessionId+ruleId]',
    evidenceScore: '[sessionId+evidenceScore]',
    reachabilityRank: '[sessionId+reachabilityRank]',
    threatRank: '[sessionId+threatRank]',
};

function normalizeSearchTerms(search?: string[]): string[] {
    if (!search?.length) return [];
    return search.map(term => term.trim().toLowerCase()).filter(Boolean);
}

function matchesSearch(f: UniversalFinding, terms: string[]): boolean {
    if (!terms.length) return true;
    const title = (f.title || '').toLowerCase();
    const rule = (f.ruleId || '').toLowerCase();
    const desc = (f.description || '').toLowerCase();
    const path = (f.location?.filepath || '').toLowerCase();
    const pkg = (f.packageName || '').toLowerCase();
    const tool = (f.toolId || '').toLowerCase();

    return terms.every(term =>
        title.includes(term) ||
        rule.includes(term) ||
        desc.includes(term) ||
        path.includes(term) ||
        pkg.includes(term) ||
        tool.includes(term)
    );
}

function matchesAllFilters(f: UniversalFinding, filter: FindingsFilter, searchTerms: string[]): boolean {
    if (filter.status?.length && !filter.status.includes(f.status)) return false;
    if (filter.severity?.length && !filter.severity.includes(f.severity)) return false;
    if (filter.toolId?.length && !filter.toolId.includes(f.toolId)) return false;
    if (filter.dependencyLinked && f.dependencyAnalysis?.status !== 'REAL') return false;
    if (filter.vulnerable && !['critical', 'high'].includes(f.severity)) return false;
    if (!matchesSearch(f, searchTerms)) return false;
    return true;
}

function matchesScopeFilters(f: UniversalFinding, filter: FindingsFilter): boolean {
    if (filter.vulnerable && !['critical', 'high'].includes(f.severity)) return false;
    if (filter.dependencyLinked && f.dependencyAnalysis?.status !== 'REAL') return false;
    return true;
}

function getSortValue(f: UniversalFinding, field: FindingsSort['field']): string | number {
    switch (field) {
        case 'location':
            return f.location?.filepath || '';
        case 'evidenceScore':
            return f.evidenceScore ?? (f.location?.snippet ? 1 : 0);
        case 'reachabilityRank':
            return f.reachabilityRank ?? 3;
        case 'threatRank':
            return f.threatRank ?? 3;
        case 'severityRank':
            return f.severityRank ?? 0;
        case 'toolId':
            return f.toolId || '';
        case 'status':
            return f.status || '';
        case 'packageName':
            return f.packageName || '';
        case 'title':
            return f.title || '';
        case 'ruleId':
            return f.ruleId || '';
        default:
            return '';
    }
}

export function useFindingsQuery(
    sessionId: string | null,
    filter: FindingsFilter,
    sort: FindingsSort
): FindingsQueryResult {
    const filterKey = JSON.stringify(filter);
    const sortKey = JSON.stringify(sort);

    return useLiveQuery(async () => {
        if (!sessionId) {
            return {
                resultIds: [],
                scopeCount: 0,
                totalCount: 0,
                facetCounts: DEFAULT_FACETS,
                isLoading: false,
                findings: []
            };
        }

        const searchTerms = normalizeSearchTerms(filter.search);
        const filterPredicate = (f: UniversalFinding) => matchesAllFilters(f, filter, searchTerms);

        let finalFindings: UniversalFinding[] = [];
        const sortIndex = SORT_INDEX_MAP[sort.field];

        if (sortIndex) {
            const sortedCollection = db.findings
                .where(sortIndex)
                .between([sessionId, Dexie.minKey], [sessionId, Dexie.maxKey])
                .and(filterPredicate);

            finalFindings = sort.direction === 'desc'
                ? await sortedCollection.reverse().toArray()
                : await sortedCollection.toArray();
        } else {
            // Safety fallback: if index map drifts, keep deterministic behavior.
            finalFindings = await db.findings
                .where('sessionId')
                .equals(sessionId)
                .and(filterPredicate)
                .toArray();

            finalFindings.sort((a, b) => {
                const valA = getSortValue(a, sort.field);
                const valB = getSortValue(b, sort.field);
                if (valA < valB) return sort.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sort.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        const resultIds = finalFindings.map(f => f.id);

        // 4. Scope Count (funnel-only, before search/severity/status toolbar filters)
        // We compute this by applying only the funnel filters (vulnerable, dependencyLinked)
        // without the toolbar filters (search, severity, status)
        let scopeCount = resultIds.length; // default: same as visible
        if (filter.search?.length || filter.severity?.length || filter.status?.length) {
            // There are toolbar filters active, so scope count is the funnel-only count
            const scopeCollection = db.findings
                .where('sessionId')
                .equals(sessionId)
                .and(f => matchesScopeFilters(f, filter));
            scopeCount = await scopeCollection.count();
        }

        // 5. Facet Counts (Scoped to filtered result set)
        const facetCounts: FacetCounts = {
            bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
            byStatus: { open: 0, fixed: 0, ignored: 0, in_progress: 0, risk_accepted: 0, false_positive: 0 },
            byTool: {},
        };
        for (const f of finalFindings) {
            // Severity
            if (f.severity in facetCounts.bySeverity) {
                facetCounts.bySeverity[f.severity]++;
            }
            // Status
            if (f.status in facetCounts.byStatus) {
                facetCounts.byStatus[f.status]++;
            }
            // Tool
            facetCounts.byTool[f.toolId] = (facetCounts.byTool[f.toolId] || 0) + 1;
        }

        return {
            resultIds,
            findings: finalFindings,
            scopeCount,
            totalCount: resultIds.length,
            facetCounts,
            isLoading: false
        };

    }, [sessionId, filterKey, sortKey]) || {
        resultIds: [],
        findings: [],
        scopeCount: 0,
        totalCount: 0,
        facetCounts: DEFAULT_FACETS,
        isLoading: true
    };
}
