'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { Clock3, FolderOpen, Loader2, Trash2 } from 'lucide-react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { db } from '@/lib/db';
import { SessionService } from '@/lib/services/sessionService';
import { clearNavMemoryForSession, setLastActiveSessionId } from '@/lib/navigation/navMemory';

function formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleString(undefined, {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function stateBadgeClass(state: string): string {
    switch (state) {
        case 'READY':
            return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
        case 'FAILED':
            return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
        default:
            return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    }
}

export default function HistoryPage() {
    const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

    const sessions = useLiveQuery(
        async () => db.sessions.orderBy('timestamp').reverse().toArray(),
        [],
        undefined
    );
    const projects = useLiveQuery(async () => db.projects.toArray(), [], []);

    const groupedSessions = useMemo(() => {
        if (!sessions) return [];

        const projectNameById = new Map((projects || []).map((project) => [project.id, project.name]));
        const groups = new Map<string, { projectName: string; sessions: typeof sessions }>();

        for (const session of sessions) {
            const projectId = session.projectId || '__unassigned__';
            const projectName = session.projectId
                ? projectNameById.get(session.projectId) || 'Unassigned Project'
                : 'Unassigned Project';

            if (!groups.has(projectId)) {
                groups.set(projectId, { projectName, sessions: [] });
            }
            groups.get(projectId)!.sessions.push(session);
        }

        return Array.from(groups.entries()).map(([projectId, value]) => ({
            projectId,
            projectName: value.projectName,
            sessions: value.sessions,
        }));
    }, [projects, sessions]);

    const handleDeleteSession = async (sessionId: string, displayName: string) => {
        const confirmed = window.confirm(
            `Delete session "${displayName}"?\n\nThis will permanently remove the local session, findings, and related artifacts.`
        );
        if (!confirmed) return;

        try {
            setDeletingSessionId(sessionId);
            await SessionService.deleteSessionCascade(sessionId);
            clearNavMemoryForSession(sessionId);
        } catch (error) {
            console.error('Failed to delete session', error);
            window.alert('Failed to delete session. Please try again.');
        } finally {
            setDeletingSessionId(null);
        }
    };

    return (
        <DashboardShell>
            <div className="flex h-[calc(100vh-4rem)] flex-col gap-4 px-6 pb-8">
                <div className="pt-4">
                    <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Session History</h1>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Review previous sessions by project and jump back into triage quickly.
                    </p>
                </div>

                {!sessions && (
                    <div className="flex flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white/60 dark:border-white/10 dark:bg-gray-900/60">
                        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading local session history...
                        </div>
                    </div>
                )}

                {sessions && sessions.length === 0 && (
                    <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white/40 p-10 text-center dark:border-white/10 dark:bg-gray-900/40">
                        <div>
                            <p className="text-sm text-gray-600 dark:text-gray-300">No local sessions found yet.</p>
                            <Link
                                href="/drop"
                                className="mt-3 inline-flex items-center rounded-md border border-emerald-400 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-600 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                            >
                                Go to Drop Zone
                            </Link>
                        </div>
                    </div>
                )}

                {sessions && sessions.length > 0 && (
                    <div className="space-y-4 overflow-y-auto pb-20">
                        {groupedSessions.map((group) => (
                            <section
                                key={group.projectId}
                                className="rounded-xl border border-gray-200 bg-white/70 p-4 shadow-sm dark:border-white/10 dark:bg-gray-900/60"
                            >
                                <div className="mb-3 flex items-center gap-2 border-b border-gray-200 pb-2 dark:border-white/10">
                                    <FolderOpen className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{group.projectName}</h2>
                                </div>

                                <div className="space-y-2">
                                    {group.sessions.map((session) => (
                                        <div
                                            key={session.id}
                                            className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-gray-950/50"
                                        >
                                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${stateBadgeClass(session.state)}`}>
                                                {session.state}
                                            </span>

                                            <span className="font-mono text-xs text-gray-700 dark:text-gray-200">{session.filename}</span>

                                            <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                                Findings: <strong className="text-gray-700 dark:text-gray-200">{session.findingCount}</strong>
                                            </span>

                                            <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                                Tool: <strong className="text-gray-700 dark:text-gray-200">{session.tool}</strong>
                                            </span>

                                            <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                                                <Clock3 className="h-3.5 w-3.5" />
                                                {formatTimestamp(session.timestamp)}
                                            </span>

                                            <div className="ml-auto flex items-center gap-2">
                                                <Link
                                                    href={`/dashboard/${session.id}`}
                                                    onClick={() => setLastActiveSessionId(session.id)}
                                                    className="rounded border border-emerald-400 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-600 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                                                >
                                                    Open
                                                </Link>

                                                <button
                                                    onClick={() => handleDeleteSession(session.id, session.filename)}
                                                    disabled={deletingSessionId === session.id}
                                                    className="inline-flex items-center gap-1 rounded border border-red-300 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-700/60 dark:text-red-300 dark:hover:bg-red-500/10"
                                                >
                                                    {deletingSessionId === session.id ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    )}
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                )}
            </div>
        </DashboardShell>
    );
}
