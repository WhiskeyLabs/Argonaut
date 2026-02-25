'use client';

import React from 'react';
import { Settings, ShieldAlert } from 'lucide-react';
import { useAISettings } from '@/hooks/useAISettings';
import { useThreatIntelSettings } from '@/hooks/useThreatIntelSettings';

interface GlobalSettingsToolbarProps {
    sessionId?: string;
    className?: string;
}

/**
 * GlobalSettingsToolbar - Centralized controls for AI and Threat Intel.
 * Used on Dashboard, Drop page, and Research view to ensure consistent gating state.
 */
export function GlobalSettingsToolbar({ sessionId, className = '' }: GlobalSettingsToolbarProps) {
    const { aiEnabled, setAIEnabled, isLoading: aiLoading } = useAISettings(sessionId);
    const { tiEnabled, setTIEnabled, isLoading: tiLoading } = useThreatIntelSettings(sessionId);

    return (
        <div className={`flex items-center p-1 bg-gray-100 dark:bg-white/5 rounded-xl border border-gray-200/50 dark:border-white/5 shadow-inner ${className}`}>
            {/* AI Toggle */}
            <div className="flex items-center px-2 py-1 gap-2">
                <Settings className={`h-3.5 w-3.5 ${aiEnabled ? 'text-emerald-500' : 'text-gray-400'}`} />
                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 hidden sm:inline uppercase tracking-tight">AI</span>
                <button
                    onClick={() => setAIEnabled(!aiEnabled)}
                    disabled={aiLoading}
                    className={`w-7 h-4 rounded-full transition-all relative ${aiEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-700'} ${aiLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={aiEnabled ? "Disable AI Analysis" : "Enable AI Analysis"}
                >
                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-all`} style={{ left: aiEnabled ? '14px' : '2px' }} />
                </button>
            </div>

            <div className="w-px h-4 bg-gray-300 dark:bg-white/10 mx-1" />

            {/* TI Toggle */}
            <div className="flex items-center px-2 py-1 gap-2">
                <ShieldAlert className={`h-3.5 w-3.5 ${tiEnabled ? 'text-emerald-500' : 'text-gray-400'}`} />
                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 hidden sm:inline uppercase tracking-tight">TI</span>
                <button
                    onClick={() => setTIEnabled(!tiEnabled)}
                    disabled={tiLoading}
                    className={`w-7 h-4 rounded-full transition-all relative ${tiEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-700'} ${tiLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={tiEnabled ? "Disable Threat Intel Feed" : "Enable Threat Intel Feed"}
                >
                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-all`} style={{ left: tiEnabled ? '14px' : '2px' }} />
                </button>
            </div>
        </div>
    );
}
