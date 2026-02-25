'use client';

import { TopNav } from './TopNav';
import { LeftRail } from './LeftRail';

interface DashboardShellProps {
    children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
    return (
        <div className="min-h-screen bg-tertiary-50 dark:bg-gray-950 text-gray-900 dark:text-gray-50 font-sans selection:bg-primary-500/30">
            <div className="fixed inset-0 z-0 pointer-events-none">
                {/* Grid Pattern: Dark (white/5) / Light (black/5) */}
                <div className="absolute inset-0 bg-[size:24px_24px] 
                    bg-[linear-gradient(to_right,rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.05)_1px,transparent_1px)]
                    dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)]" />

                {/* Vignette/Gradient */}
                <div className="absolute inset-0 
                    bg-gradient-to-b from-tertiary-50 via-transparent to-tertiary-50/80
                    dark:bg-gradient-to-b dark:from-gray-950 dark:via-transparent dark:to-gray-950/80" />
            </div>

            <TopNav />
            <LeftRail />

            <main className="relative z-10 pl-14 pr-14 pt-10 min-h-screen flex flex-col">
                {children}
            </main>
        </div>
    );
}
