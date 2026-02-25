import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { threatIntelService } from '@/lib/services/threatIntelService';
import { useEffect, useState } from 'react';
import { ThreatIntel, ThreatMeta } from '@/lib/types/threat';
import { useThreatIntelSettings } from './useThreatIntelSettings';

export function useThreatTicker() {
    const { tiEnabled } = useThreatIntelSettings();
    // 1. Live Query for Meta Status
    const meta = useLiveQuery(async () => {
        return await db.ti_meta.get('cisa-kev');
    });

    // 2. Live Query for Threats
    // We only want the top 10 recent ones
    const threats = useLiveQuery(async () => {
        return await threatIntelService.getRecentKEVs(10);
    });

    const [isRefreshing, setIsRefreshing] = useState(false);

    // 3. Initial Load / Auto-Heal Logic
    useEffect(() => {
        if (!tiEnabled) return;
        const init = async () => {
            // If no meta exists, or status is empty/error, try to fetch
            const currentMeta = await db.ti_meta.get('cisa-kev');
            const count = await db.threat_intel.count();

            if (!currentMeta || count === 0) {
                refresh();
            }
        };
        init();
    }, [tiEnabled]);

    const refresh = async () => {
        if (isRefreshing) return;
        if (!tiEnabled) return;
        setIsRefreshing(true);
        try {
            await threatIntelService.refreshFeeds();
        } finally {
            setIsRefreshing(false);
        }
    };

    // Derived State
    const status = meta?.status || 'empty';
    const lastUpdated = meta?.lastSuccessAt;
    const isDegraded = status === 'degraded';
    const isError = status === 'error';
    const isLoading = tiEnabled && (status === 'loading' || isRefreshing);

    // Safety check: specific "No Data" state
    const isEmpty = !threats || threats.length === 0;

    return {
        threats: threats || [],
        meta,
        status,
        isLoading,
        isDegraded,
        isError,
        isEmpty,
        refresh,
        lastUpdated
    };
}
