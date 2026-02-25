import { ThreatIntel } from '../types/threat';
import { db } from '../db/index';
import { getEffectivePrivacyPolicyFromDb } from '@/lib/privacy/policy';

const EPSS_PROXY_URL = '/api/ti/epss';

export const THREAT_STALENESS = {
    FRESH: 24 * 60 * 60 * 1000,      // 24 hours
    AGING: 7 * 24 * 60 * 60 * 1000,  // 7 days
    STALE: 30 * 24 * 60 * 60 * 1000  // 30 days
};

export class ThreatIntelService {
    private static instance: ThreatIntelService;
    private isMockMode: boolean = false;
    // Small L1 cache for performance during rapid grid rendering
    private l1Cache: Map<string, ThreatIntel> = new Map();

    private constructor() { }

    public static getInstance(): ThreatIntelService {
        if (!ThreatIntelService.instance) {
            ThreatIntelService.instance = new ThreatIntelService();
        }
        return ThreatIntelService.instance;
    }

    public setMockMode(enabled: boolean) {
        this.isMockMode = enabled;
    }

    public async getThreatStatus(source: string = 'cisa-kev') {
        return await db.ti_meta.get(source);
    }

    /**
     * Refreshes Threat Intelligence feeds.
     * Downloads CISA KEV (full) and updates the DB.
     * EPSS is fetched on demand/batch for now.
     */
    public async refreshFeeds(): Promise<void> {
        const policy = await getEffectivePrivacyPolicyFromDb();
        if (!policy.canUseThreatIntel) {
            await db.ti_meta.put({
                source: 'cisa-kev',
                status: 'disabled',
                lastAttemptAt: Date.now(),
            });
            return;
        }

        if (this.isMockMode) {
            console.log('[ThreatIntel] Using MOCK feeds');
            await this.loadMockData();
            return;
        }

        try {
            await this.fetchKEV();
        } catch (error) {
            console.error('[ThreatIntel] Failed to refresh feeds:', error);
            // Fallback to cache/DB handled by retrieval methods
        }
    }

    private async fetchWithRetry(
        url: string,
        retries: number = 3,
        backoff: number = 1000,
        timeout: number = 10000,
        headers?: HeadersInit
    ): Promise<Response> {
        for (let i = 0; i < retries; i++) {
            try {
                const controller = new AbortController();
                const id = setTimeout(() => controller.abort(), timeout);
                const response = await fetch(url, { signal: controller.signal, headers });
                clearTimeout(id);

                // If successful or client error (404), return immediately. 
                // We only retry on 5xx (server error) or 429 (rate limit).
                if (response.ok || (response.status < 500 && response.status !== 429)) {
                    return response;
                }

                // If we are here, it's a 5xx or 429, so we throw to trigger retry
                throw new Error(`HTTP ${response.status}`);
            } catch (err) {
                const isIsLastAttempt = i === retries - 1;
                if (isIsLastAttempt) throw err;

                // Exponential backoff
                const delay = backoff * Math.pow(2, i);
                console.warn(`[ThreatIntel] Fetch failed, retrying in ${delay}ms...`, err);
                await new Promise(r => setTimeout(r, delay));
            }
        }
        throw new Error('Max retries reached');
    }

    private async fetchKEV(): Promise<void> {
        try {
            // Signal Loading
            await db.ti_meta.put({
                source: 'cisa-kev',
                status: 'loading',
                lastAttemptAt: Date.now()
            });

            const response = await this.fetchWithRetry(
                '/api/ti/kev',
                3,
                1000,
                15000,
                { 'x-argus-privacy-intent': 'ti-public-enrichment' }
            ); // 15s timeout for KEV
            const result = await response.json();

            if (result.meta.status === 'error') {
                throw new Error(result.meta.errorMessage || 'Unknown upstream error');
            }

            if (result.items) {
                const timestamp = Date.now();
                const catalogVersion = result.meta.catalogVersion;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const threatUpdates: ThreatIntel[] = await Promise.all(result.items.map(async (vuln: any) => {
                    // If we have existing entry, preserve EPSS.
                    const existing = await db.threat_intel.get(vuln.cve);

                    return {
                        cveId: vuln.cve, // API normalized 'cveID' to 'cve'
                        kev: true,
                        kevDateAdded: vuln.dateAdded,
                        // Preserve EPSS if exists, else 0 until fetched
                        epssScore: existing?.epssScore || 0,
                        epssPercentile: existing?.epssPercentile || 0,
                        lastUpdated: timestamp,
                        source: 'CISA_KEV',
                        name: vuln.vulnerabilityName,
                        description: vuln.shortDescription,
                        epssLastFetched: existing?.epssLastFetched,
                        kevCatalogVersion: catalogVersion
                    };
                }));

                // Chunking if needed, but Dexie handles 2k items fine
                await db.threat_intel.bulkPut(threatUpdates);

                // Update Health Meta - OK
                await db.ti_meta.put({
                    source: 'cisa-kev',
                    status: 'ok',
                    lastSuccessAt: timestamp,
                    lastAttemptAt: timestamp,
                    lastItemCount: threatUpdates.length,
                    upstreamUpdatedAt: result.meta.upstreamUpdatedAt
                });

                console.log(`[ThreatIntel] Updated KEV DB with ${threatUpdates.length} entries`);
            }
        } catch (e) {
            console.error('[ThreatIntel] Fetch KEV failed', e);

            // Update Health Meta - Error/Degraded
            const existingMeta = await db.ti_meta.get('cisa-kev');
            const hasData = (await db.threat_intel.filter(t => t.kev).count()) > 0;

            await db.ti_meta.put({
                source: 'cisa-kev',
                status: hasData ? 'degraded' : 'error',
                lastAttemptAt: Date.now(),
                lastSuccessAt: existingMeta?.lastSuccessAt,
                lastErrorCode: 'FETCH_FAIL',
                lastErrorMessage: e instanceof Error ? e.message : 'Unknown error'
            });

            throw e; // rethrow to let caller know
        }
    }

    public async getRecentKEVs(limit: number = 5): Promise<ThreatIntel[]> {
        // Query DB for KEVs, sorted by date added (descending)
        const allKevs = await db.threat_intel
            .filter(t => t.kev === true)
            .toArray();

        // Sort by date added desc (YYYY-MM-DD string sort works)
        return allKevs
            .sort((a, b) => (b.kevDateAdded || '').localeCompare(a.kevDateAdded || ''))
            .slice(0, limit);
    }

    public async getThreatIntel(cveId: string): Promise<ThreatIntel | null> {
        if (!cveId.startsWith('CVE-')) return null;

        // 1. Check L1 Cache
        if (this.l1Cache.has(cveId)) return this.l1Cache.get(cveId)!;

        // 2. Check DB
        let threat = await db.threat_intel.get(cveId);

        // 3. If missing EPSS and not mock, fetch it
        // Logic: If threat exists but epss is 0 and source is just CISA_KEV, we try to enrich
        // Or if threat doesn't exist at all.
        if ((!threat || (threat.epssScore === 0 && threat.source === 'CISA_KEV')) && !this.isMockMode) {
            const epssData = await this.fetchEPSSScore(cveId);
            if (epssData) {
                // Upsert
                threat = {
                    cveId,
                    kev: threat?.kev || false,
                    kevDateAdded: threat?.kevDateAdded,
                    epssScore: epssData.score,
                    epssPercentile: epssData.percentile,
                    lastUpdated: Date.now(),
                    source: threat?.kev ? 'CISA_KEV' : 'EPSS',
                    epssLastFetched: Date.now(),
                    kevCatalogVersion: threat?.kevCatalogVersion
                };
                await db.threat_intel.put(threat);
            }
        }

        // Default mock EPSS if missing in mock mode
        if (this.isMockMode && !threat) {
            // Deterministic mock based on CVE string hash for consistency
            const hash = cveId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            threat = {
                cveId,
                kev: (hash % 10) === 0, // 10% chance
                epssScore: (hash % 100) / 100,
                epssPercentile: (hash % 100) / 100,
                lastUpdated: Date.now(),
                source: 'Hypothetical',
                kevCatalogVersion: 'MOCK-2026.1'
            };
            // Don't save mock to DB to avoid polluting persistent state
        }

        if (threat) {
            this.l1Cache.set(cveId, threat);
        }

        return threat || null;
    }

    private async fetchEPSSScore(cveId: string): Promise<{ score: number; percentile: number } | null> {
        const policy = await getEffectivePrivacyPolicyFromDb();
        if (!policy.canUseThreatIntel) return null;
        try {
            const response = await this.fetchWithRetry(
                `${EPSS_PROXY_URL}?cve=${encodeURIComponent(cveId)}`,
                2,
                500,
                5000,
                { 'x-argus-privacy-intent': 'ti-public-enrichment' }
            );
            if (!response.ok) return null;

            const data = await response.json();
            if (data.data && data.data.length > 0) {
                return {
                    score: parseFloat(data.data[0].epss),
                    percentile: parseFloat(data.data[0].percentile)
                };
            }
        } catch (e) {
            console.warn(`[ThreatIntel] Failed to fetch EPSS for ${cveId}`, e);
        }
        return null;
    }

    // Bulk fetch for a page of findings
    public async getBatchThreatIntel(cveIds: string[]): Promise<Record<string, ThreatIntel>> {
        const results: Record<string, ThreatIntel> = {};
        const uniqueCves = Array.from(new Set(cveIds)).filter(id => id && id.startsWith('CVE-'));

        const missingInDb: string[] = [];

        // 1. Check L1/DB
        await Promise.all(uniqueCves.map(async (cve) => {
            if (this.l1Cache.has(cve)) {
                results[cve] = this.l1Cache.get(cve)!;
            } else {
                const fromDb = await db.threat_intel.get(cve);
                if (fromDb && (fromDb.epssScore > 0 || fromDb.source === 'EPSS')) {
                    // Good enough
                    results[cve] = fromDb;
                    this.l1Cache.set(cve, fromDb);
                } else {
                    if (fromDb) results[cve] = fromDb;
                    // If just KEV or missing, we might want EPSS
                    if (!fromDb || fromDb.epssScore === 0) {
                        missingInDb.push(cve);
                    }
                }
            }
        }));

        // 2. Fetch missing from API (if not mock)
        if (!this.isMockMode && missingInDb.length > 0) {
            // Batch fetch EPSS for missing
            await this.fetchEPSSBatch(missingInDb);

            // Re-read from DB/Cache
            for (const cve of missingInDb) {
                // Check L1 first because fetchEPSSBatch updates it
                if (this.l1Cache.has(cve)) {
                    results[cve] = this.l1Cache.get(cve)!;
                } else {
                    const final = await db.threat_intel.get(cve);
                    if (final) {
                        results[cve] = final;
                        this.l1Cache.set(cve, final);
                    }
                }
            }
        } else if (this.isMockMode) {
            // Fill mocks
            for (const cve of missingInDb) {
                const mock = await this.getThreatIntel(cve);
                if (mock) results[cve] = mock;
            }
        }

        return results;
    }

    private async fetchEPSSBatch(cveIds: string[]) {
        if (this.isMockMode) return;
        const policy = await getEffectivePrivacyPolicyFromDb();
        if (!policy.canUseThreatIntel) return;

        // Split into chunks of 10 for API
        const chunkSize = 10;
        for (let i = 0; i < cveIds.length; i += chunkSize) {
            const chunk = cveIds.slice(i, i + chunkSize);
            const url = `${EPSS_PROXY_URL}?cve=${encodeURIComponent(chunk.join(','))}`;
            try {
                const response = await this.fetchWithRetry(
                    url,
                    2,
                    500,
                    8000,
                    { 'x-argus-privacy-intent': 'ti-public-enrichment' }
                );
                const data = await response.json();
                if (data.data) {
                    const timestamp = Date.now();
                    const updates: ThreatIntel[] = [];
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await Promise.all(data.data.map(async (item: any) => {
                        const existing = await db.threat_intel.get(item.cve) || {
                            cveId: item.cve,
                            kev: false,
                            epssScore: 0,
                            epssPercentile: 0,
                            lastUpdated: 0,
                            source: 'EPSS'
                        };

                        const updated: ThreatIntel = {
                            ...existing,
                            epssScore: parseFloat(item.epss),
                            epssPercentile: parseFloat(item.percentile),
                            lastUpdated: timestamp,
                            source: existing.kev ? 'CISA_KEV' : 'EPSS',
                            epssLastFetched: timestamp,
                            kevCatalogVersion: existing.kevCatalogVersion
                        };
                        updates.push(updated);
                        this.l1Cache.set(item.cve, updated);
                    }));
                    // Bulk save
                    if (updates.length > 0) {
                        await db.threat_intel.bulkPut(updates);
                    }
                }
            } catch (e) {
                console.warn('[ThreatIntel] Batch EPSS failed', e);
            }
        }
    }

    private async loadMockData() {
        console.log('[ThreatIntel] Loading Mock Data...');
        const timestamp = Date.now();

        // Log4j example
        const log4j: ThreatIntel = {
            cveId: 'CVE-2021-44228',
            kev: true,
            kevDateAdded: '2021-12-10',
            epssScore: 0.97,
            epssPercentile: 0.99,
            lastUpdated: timestamp,
            source: 'CISA_KEV',
            kevCatalogVersion: 'MOCK-DATA'
        };

        // Struts2 example
        const struts: ThreatIntel = {
            cveId: 'CVE-2017-5638',
            kev: true,
            kevDateAdded: '2017-10-01',
            epssScore: 0.95,
            epssPercentile: 0.98,
            lastUpdated: timestamp,
            source: 'CISA_KEV',
            kevCatalogVersion: 'MOCK-DATA'
        };

        await db.threat_intel.bulkPut([log4j, struts]);
        this.l1Cache.set(log4j.cveId, log4j);
        this.l1Cache.set(struts.cveId, struts);
    }
}

export const threatIntelService = ThreatIntelService.getInstance();
