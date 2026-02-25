'use client';

import { use, useEffect } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { FunnelStepper } from '@/components/dashboard/FunnelStepper';
import { BottomHud } from '@/components/dashboard/BottomHud';
import { FindingsView } from '@/components/grid/FindingsView';

interface PageProps {
    params: Promise<{ sessionId: string }>;
}

import { db } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { setLastActiveSessionId } from '@/lib/navigation/navMemory';

export default function DashboardPage({ params }: PageProps) {
    const { sessionId } = use(params);

    useEffect(() => {
        setLastActiveSessionId(sessionId);
    }, [sessionId]);

    // Dynamic Project Name
    const sessionDetails = useLiveQuery(async () => {
        const session = await db.sessions.get(sessionId);
        if (!session?.projectId) return null;
        const project = await db.projects.get(session.projectId);
        return { projectName: project?.name };
    }, [sessionId]);

    const projectName = sessionDetails?.projectName || 'Unknown Project';

    return (
        <DashboardShell>
            <div className="flex flex-col h-[calc(100vh-4rem)] px-6 pb-6 gap-4">
                {/* Header */}
                <div className="flex-none flex items-center gap-4">
                    <h1 className="font-display text-lg font-semibold tracking-wide text-gray-900 dark:text-gray-100 uppercase">
                        Reachability Analysis Dashboard
                    </h1>
                    <span className="rounded-full border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-white/5 px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                        Project: {projectName}
                    </span>
                    <span className="rounded-full border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-white/5 px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                        Scope: Production
                    </span>
                    <span className="rounded-full border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-white/5 px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                        Last Scan: 2m ago
                    </span>
                </div>

                {/* Funnel - now with sessionId */}
                <div className="flex-none">
                    <FunnelStepper sessionId={sessionId} />
                </div>

                {/* Main Grid Area */}
                <div className="flex-1 min-h-0 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-sm overflow-hidden">
                    <FindingsView sessionId={sessionId} />
                </div>

                {/* Bottom HUD */}
                <BottomHud sessionId={sessionId} />
            </div>
        </DashboardShell>
    );
}
