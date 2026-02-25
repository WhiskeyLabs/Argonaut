import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Cache configuration
const CACHE_FILE = path.join(process.cwd(), '.tmp', 'cisa_kev_cache.json');
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

interface CisaVulnerability {
    cveID: string;
    vendorProject: string;
    product: string;
    vulnerabilityName: string;
    dateAdded: string;
    shortDescription: string;
    requiredAction: string;
    dueDate: string;
    notes: string;
}

interface CisaResponse {
    title: string;
    catalogVersion: string;
    dateReleased: string;
    count: number;
    vulnerabilities: CisaVulnerability[];
}

interface NormalizedThreatItem {
    id: string; // kev:CVE-XXXX-YYYY
    cve: string;
    vendorProject: string;
    product: string;
    vulnerabilityName: string;
    dateAdded: string;
    shortDescription: string;
    requiredAction: string;
    dueDate: string;
    notes: string;
}

interface ThreatFeedResponse {
    meta: {
        source: 'cisa-kev';
        fetchedAt: number;
        upstreamUpdatedAt?: string;
        count: number;
        status: 'ok' | 'error';
        errorCode?: string;
        errorMessage?: string;
    };
    items: NormalizedThreatItem[];
}

async function ensureTmpDir() {
    try {
        await fs.mkdir(path.join(process.cwd(), '.tmp'), { recursive: true });
    } catch (e) {
        // ignore if exists
    }
}

async function getCachedData(): Promise<ThreatFeedResponse | null> {
    try {
        const data = await fs.readFile(CACHE_FILE, 'utf-8');
        const parsed = JSON.parse(data) as ThreatFeedResponse;
        const age = Date.now() - parsed.meta.fetchedAt;
        if (age < CACHE_TTL_MS) {
            return parsed;
        }
        return null; // Expired
    } catch (e) {
        return null; // No cache or error reading
    }
}

async function saveToCache(data: ThreatFeedResponse) {
    try {
        await ensureTmpDir();
        await fs.writeFile(CACHE_FILE, JSON.stringify(data), 'utf-8');
    } catch (e) {
        console.error('[API] Failed to save KEV cache', e);
    }
}

export async function GET(req: Request) {
    if (req.headers.get('x-argus-privacy-intent') !== 'ti-public-enrichment') {
        return NextResponse.json(
            { error: 'Privacy policy denied', code: 'PRIVACY_EGRESS_BLOCKED' },
            { status: 403 }
        );
    }

    // 1. Try Cache
    const cached = await getCachedData();
    if (cached) {
        return NextResponse.json(cached);
    }

    // 2. Fetch Upstream
    try {
        const response = await fetch('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json');

        if (!response.ok) {
            throw new Error(`Upstream error: ${response.status}`);
        }

        const cisaData = (await response.json()) as CisaResponse;

        // 3. Normalize
        const items: NormalizedThreatItem[] = cisaData.vulnerabilities.map(v => ({
            id: `kev:${v.cveID}`,
            cve: v.cveID,
            vendorProject: v.vendorProject,
            product: v.product,
            vulnerabilityName: v.vulnerabilityName,
            dateAdded: v.dateAdded,
            shortDescription: v.shortDescription,
            requiredAction: v.requiredAction,
            dueDate: v.dueDate,
            notes: v.notes
        }));

        const payload: ThreatFeedResponse = {
            meta: {
                source: 'cisa-kev',
                fetchedAt: Date.now(),
                upstreamUpdatedAt: cisaData.dateReleased,
                count: items.length,
                status: 'ok'
            },
            items
        };

        // 4. Save Cache
        await saveToCache(payload);

        return NextResponse.json(payload);

    } catch (error) {
        console.error('[API] KEV Fetch Failed', error);

        // Return 503 but with a structured error payload
        // If we had an expired cache, we could serve it as degraded here, 
        // but for now let's just fail safely.

        // Attempt to return stale cache if available?
        // For simplicity in Phase 1, just return error.

        return NextResponse.json({
            meta: {
                source: 'cisa-kev',
                status: 'error',
                fetchedAt: Date.now(),
                errorCode: 'UPSTREAM_FAIL',
                errorMessage: error instanceof Error ? error.message : 'Unknown error'
            },
            items: []
        }, { status: 503 });
    }
}
