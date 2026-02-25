import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThreatIntelService, THREAT_STALENESS } from '@/lib/services/threatIntelService';
import { db } from '@/lib/db';

// Mock Fetch
const mockFetch = global.fetch as jest.Mock;

describe('ThreatIntelService', () => {
    let service: ThreatIntelService;

    beforeEach(async () => {
        service = ThreatIntelService.getInstance();
        service.setMockMode(false);
        vi.clearAllMocks();
        // Explicitly clear for safety
        await db.threat_intel.clear();
        await db.ti_meta.clear();
    });

    it('should calculate staleness correctly', () => {
        expect(THREAT_STALENESS.FRESH).toBe(24 * 60 * 60 * 1000);
        expect(THREAT_STALENESS.STALE).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it('should fetch KEV and populate DB with provenance', async () => {
        const mockKevResponse = {
            meta: {
                status: 'ok',
                upstreamUpdatedAt: '2026-02-18T12:00:00Z',
                catalogVersion: '2026.02.18'
            },
            items: [
                {
                    cve: 'CVE-2021-44228',
                    vulnerabilityName: 'Log4j',
                    shortDescription: 'RCE in Log4j',
                    dateAdded: '2021-12-10'
                }
            ]
        };

        const mockResponse = {
            ok: true,
            status: 200,
            json: async () => mockKevResponse
        };

        mockFetch.mockResolvedValue(mockResponse);

        await service.refreshFeeds();

        // Verify DB Population
        const threat = await db.threat_intel.get('CVE-2021-44228');
        expect(threat).toBeDefined();
        expect(threat?.cveId).toBe('CVE-2021-44228');
        expect(threat?.kev).toBe(true);
        expect(threat?.kevCatalogVersion).toBe('2026.02.18');
        expect(threat?.lastUpdated).toBeDefined();

        // Verify Meta populated
        const meta = await db.ti_meta.get('cisa-kev');
        expect(meta?.status).toBe('ok');
        expect(meta?.lastItemCount).toBe(1);
    });

    it('should handle KEV fetch failure gracefully', { timeout: 15000 }, async () => {
        // Force failure
        mockFetch.mockRejectedValue(new Error('Network Error'));

        // Should not throw, but log error
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        await service.refreshFeeds();

        await service.refreshFeeds();

        // Verify Meta status is error
        const meta = await db.ti_meta.get('cisa-kev');
        expect(meta?.status).toBe('error');
        expect(meta?.lastErrorCode).toBe('FETCH_FAIL');

        consoleSpy.mockRestore();
    });

    it('should enrich with EPSS on demand and record provenance', async () => {
        // Pre-populate KEV entry without EPSS
        await db.threat_intel.put({
            cveId: 'CVE-2017-5638',
            kev: true,
            epssScore: 0,
            epssPercentile: 0,
            lastUpdated: Date.now() - 10000,
            source: 'CISA_KEV'
        });

        const mockEpssResponse = {
            data: [{ cve: 'CVE-2017-5638', epss: '0.95', percentile: '0.98' }]
        };

        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => mockEpssResponse
        });

        const threat = await service.getThreatIntel('CVE-2017-5638');

        expect(threat?.epssScore).toBe(0.95);
        expect(threat?.epssLastFetched).toBeDefined();
        // Should preserve KEV flag
        expect(threat?.kev).toBe(true);
    });
});
