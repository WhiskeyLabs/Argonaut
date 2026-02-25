/**
 * useThreatIntelSettings
 * 
 * Persistent Threat Intel toggle backed by Dexie `settings` table.
 * Default: OFF (secure-by-default baseline).
 */

import { useState, useCallback, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { evidenceLog } from '@/lib/services/evidenceLog';
import { EventType } from '@/lib/types/events';
import { PRIVACY_DEFAULTS, PRIVACY_KEYS, resolveEffectivePrivacyPolicy } from '@/lib/privacy/policy';

const TI_ENABLED_KEY = 'ti_enabled';
const DEFAULT_TI_ENABLED = true;

interface UseThreatIntelSettingsResult {
    tiWorkflowEnabled: boolean;
    tiEnabled: boolean;
    setTIEnabled: (enabled: boolean) => Promise<void>;
    blockedByPrivacy: boolean;
    isLoading: boolean;
}

export function useThreatIntelSettings(sessionId?: string): UseThreatIntelSettingsResult {
    const [isLoading, setIsLoading] = useState(true);

    const settings = useLiveQuery(
        async () => {
            const keys = [
                TI_ENABLED_KEY,
                PRIVACY_KEYS.localOnlyMode,
                PRIVACY_KEYS.tiPublicEnrichment,
            ];
            return db.settings.where('key').anyOf(keys).toArray();
        },
        [],
        null
    );

    useEffect(() => {
        if (settings !== null) {
            setIsLoading(false);
        }
    }, [settings]);

    const map = new Map((settings || []).map((row) => [row.key, row.value]));
    const tiWorkflowEnabled = typeof map.get(TI_ENABLED_KEY) === 'boolean'
        ? Boolean(map.get(TI_ENABLED_KEY))
        : DEFAULT_TI_ENABLED;
    const privacySnapshot = {
        ...PRIVACY_DEFAULTS,
        localOnlyMode: typeof map.get(PRIVACY_KEYS.localOnlyMode) === 'boolean'
            ? Boolean(map.get(PRIVACY_KEYS.localOnlyMode))
            : PRIVACY_DEFAULTS.localOnlyMode,
        tiPublicEnrichment: typeof map.get(PRIVACY_KEYS.tiPublicEnrichment) === 'boolean'
            ? Boolean(map.get(PRIVACY_KEYS.tiPublicEnrichment))
            : PRIVACY_DEFAULTS.tiPublicEnrichment,
    };
    const policy = resolveEffectivePrivacyPolicy(privacySnapshot);
    const tiEnabled = tiWorkflowEnabled && policy.canUseThreatIntel;
    const blockedByPrivacy = tiWorkflowEnabled && !policy.canUseThreatIntel;

    const setTIEnabled = useCallback(async (enabled: boolean) => {
        await db.settings.put({ key: TI_ENABLED_KEY, value: enabled });

        if (sessionId) {
            await evidenceLog.log(sessionId, EventType.TI_TOGGLED, {
                enabled,
                previous: tiEnabled,
                timestamp: Date.now(),
            });
        }
    }, [sessionId, tiEnabled]);

    return { tiWorkflowEnabled, tiEnabled, setTIEnabled, blockedByPrivacy, isLoading };
}
