import { NextResponse } from 'next/server';
import esClient from '@/lib/esClient';

const INDEX_FINDINGS = 'argonaut_findings';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ runId: string }> }
) {
    try {
        const { runId } = await params;
        const { searchParams } = new URL(request.url);

        const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);
        const rawCursor = searchParams.get('cursor');
        const cursor = rawCursor ? JSON.parse(rawCursor) : undefined;

        // Filters
        const reachableOnly = searchParams.get('reachableOnly') === 'true';
        const kevOnly = searchParams.get('kevOnly') === 'true';
        const epssMin = searchParams.get('epssMin') === 'true';

        const statusValues = searchParams.getAll('status');
        const severityValues = searchParams.getAll('severity');

        const mustClauses: any[] = [{ term: { runId } }];

        if (reachableOnly) {
            mustClauses.push(
                { term: { 'context.reachability.reachable': true } },
                { term: { 'context.reachability.status': 'REAL' } }
            );
        }

        if (kevOnly) {
            mustClauses.push({ term: { 'context.threat.kev': true } });
        }

        if (epssMin) {
            mustClauses.push({ range: { 'context.threat.epss': { gte: 0.50 } } });
        }

        if (severityValues.length > 0) {
            mustClauses.push({ terms: { severity: severityValues } });
        }

        let shouldClauses: any[] = [];
        let filterClauses: any[] = [];

        if (statusValues.length > 0) {
            const hasOpen = statusValues.includes('Open');
            const otherStatuses = statusValues.filter(s => s !== 'Open');

            if (otherStatuses.length > 0) {
                shouldClauses.push({ terms: { 'triage.status': otherStatuses } });
            }

            if (hasOpen) {
                shouldClauses.push({ term: { 'triage.status': 'Open' } });
                shouldClauses.push({ term: { 'triage.status': 'DEMO_CURATED' } });
                shouldClauses.push({ bool: { must_not: { exists: { field: 'triage.status' } } } });
            }

            filterClauses.push({ bool: { should: shouldClauses, minimum_should_match: 1 } });
        }

        const body: any = {
            size: pageSize,
            query: {
                bool: {
                    must: mustClauses,
                    filter: filterClauses
                }
            },
            sort: [
                { priorityScore: { order: 'desc', missing: '_last' } },
                { findingId: { order: 'asc' } }
            ],
            track_total_hits: true
        };

        if (cursor && Array.isArray(cursor)) {
            body.search_after = cursor;
        }

        const res = await esClient.search({
            index: INDEX_FINDINGS,
            ...body
        });

        const hits = res.hits.hits || [];
        const items = hits.map((hit: any) => ({ ...hit._source, _id: hit._id }));
        const total = typeof res.hits.total === 'number' ? res.hits.total : res.hits.total?.value || 0;

        const nextCursor = hits.length === pageSize ? hits[hits.length - 1].sort : null;

        return NextResponse.json({
            items,
            total,
            nextCursor
        });

    } catch (error: any) {
        console.error('Error fetching findings:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
