
export interface ThreatIntel {
    cveId: string;
    kev: boolean;
    kevDateAdded?: string; // YYYY-MM-DD
    epssScore: number;     // 0.0 - 1.0
    epssPercentile: number; // 0.0 - 1.0
    lastUpdated: number;   // timestamp
    source: 'CISA_KEV' | 'EPSS' | 'Hypothetical';
    name?: string;         // Vulnerability Name (for ticker)
    description?: string;  // Short Description
    epssLastFetched?: number; // timestamp
    kevCatalogVersion?: string; // from CISA meta
}

export type Urgency = 'IMMEDIATE' | 'SOON' | 'WATCH' | 'LOW';

export interface ThreatContext {
    urgency: Urgency;
    intel?: ThreatIntel;
}

export interface ThreatMeta {
    source: string; // PK: 'cisa-kev'
    status: 'ok' | 'degraded' | 'error' | 'loading' | 'empty' | 'disabled';
    lastSuccessAt?: number;
    lastAttemptAt?: number;
    lastErrorCode?: string;
    lastErrorMessage?: string;
    lastItemCount?: number;
    upstreamUpdatedAt?: string;
}
