'use client';
import { Activity, ShieldCheck, History, Loader2, Link as LinkIcon, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useSessionMetrics } from '@/hooks/useSessionMetrics';
import { useSessionAudit, AuditLogItem } from '@/hooks/useSessionAudit';
import { useState, useEffect, useRef } from 'react';
import { EventType } from '@/lib/types/events';

import { threatIntelService } from '@/lib/services/threatIntelService';
import { ThreatIntel } from '@/lib/types/threat';
import { useThreatTicker } from '@/hooks/useThreatTicker';
import { useThreatIntelSettings } from '@/hooks/useThreatIntelSettings';
import { RefreshCw, Clock, ShieldOff } from 'lucide-react';
import { format } from 'date-fns';

function ThemeTicker() {
    const { threats, status, isLoading, isDegraded, isError, isEmpty, refresh, lastUpdated } = useThreatTicker();
    const { tiEnabled } = useThreatIntelSettings();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isPaused, setIsPaused] = useState(false);
    const [autoScrollActive, setAutoScrollActive] = useState(true);

    // Teleprompter Logic
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || isEmpty || isPaused || !autoScrollActive || !tiEnabled) return;

        // ... (keep existing animation logic)
    }, [isPaused, autoScrollActive, isEmpty, tiEnabled]);

    // Reset on Mouse Leave
    const handleMouseLeave = () => {
        setIsPaused(false);
        if (scrollRef.current && tiEnabled) {
            scrollRef.current.scrollTop = 0;
            setAutoScrollActive(true);
        }
    };

    // Status Badge Logic
    let badge = null;

    if (!tiEnabled) {
        badge = (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-50 dark:bg-white/5 text-gray-400 text-[10px] font-bold tracking-wide border border-gray-200 dark:border-white/10">
                DISABLED
            </div>
        );
    } else if (isLoading && isEmpty) {
        badge = (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] font-bold tracking-wide">
                <Loader2 className="h-3 w-3 animate-spin" />
                UPDATING
            </div>
        );
    } else if (isError && isEmpty) {
        badge = (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-[10px] font-bold tracking-wide">
                <AlertCircle className="h-3 w-3" />
                OFFLINE
            </div>
        );
    } else if (isDegraded) {
        badge = (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-[10px] font-bold tracking-wide border border-amber-200 dark:border-amber-800">
                <AlertCircle className="h-3 w-3" />
                CACHED
            </div>
        );
    } else {
        // Normal / Live
        badge = (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-[10px] font-bold tracking-wide">
                <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                LIVE
            </div>
        );
    }

    return (
        <div
            className={`flex flex-col justify-between h-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-950 shadow-sm p-3 ring-1 ring-black/5 overflow-hidden transition-all duration-300 ${!tiEnabled ? 'opacity-75 grayscale-[0.5]' : ''}`}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={handleMouseLeave}
        >
            <div className="flex items-center justify-between mb-2 shrink-0">
                <div className="flex items-center gap-2">
                    {tiEnabled ? (
                        <ShieldCheck className="h-4 w-4 text-red-500" />
                    ) : (
                        <ShieldOff className="h-4 w-4 text-gray-400" />
                    )}
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Threat Ticker</span>
                    {/* Health Dot */}
                    {tiEnabled && (
                        <div
                            className={`w-1.5 h-1.5 rounded-full ${isLoading && !isEmpty ? 'bg-blue-400 animate-pulse' :
                                isError ? 'bg-red-500' :
                                    isDegraded ? 'bg-amber-500' :
                                        'bg-emerald-500'}`}
                            title={isLoading ? 'Updating...' : isError ? 'Offline' : isDegraded ? 'Using Cached Data' : 'Live & Fresh'}
                        />
                    )}
                </div>
                <div className="flex items-center gap-3">
                    {/* Last Updated Timestamp */}
                    {tiEnabled && lastUpdated && !isLoading && (
                        <div className="flex items-center gap-1 text-[10px] text-gray-400 italic font-medium">
                            <span>Last Updated: {format(lastUpdated, "MMM d, h:mm a")}</span>
                        </div>
                    )}
                    {badge}
                </div>
            </div>

            <div className="relative flex-1 min-h-0 overflow-hidden group">
                {!tiEnabled ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-center py-2">
                        <div className="p-2 bg-gray-50 dark:bg-white/5 rounded-full border border-gray-200/50 dark:border-white/5">
                            <ShieldOff className="h-5 w-5 text-gray-300 dark:text-gray-600" />
                        </div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Threat Intel Disabled</p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-500 max-w-[180px]">Enable TI settings for live ecosystem threat feeds.</p>
                    </div>
                ) : (
                    <div
                        ref={scrollRef}
                        className="h-full overflow-y-auto scroll-smooth pr-1 styled-scrollbar"
                    >
                        <style jsx global>{`
                            .styled-scrollbar::-webkit-scrollbar {
                                width: 6px;
                                background-color: transparent;
                            }
                            .styled-scrollbar::-webkit-scrollbar-thumb {
                                background-color: #e2e8f0; /* gray-200 */
                                border-radius: 9999px;
                                border: 2px solid transparent;
                                background-clip: content-box;
                            }
                            .dark .styled-scrollbar::-webkit-scrollbar-thumb {
                                background-color: #374151; /* gray-700 */
                            }
                        `}</style>

                        {/* Empty / Initial State */}
                        {isEmpty && isLoading && (
                            <div className="flex flex-col gap-2 animate-pulse h-full pt-1">
                                <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-3/4"></div>
                                <div className="h-3 bg-gray-100 dark:bg-gray-900 rounded w-1/2"></div>
                                <div className="h-3 bg-gray-100 dark:bg-gray-900 rounded w-1/3 mt-1"></div>
                            </div>
                        )}

                        {/* Error Logic */}
                        {isError && isEmpty && (
                            <div className="flex flex-col gap-1 items-start h-full pt-1">
                                <p className="text-xs text-red-500 font-medium">Threat feed unavailable.</p>
                                <button
                                    onClick={() => refresh()}
                                    className="text-[10px] text-gray-500 hover:text-gray-900 dark:hover:text-white underline flex items-center gap-1"
                                >
                                    <RefreshCw className="h-3 w-3" /> Retry Connection
                                </button>
                            </div>
                        )}

                        {/* Content Logic - List */}
                        {!isEmpty && threats && threats.map((threat, idx) => (
                            <div key={`${threat.cveId}-${idx}`} className="flex flex-col justify-start py-2 gap-1 border-b border-gray-100 dark:border-white/5 last:border-0 min-h-[5rem]">
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate pr-2" title={threat.name || threat.cveId}>
                                    {threat.name || threat.cveId}
                                </p>
                                <div className="space-y-0.5">
                                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1.5 line-clamp-3 leading-relaxed" title={threat.description || 'Active Exploitation Confirmed'}>
                                        <span className={`mt-1.5 w-1 h-1 rounded-full shrink-0 ${isDegraded ? 'bg-amber-500' : 'bg-red-500'}`} />
                                        {threat.description || 'Active Exploitation Confirmed'}
                                    </p>
                                </div>
                            </div>
                        ))}

                        {/* Fallback for empty state */}
                        {!isLoading && !isError && isEmpty && (
                            <div className="text-xs text-gray-400 italic">
                                No active campaigns detected.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function SessionAudit({ sessionId }: { sessionId?: string }) {
    const logs = useSessionAudit(sessionId);
    const bottomRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on new logs
    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    return (
        <div className="flex flex-col h-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#111827] shadow-sm p-3 ring-1 ring-black/5 overflow-hidden">
            <div className="flex items-center justify-between mb-2 shrink-0">
                <div className="flex items-center gap-2">
                    <History className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Session Audit</span>
                </div>
                <span className="text-[10px] text-gray-500 font-mono">
                    {logs.length > 0 ? 'LIVE' : 'WAITING'}
                </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 min-h-0 pr-1 custom-scrollbar">
                {logs.length === 0 && (
                    <div className="text-xs text-gray-400 dark:text-gray-600 italic text-center mt-4">Waiting for events...</div>
                )}

                {logs.map((log, i) => {
                    const isLatest = i === logs.length - 1;
                    const isError = log.isError;
                    const isMilestone = log.milestone;

                    return (
                        <div key={log.id} className="relative pl-3 text-xs group">
                            {/* Timeline Line */}
                            {i !== logs.length - 1 && (
                                <div className="absolute left-[3.5px] top-2 bottom-[-12px] w-[1px] bg-gray-200 dark:bg-gray-800" />
                            )}

                            {/* Timeline Dot */}
                            <div className={`absolute left-0 top-1.5 w-2 h-2 rounded-full border border-white dark:border-[#111827] z-10 
                                ${isError ? 'bg-red-500' : isLatest ? 'bg-blue-500' : isMilestone ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                            />

                            <div className="flex justify-between items-start gap-2">
                                <span className={`leading-relaxed break-words ${isLatest ? 'text-gray-900 dark:text-gray-200 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                                    {log.message}
                                    {log.count && log.count > 1 && (
                                        <span className="ml-1.5 inline-flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-[9px] px-1.5 py-0 rounded-full font-mono">
                                            x{log.count}
                                        </span>
                                    )}
                                </span>
                                <span className="text-[10px] text-gray-600 font-mono whitespace-nowrap shrink-0 mt-0.5">
                                    {new Date(log.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>
                    );
                })}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}

interface BottomHudProps {
    sessionId?: string;
}

export function BottomHud({ sessionId }: BottomHudProps) {
    const metrics = useSessionMetrics(sessionId);

    return (
        <div className="w-full">
            {/* The HUD Row - Matches Grid Width automatically due to flex parent padding. Force height constraint. */}
            <div className="grid grid-cols-3 gap-4 overflow-hidden" style={{ height: '152px', maxHeight: '152px' }}>
                {/* 1. Toil Meter */}
                <div className="flex flex-col justify-between h-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-950 shadow-sm p-3 ring-1 ring-black/5 overflow-hidden">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Activity className="h-4 w-4 text-emerald-500" />
                            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Noise Reduction</span>
                        </div>
                    </div>
                    <div>
                        <div className="text-3xl font-display font-bold text-gray-900 dark:text-white tracking-tight">
                            {metrics.noiseReduction.percent}%
                        </div>
                        <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mt-1">
                            {metrics.noiseReduction.count} false positives filtered
                        </div>
                    </div>
                </div>

                {/* 2. Threat Ticker */}
                <ThemeTicker />

                {/* 3. Session Audit Log (Replacing Dependency-Linked) */}
                <SessionAudit sessionId={sessionId} />
            </div>
        </div>
    );
}
