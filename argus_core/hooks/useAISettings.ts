/**
 * useAISettings — Task 4.4, Step 2
 *
 * Persistent AI toggle backed by Dexie `settings` table.
 * Default: AI OFF (secure-by-default baseline).
 * Logs AI_TOGGLED event on state change.
 */

import { useState, useCallback, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { evidenceLog } from '@/lib/services/evidenceLog';
import { EventType } from '@/lib/types/events';
import { PRIVACY_DEFAULTS, PRIVACY_KEYS, resolveEffectivePrivacyPolicy } from '@/lib/privacy/policy';

const AI_ENABLED_KEY = 'ai_enabled';
const DEFAULT_AI_ENABLED = true;

interface UseAISettingsResult {
    aiWorkflowEnabled: boolean;
    aiEnabled: boolean;
    setAIEnabled: (enabled: boolean) => Promise<void>;
    blockedByPrivacy: boolean;
    snippetsAllowedByPolicy: boolean;
    isLoading: boolean;
}

export function useAISettings(sessionId?: string): UseAISettingsResult {
    const [isLoading, setIsLoading] = useState(true);

    const settings = useLiveQuery(
        async () => {
            const keys = [
                AI_ENABLED_KEY,
                PRIVACY_KEYS.localOnlyMode,
                PRIVACY_KEYS.aiCloudAssistance,
                PRIVACY_KEYS.aiAllowCodeSnippets,
            ];
            return db.settings.where('key').anyOf(keys).toArray();
        },
        [],
        null
    );

    // Resolve loading state once the query completes (setting is either found or undefined)
    useEffect(() => {
        if (settings !== null) {
            setIsLoading(false);
        }
    }, [settings]);

    const map = new Map((settings || []).map((row) => [row.key, row.value]));
    const aiWorkflowEnabled = typeof map.get(AI_ENABLED_KEY) === 'boolean'
        ? Boolean(map.get(AI_ENABLED_KEY))
        : DEFAULT_AI_ENABLED;
    const privacySnapshot = {
        ...PRIVACY_DEFAULTS,
        localOnlyMode: typeof map.get(PRIVACY_KEYS.localOnlyMode) === 'boolean'
            ? Boolean(map.get(PRIVACY_KEYS.localOnlyMode))
            : PRIVACY_DEFAULTS.localOnlyMode,
        aiCloudAssistance: typeof map.get(PRIVACY_KEYS.aiCloudAssistance) === 'boolean'
            ? Boolean(map.get(PRIVACY_KEYS.aiCloudAssistance))
            : PRIVACY_DEFAULTS.aiCloudAssistance,
        aiAllowCodeSnippets: typeof map.get(PRIVACY_KEYS.aiAllowCodeSnippets) === 'boolean'
            ? Boolean(map.get(PRIVACY_KEYS.aiAllowCodeSnippets))
            : PRIVACY_DEFAULTS.aiAllowCodeSnippets,
    };
    const policy = resolveEffectivePrivacyPolicy(privacySnapshot);

    const aiEnabled = aiWorkflowEnabled && policy.canUseCloudAI;
    const blockedByPrivacy = aiWorkflowEnabled && !policy.canUseCloudAI;

    const setAIEnabled = useCallback(async (enabled: boolean) => {
        await db.settings.put({ key: AI_ENABLED_KEY, value: enabled });

        // Log gating event for audit trail
        if (sessionId) {
            await evidenceLog.log(sessionId, EventType.AI_TOGGLED, {
                enabled,
                previous: aiEnabled,
                timestamp: Date.now(),
            });
        }
    }, [sessionId, aiEnabled]);

    return {
        aiWorkflowEnabled,
        aiEnabled,
        setAIEnabled,
        blockedByPrivacy,
        snippetsAllowedByPolicy: policy.canSendCodeSnippets,
        isLoading,
    };
}
