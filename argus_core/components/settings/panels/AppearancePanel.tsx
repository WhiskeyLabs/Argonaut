'use client';

import React, { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun, Gauge, Sparkles } from 'lucide-react';
import { useAppearanceSettings, type UiDensity } from '@/hooks/useAppearanceSettings';

type ThemeOption = 'system' | 'light' | 'dark';

const THEME_OPTIONS: Array<{ id: ThemeOption; label: string; icon: React.ElementType }> = [
    { id: 'system', label: 'System', icon: Monitor },
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
];

const DENSITY_OPTIONS: Array<{ id: UiDensity; label: string; detail: string }> = [
    { id: 'comfortable', label: 'Comfortable', detail: 'More spacing for readability' },
    { id: 'compact', label: 'Compact', detail: 'Denser rows for analysis-heavy sessions' },
];

export function AppearancePanel() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const { density, reducedMotion, setDensity, setReducedMotion, isLoading } = useAppearanceSettings();

    useEffect(() => setMounted(true), []);

    const activeTheme = (theme ?? 'system') as ThemeOption;

    return (
        <div className="space-y-5">
            <div className="rounded-xl border border-gray-200 dark:border-white/10">
                <div className="flex items-center gap-1.5 border-b border-gray-200 bg-gray-50/80 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-700 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-300">
                    <Sparkles className="h-3.5 w-3.5" />
                    Theme Mode
                </div>
                <div className="space-y-3 p-4">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Choose how Argus renders light and dark surfaces.
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                        {THEME_OPTIONS.map(({ id, label, icon: Icon }) => {
                            const selected = mounted && activeTheme === id;
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setTheme(id)}
                                    disabled={!mounted}
                                    className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${selected
                                        ? 'border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-500/40 dark:bg-primary-500/10 dark:text-primary-300'
                                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:bg-gray-900/40 dark:text-gray-300 dark:hover:bg-white/[0.04]'
                                        } ${!mounted ? 'cursor-not-allowed opacity-60' : ''}`}
                                >
                                    <span className="mb-1 flex items-center justify-center">
                                        <Icon className="h-3.5 w-3.5" />
                                    </span>
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-white/10">
                <div className="flex items-center gap-1.5 border-b border-gray-200 bg-gray-50/80 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-700 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-300">
                    <Gauge className="h-3.5 w-3.5" />
                    Density & Motion
                </div>
                <div className="space-y-4 p-4">
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-gray-800 dark:text-gray-200">Interface Density</p>
                        <div className="space-y-2">
                            {DENSITY_OPTIONS.map((option) => {
                                const selected = density === option.id;
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => setDensity(option.id)}
                                        disabled={isLoading}
                                        className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${selected
                                            ? 'border-primary-300 bg-primary-50 dark:border-primary-500/40 dark:bg-primary-500/10'
                                            : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-white/10 dark:bg-gray-900/40 dark:hover:bg-white/[0.04]'
                                            } ${isLoading ? 'cursor-not-allowed opacity-60' : ''}`}
                                    >
                                        <p className="text-xs font-medium text-gray-800 dark:text-gray-100">{option.label}</p>
                                        <p className="text-[11px] text-gray-500 dark:text-gray-400">{option.detail}</p>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.02]">
                        <div>
                            <p className="text-xs font-medium text-gray-800 dark:text-gray-200">Reduce Motion</p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                Tone down motion in supported UI surfaces.
                            </p>
                        </div>
                        <button
                            onClick={() => setReducedMotion(!reducedMotion)}
                            disabled={isLoading}
                            className={`relative h-5 w-10 shrink-0 rounded-full transition-all ${reducedMotion ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-700'
                                } ${isLoading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                            title={reducedMotion ? 'Disable reduced motion' : 'Enable reduced motion'}
                        >
                            <div
                                className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all"
                                style={{ left: reducedMotion ? '22px' : '2px' }}
                            />
                        </button>
                    </div>

                    <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-400">
                        Preferences persist locally and are applied on supported screens.
                    </p>
                </div>
            </div>
        </div>
    );
}

