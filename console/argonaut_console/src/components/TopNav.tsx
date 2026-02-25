'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Home, Compass, Info, LayoutTemplate } from 'lucide-react';
import { useEffect, useState } from 'react';

export function TopNav() {
    const [theme, setTheme] = useState('dark');

    useEffect(() => {
        const isLight = document.documentElement.classList.contains('light');
        setTheme(isLight ? 'light' : 'dark');
    }, []);

    const toggleTheme = () => {
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        if (newTheme === 'light') {
            document.documentElement.classList.remove('dark');
            document.documentElement.classList.add('light');
        } else {
            document.documentElement.classList.remove('light');
            document.documentElement.classList.add('dark');
        }
        setTheme(newTheme);
    };

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
                        <Compass size={16} /><span>JOURNEY</span>
                    </Link>
                    <Link href="/why" className="hover:text-primary-400 transition-colors flex items-center space-x-1">
                        <Info size={16} /><span>WHY</span>
                    </Link>
                </div>
                <div className="flex items-center gap-0">
                    <button
                        onClick={toggleTheme}
                        className="border border-[var(--nav-border)] bg-transparent text-[var(--nav-muted)] h-[34px] rounded-full inline-flex items-center justify-center gap-[0.38rem] px-[0.72rem] cursor-pointer hover:text-[var(--nav-fg)] hover:bg-[var(--nav-hover)] hover:-translate-y-[1px] transition-all uppercase font-mono text-[0.66rem] tracking-[0.08em] font-semibold"
                    >
                        <span className="leading-none">{theme === 'dark' ? 'LIGHT' : 'DARK'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
