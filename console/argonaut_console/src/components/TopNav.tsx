'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Home, Compass, Info, LayoutTemplate, Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import AskArgonautPanel from './AskArgonautPanel';

export function TopNav() {
    const [chatOpen, setChatOpen] = useState(false);
    const [hasPulsed, setHasPulsed] = useState(false);
    const pathname = usePathname();

    // Extract runId from URL if on a run page
    const runIdMatch = pathname?.match(/\/runs\/([a-f0-9]+)/);
    const runId = runIdMatch ? runIdMatch[1] : undefined;

    // Stop pulsing after first open (per session)
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const stored = sessionStorage.getItem('argonaut_chat_opened');
            if (stored) setHasPulsed(true);
        }
    }, []);

    const handleOpenChat = () => {
        setChatOpen(true);
        setHasPulsed(true);
        if (typeof window !== 'undefined') {
            sessionStorage.setItem('argonaut_chat_opened', 'true');
        }
    };

    return (
        <>
            <div className="fixed top-0 left-0 right-0 z-[100] h-[56px] border-b border-[var(--nav-border)] bg-[var(--nav-bg)] backdrop-blur-md">
                <div className="flex h-full items-center justify-between px-4 w-full">
                    <Link href="/" className="inline-flex items-center gap-[0.62rem] text-[var(--nav-fg)] hover:opacity-80 transition-opacity">
                        <Image src="/ARGUS_Logo.png" alt="Argonaut" width={32} height={32} className="object-contain" />
                        <span className="text-[1.02rem] font-bold tracking-[0.11em] uppercase">Argonaut</span>
                    </Link>
                    <div className="flex flex-row items-center space-x-2 mr-2 md:space-x-4 md:mr-4 text-[var(--nav-fg)] text-sm tracking-widest font-mono">
                        <Link href="/" className="hover:text-primary-400 transition-colors flex items-center space-x-1">
                            <Home size={16} /><span>CONSOLE</span>
                        </Link>
                        <Link href="/system" className="hover:text-primary-400 transition-colors flex items-center space-x-1">
                            <LayoutTemplate size={16} /><span>SYSTEM</span>
                        </Link>
                        <Link href="/journey" className="hover:text-primary-400 transition-colors flex items-center space-x-1">
                            <Compass size={16} /><span>USER JOURNEY</span>
                        </Link>
                        <Link href="/why" className="hover:text-primary-400 transition-colors flex items-center space-x-1">
                            <Info size={16} /><span>WHY</span>
                        </Link>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* ASK ARGONAUT Button */}
                        <button
                            onClick={handleOpenChat}
                            className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-[0.12em] transition-all duration-300 border shadow-lg active:scale-95 ${chatOpen
                                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-indigo-500/10'
                                    : 'bg-gradient-to-r from-indigo-500/10 to-purple-500/10 text-indigo-400 border-indigo-500/30 hover:from-indigo-500/20 hover:to-purple-500/20 hover:text-indigo-300 hover:border-indigo-500/50 shadow-indigo-500/5 hover:shadow-indigo-500/15'
                                }`}
                        >
                            <Sparkles className={`w-4 h-4 ${!hasPulsed ? 'animate-pulse' : ''}`} />
                            <span>ASK ARGONAUT</span>
                            {!hasPulsed && (
                                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                                </span>
                            )}
                        </button>

                        <div className="h-[34px] px-[0.72rem] inline-flex items-center text-[0.66rem] font-mono font-semibold tracking-[0.08em] text-[var(--nav-muted)] opacity-50 uppercase leading-none">
                            v1.2.0-DEMO
                        </div>
                    </div>
                </div>
            </div>

            {/* ASK ARGONAUT Chat Panel */}
            <AskArgonautPanel
                isOpen={chatOpen}
                onClose={() => setChatOpen(false)}
                runId={runId}
            />
        </>
    );
}
