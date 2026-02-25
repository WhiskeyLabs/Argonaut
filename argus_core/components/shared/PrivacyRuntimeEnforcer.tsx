'use client';

import { useEffect } from 'react';
import { usePrivacySettings } from '@/hooks/usePrivacySettings';
import { purgeLocalAnalysisData } from '@/lib/privacy/purge';
import { clearAllNavMemory } from '@/lib/navigation/navMemory';

const PENDING_PURGE_KEY = 'argus.privacy.pendingPurgeOnBoot';

export function PrivacyRuntimeEnforcer() {
    const { policy } = usePrivacySettings();

    useEffect(() => {
        let mounted = true;

        const consumePendingPurge = async () => {
            const pending = window.localStorage.getItem(PENDING_PURGE_KEY);
            if (pending !== '1') return;
            window.localStorage.removeItem(PENDING_PURGE_KEY);
            try {
                await purgeLocalAnalysisData();
                if (mounted) {
                    clearAllNavMemory();
                }
            } catch (error) {
                console.error('[PrivacyRuntimeEnforcer] Failed to purge pending local data', error);
            }
        };

        consumePendingPurge();
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        if (!policy.shouldAutoDeleteOnClose) {
            window.localStorage.removeItem(PENDING_PURGE_KEY);
            return;
        }

        const markPendingPurge = () => {
            try {
                window.localStorage.setItem(PENDING_PURGE_KEY, '1');
            } catch {
                // ignore storage failures
            }
        };

        window.addEventListener('pagehide', markPendingPurge);
        window.addEventListener('beforeunload', markPendingPurge);
        return () => {
            window.removeEventListener('pagehide', markPendingPurge);
            window.removeEventListener('beforeunload', markPendingPurge);
        };
    }, [policy.shouldAutoDeleteOnClose]);

    return null;
}
