'use client';

import { db } from '@/lib/db';

export const PRIVACY_KEYS = {
    localOnlyMode: 'privacy.local_only_mode',
    sessionPersistence: 'privacy.session_persistence',
    autoDeleteOnClose: 'privacy.auto_delete_on_close',
    tiPublicEnrichment: 'privacy.ti_public_enrichment',
    aiCloudAssistance: 'privacy.ai_cloud_assistance',
    aiAllowCodeSnippets: 'privacy.ai_allow_code_snippets',
    telemetryOptIn: 'privacy.telemetry_opt_in',
} as const;

export type PrivacyKey = typeof PRIVACY_KEYS[keyof typeof PRIVACY_KEYS];

export interface PrivacySettingsSnapshot {
    localOnlyMode: boolean;
    sessionPersistence: boolean;
    autoDeleteOnClose: boolean;
    tiPublicEnrichment: boolean;
    aiCloudAssistance: boolean;
    aiAllowCodeSnippets: boolean;
    telemetryOptIn: boolean;
}

export type PrivacyMode = 'LOCAL_ONLY' | 'ALLOWLISTED_ENRICHMENT' | 'EXTENDED_INTELLIGENCE';

export interface EffectivePrivacyPolicy {
    mode: PrivacyMode;
    snapshot: PrivacySettingsSnapshot;
    canUseThreatIntel: boolean;
    canUseCloudAI: boolean;
    canSendCodeSnippets: boolean;
    canUseTelemetry: boolean;
    shouldAutoDeleteOnClose: boolean;
}

export const PRIVACY_DEFAULTS: PrivacySettingsSnapshot = {
    localOnlyMode: false,
    sessionPersistence: true,
    autoDeleteOnClose: false,
    tiPublicEnrichment: true,
    aiCloudAssistance: true,
    aiAllowCodeSnippets: true,
    telemetryOptIn: true,
};

export function resolveEffectivePrivacyPolicy(
    snapshot: PrivacySettingsSnapshot
): EffectivePrivacyPolicy {
    const localOnlyMode = snapshot.localOnlyMode;
    const canUseThreatIntel = !localOnlyMode && snapshot.tiPublicEnrichment;
    const canUseCloudAI = !localOnlyMode && snapshot.aiCloudAssistance;
    const canSendCodeSnippets = canUseCloudAI && snapshot.aiAllowCodeSnippets;
    const canUseTelemetry = !localOnlyMode && snapshot.telemetryOptIn;
    const shouldAutoDeleteOnClose = snapshot.autoDeleteOnClose || !snapshot.sessionPersistence;

    const mode: PrivacyMode = localOnlyMode
        ? 'LOCAL_ONLY'
        : canUseCloudAI
            ? 'EXTENDED_INTELLIGENCE'
            : 'ALLOWLISTED_ENRICHMENT';

    return {
        mode,
        snapshot,
        canUseThreatIntel,
        canUseCloudAI,
        canSendCodeSnippets,
        canUseTelemetry,
        shouldAutoDeleteOnClose,
    };
}

function toBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

export async function getPrivacySettingsSnapshotFromDb(): Promise<PrivacySettingsSnapshot> {
    const keys = Object.values(PRIVACY_KEYS);
    const rows = await db.settings.where('key').anyOf(keys).toArray();
    const map = new Map(rows.map((row) => [row.key, row.value]));

    return {
        localOnlyMode: toBoolean(map.get(PRIVACY_KEYS.localOnlyMode), PRIVACY_DEFAULTS.localOnlyMode),
        sessionPersistence: toBoolean(map.get(PRIVACY_KEYS.sessionPersistence), PRIVACY_DEFAULTS.sessionPersistence),
        autoDeleteOnClose: toBoolean(map.get(PRIVACY_KEYS.autoDeleteOnClose), PRIVACY_DEFAULTS.autoDeleteOnClose),
        tiPublicEnrichment: toBoolean(map.get(PRIVACY_KEYS.tiPublicEnrichment), PRIVACY_DEFAULTS.tiPublicEnrichment),
        aiCloudAssistance: toBoolean(map.get(PRIVACY_KEYS.aiCloudAssistance), PRIVACY_DEFAULTS.aiCloudAssistance),
        aiAllowCodeSnippets: toBoolean(map.get(PRIVACY_KEYS.aiAllowCodeSnippets), PRIVACY_DEFAULTS.aiAllowCodeSnippets),
        telemetryOptIn: toBoolean(map.get(PRIVACY_KEYS.telemetryOptIn), PRIVACY_DEFAULTS.telemetryOptIn),
    };
}

export async function getEffectivePrivacyPolicyFromDb(): Promise<EffectivePrivacyPolicy> {
    const snapshot = await getPrivacySettingsSnapshotFromDb();
    return resolveEffectivePrivacyPolicy(snapshot);
}
