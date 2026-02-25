'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
    EffectivePrivacyPolicy,
    PRIVACY_DEFAULTS,
    PRIVACY_KEYS,
    PrivacySettingsSnapshot,
    resolveEffectivePrivacyPolicy,
} from '@/lib/privacy/policy';

interface UsePrivacySettingsResult {
    snapshot: PrivacySettingsSnapshot;
    policy: EffectivePrivacyPolicy;
    setLocalOnlyMode: (enabled: boolean) => Promise<void>;
    setSessionPersistence: (enabled: boolean) => Promise<void>;
    setAutoDeleteOnClose: (enabled: boolean) => Promise<void>;
    setTiPublicEnrichment: (enabled: boolean) => Promise<void>;
    setAiCloudAssistance: (enabled: boolean) => Promise<void>;
    setAiAllowCodeSnippets: (enabled: boolean) => Promise<void>;
    setTelemetryOptIn: (enabled: boolean) => Promise<void>;
    isLoading: boolean;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function buildSnapshot(values: Map<string, unknown>): PrivacySettingsSnapshot {
    return {
        localOnlyMode: toBoolean(values.get(PRIVACY_KEYS.localOnlyMode), PRIVACY_DEFAULTS.localOnlyMode),
        sessionPersistence: toBoolean(values.get(PRIVACY_KEYS.sessionPersistence), PRIVACY_DEFAULTS.sessionPersistence),
        autoDeleteOnClose: toBoolean(values.get(PRIVACY_KEYS.autoDeleteOnClose), PRIVACY_DEFAULTS.autoDeleteOnClose),
        tiPublicEnrichment: toBoolean(values.get(PRIVACY_KEYS.tiPublicEnrichment), PRIVACY_DEFAULTS.tiPublicEnrichment),
        aiCloudAssistance: toBoolean(values.get(PRIVACY_KEYS.aiCloudAssistance), PRIVACY_DEFAULTS.aiCloudAssistance),
        aiAllowCodeSnippets: toBoolean(values.get(PRIVACY_KEYS.aiAllowCodeSnippets), PRIVACY_DEFAULTS.aiAllowCodeSnippets),
        telemetryOptIn: toBoolean(values.get(PRIVACY_KEYS.telemetryOptIn), PRIVACY_DEFAULTS.telemetryOptIn),
    };
}

export function usePrivacySettings(): UsePrivacySettingsResult {
    const [isLoading, setIsLoading] = useState(true);

    const rows = useLiveQuery(async () => {
        const keys = Object.values(PRIVACY_KEYS);
        return db.settings.where('key').anyOf(keys).toArray();
    }, [], null);

    useEffect(() => {
        if (rows !== null) {
            setIsLoading(false);
        }
    }, [rows]);

    const valueMap = new Map((rows || []).map((row) => [row.key, row.value]));
    const snapshot = buildSnapshot(valueMap);
    const policy = resolveEffectivePrivacyPolicy(snapshot);

    const writeSetting = useCallback(async (key: string, value: boolean) => {
        await db.settings.put({ key, value });
    }, []);

    const setLocalOnlyMode = useCallback(async (enabled: boolean) => {
        await writeSetting(PRIVACY_KEYS.localOnlyMode, enabled);
    }, [writeSetting]);

    const setSessionPersistence = useCallback(async (enabled: boolean) => {
        await writeSetting(PRIVACY_KEYS.sessionPersistence, enabled);
    }, [writeSetting]);

    const setAutoDeleteOnClose = useCallback(async (enabled: boolean) => {
        await writeSetting(PRIVACY_KEYS.autoDeleteOnClose, enabled);
    }, [writeSetting]);

    const setTiPublicEnrichment = useCallback(async (enabled: boolean) => {
        await writeSetting(PRIVACY_KEYS.tiPublicEnrichment, enabled);
    }, [writeSetting]);

    const setAiCloudAssistance = useCallback(async (enabled: boolean) => {
        await writeSetting(PRIVACY_KEYS.aiCloudAssistance, enabled);
    }, [writeSetting]);

    const setAiAllowCodeSnippets = useCallback(async (enabled: boolean) => {
        await writeSetting(PRIVACY_KEYS.aiAllowCodeSnippets, enabled);
    }, [writeSetting]);

    const setTelemetryOptIn = useCallback(async (enabled: boolean) => {
        await writeSetting(PRIVACY_KEYS.telemetryOptIn, enabled);
    }, [writeSetting]);

    return {
        snapshot,
        policy,
        setLocalOnlyMode,
        setSessionPersistence,
        setAutoDeleteOnClose,
        setTiPublicEnrichment,
        setAiCloudAssistance,
        setAiAllowCodeSnippets,
        setTelemetryOptIn,
        isLoading,
    };
}
