'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Home, Compass, Info, LayoutTemplate } from 'lucide-react';

export function TopNav() {
    return (
        <div className="fixed top-0 left-0 right-0 z-[100] h-[56px] border-b border-[var(--nav-border)] bg-[var(--nav-bg)] backdrop-blur-md">
            <div className="flex h-full items-center justify-between px-4 w-full">
                <Link href="/" className="inline-flex items-center gap-[0.62rem] text-[var(--nav-fg)] hover:opacity-80 transition-opacity">
                    <Image src="/ARGUS_Logo.png" alt="Argonaut" width={32} height={32} className="object-contain" />
                    <span className="text-[1.02rem] font-bold tracking-[0.11em] uppercase">Argonaut</span>
                </Link>
                <div className="flex flex-row items-center space-x-2 mr-2 md:space-x-4 md:mr-8 text-[var(--nav-fg)] text-sm tracking-widest font-mono">
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
                <div className="flex items-center gap-0">
                    <div className="h-[34px] px-[0.72rem] inline-flex items-center text-[0.66rem] font-mono font-semibold tracking-[0.08em] text-[var(--nav-muted)] opacity-50 uppercase leading-none">
                        v1.2.0-DEMO
                    </div>
                </div>
            </div>
        </div>
    );
}
