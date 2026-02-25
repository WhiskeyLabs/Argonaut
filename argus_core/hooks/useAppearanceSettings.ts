'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';

const DENSITY_KEY = 'ui_density';
const REDUCED_MOTION_KEY = 'ui_reduced_motion';

export type UiDensity = 'comfortable' | 'compact';

interface UseAppearanceSettingsResult {
    density: UiDensity;
    reducedMotion: boolean;
    setDensity: (density: UiDensity) => Promise<void>;
    setReducedMotion: (enabled: boolean) => Promise<void>;
    isLoading: boolean;
}

export function useAppearanceSettings(): UseAppearanceSettingsResult {
    const [isLoading, setIsLoading] = useState(true);

    const densitySetting = useLiveQuery(
        () => db.settings.get(DENSITY_KEY),
        [],
        null
    );
    const motionSetting = useLiveQuery(
        () => db.settings.get(REDUCED_MOTION_KEY),
        [],
        null
    );

    useEffect(() => {
        if (densitySetting !== null && motionSetting !== null) {
            setIsLoading(false);
        }
    }, [densitySetting, motionSetting]);

    const density: UiDensity = densitySetting?.value === 'compact' ? 'compact' : 'comfortable';
    const reducedMotion = Boolean(motionSetting?.value ?? false);

    const setDensity = useCallback(async (nextDensity: UiDensity) => {
        await db.settings.put({ key: DENSITY_KEY, value: nextDensity });
    }, []);

    const setReducedMotion = useCallback(async (enabled: boolean) => {
        await db.settings.put({ key: REDUCED_MOTION_KEY, value: enabled });
    }, []);

    return {
        density,
        reducedMotion,
        setDensity,
        setReducedMotion,
        isLoading,
    };
}

