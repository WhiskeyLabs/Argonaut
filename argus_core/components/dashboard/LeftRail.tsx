'use client';

import { useEffect, useState } from 'react';
import {
    KanbanSquare,
    Settings,
    PlusCircle,
    ChartNetwork,
    GitGraph,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { db } from '@/lib/db';
import {
    clearLastResearchContext,
    clearLastResearchContextForSession,
    getLastActiveSessionId,
    getLastResearchContext,
    getLastResearchContextForSession,
} from '@/lib/navigation/navMemory';

const baseNavItems = [
    { id: 'new-scan', icon: PlusCircle, label: 'New Scan', href: '/drop' },
    { id: 'dashboard', icon: KanbanSquare, label: 'Dashboard', href: '/dashboard' },
    { id: 'history', icon: ChartNetwork, label: 'History', href: '/history' },
] as const;

export function LeftRail() {
    const pathname = usePathname();
    const [canResumeResearch, setCanResumeResearch] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function evaluateResearchResume() {
            const globalContext = getLastResearchContext();
            const activeSessionId = getLastActiveSessionId();
            const sessionContext = activeSessionId
                ? getLastResearchContextForSession(activeSessionId)
                : null;

            const candidates = [globalContext, sessionContext].filter(Boolean) as Array<{
                sessionId: string;
                findingId: string;
            }>;

            for (const candidate of candidates) {
                const [session, finding] = await Promise.all([
                    db.sessions.get(candidate.sessionId),
                    db.findings.get(candidate.findingId),
                ]);

                const valid = Boolean(session?.state === 'READY' && finding?.sessionId === candidate.sessionId);
                if (valid) {
                    if (!cancelled) setCanResumeResearch(true);
                    return;
                }

                if (
                    globalContext &&
                    globalContext.sessionId === candidate.sessionId &&
                    globalContext.findingId === candidate.findingId
                ) {
                    clearLastResearchContext();
                }
                clearLastResearchContextForSession(candidate.sessionId);
            }

            if (!cancelled) setCanResumeResearch(false);
        }

        evaluateResearchResume();

        const onStorage = () => evaluateResearchResume();
        window.addEventListener('storage', onStorage);
        return () => {
            cancelled = true;
            window.removeEventListener('storage', onStorage);
        };
    }, [pathname]);

    const navItems = [
        ...baseNavItems,
        { id: 'research', icon: GitGraph, label: 'Research', href: '/research/resume', disabled: !canResumeResearch },
    ];

    return (
        <aside className="fixed bottom-0 left-0 top-14 z-40 flex w-14 flex-col items-center border-r border-gray-200 bg-white/80 py-4 backdrop-blur-md transition-colors dark:border-white/5 dark:bg-gray-950/80">
            <nav className="flex flex-1 flex-col items-center gap-4">
                {navItems.map((item) => {
                    const isActive = item.id === 'dashboard'
                        ? (pathname?.startsWith('/dashboard') || pathname?.startsWith('/grid-test'))
                        : item.id === 'research'
                            ? pathname?.startsWith('/research/') ?? false
                            : pathname === item.href;

                    const baseClass = `group relative flex h-9 w-9 items-center justify-center rounded-lg transition-all ${isActive
                        ? 'bg-primary-500/10 text-primary-600 dark:text-primary-500 shadow-[0_0_12px_rgba(226,59,46,0.2)] ring-1 ring-primary-500/50'
                        : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-gray-300'
                        }`;

                    if (item.disabled) {
                        return (
                            <div
                                key={item.label}
                                className="group relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-300 dark:text-gray-700"
                                aria-disabled
                            >
                                <item.icon className="h-5 w-5 stroke-2" />
                                <span className="absolute left-[calc(100%+8px)] z-50 hidden whitespace-nowrap rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-xl group-hover:block dark:border-white/10 dark:bg-gray-900 dark:text-gray-300">
                                    Open a finding first
                                </span>
                            </div>
                        );
                    }

                    return (
                        <Link
                            key={item.label}
                            href={item.href}
                            className={baseClass}
                        >
                            <item.icon className={`h-5 w-5 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />

                            <span className="absolute left-[calc(100%+8px)] z-50 hidden whitespace-nowrap rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-900 shadow-xl group-hover:block dark:border-white/10 dark:bg-gray-900 dark:text-white">
                                {item.label}
                            </span>

                            {isActive && (
                                <span className="absolute -left-[17px] top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-primary-500" />
                            )}
                        </Link>
                    );
                })}
            </nav>

            <div className="mt-auto flex flex-col gap-4">
                <button className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/5 dark:hover:text-gray-300">
                    <Settings className="h-5 w-5" />
                </button>
            </div>
        </aside>
    );
}
