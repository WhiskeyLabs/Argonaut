
import { useState, useEffect, useRef } from 'react';
import { ThreatIntel } from '@/lib/types/threat';
import { threatIntelService } from '@/lib/services/threatIntelService';
import { useThreatIntelSettings } from './useThreatIntelSettings';

export function useThreatIntel(cveId: string | undefined) {
    const { tiEnabled } = useThreatIntelSettings();
    const [data, setData] = useState<ThreatIntel | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<Error | null>(null);
    const prevTiEnabled = useRef(tiEnabled);

    useEffect(() => {
        // 1. Gating: If disabled, clear data and skip fetch
        if (!tiEnabled) {
            setData(null);
            setLoading(false);
            return;
        }

        // 2. Reactive Refresh: If toggled ON, force a feed refresh
        const shouldRefresh = !prevTiEnabled.current && tiEnabled;
        prevTiEnabled.current = tiEnabled;

        if (!cveId || !cveId.startsWith('CVE-')) {
            setData(null);
            return;
        }

        let mounted = true;

        const fetchThreat = async () => {
            setLoading(true);
            try {
                if (shouldRefresh) {
                    await threatIntelService.refreshFeeds();
                }
                const intel = await threatIntelService.getThreatIntel(cveId);
                if (mounted) setData(intel);
            } catch (err) {
                if (mounted) setError(err as Error);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        fetchThreat();

        return () => {
            mounted = false;
        };
    }, [cveId, tiEnabled]);

    return { data, loading, error };
}
