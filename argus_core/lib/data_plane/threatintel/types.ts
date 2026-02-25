export interface ThreatIntelSeedInput {
    cve: string;
    kev: boolean;
    epss: number | null;
    source?: 'seed';
}

export interface ThreatIntelDoc {
    intelId: string;
    cve: string;
    kev: boolean;
    kevFlag: boolean;
    epss: number | null;
    epssScore: number | null;
    exploitInWild: boolean;
    publishedAt: number | null;
    publishedDate: number | null;
    lastSeenAt: number;
    sourceRefs: string[];
}

export interface ThreatIntelSeedReport {
    count: number;
    ids: string[];
}
