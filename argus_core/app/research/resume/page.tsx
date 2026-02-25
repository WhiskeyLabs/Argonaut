'use client';

import { useEffect } from 'react';
import Dexie from 'dexie';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import {
    LastResearchContext,
    clearLastResearchContext,
    clearLastResearchContextForSession,
    getLastActiveSessionId,
    getLastResearchContext,
    getLastResearchContextForSession,
    setLastActiveSessionId,
    setLastResearchContext,
} from '@/lib/navigation/navMemory';

async function getLatestReadySessionId(): Promise<string | null> {
    try {
        const latestReady = await db.sessions
            .where('[state+timestamp]')
            .between(['READY', Dexie.minKey], ['READY', Dexie.maxKey])
            .reverse()
            .first();
        return latestReady?.id ?? null;
    } catch {
        const sessions = await db.sessions.toArray();
        const latestReady = sessions
            .filter((session) => session.state === 'READY')
            .sort((a, b) => b.timestamp - a.timestamp)[0];
        return latestReady?.id ?? null;
    }
}

async function resolveContext(context: LastResearchContext): Promise<LastResearchContext | null> {
    const [session, finding] = await Promise.all([
        db.sessions.get(context.sessionId),
        db.findings.get(context.findingId),
    ]);

    if (!session || session.state !== 'READY') return null;
    if (!finding || finding.sessionId !== context.sessionId) return null;
    return context;
}

export default function ResumeResearchPage() {
    const router = useRouter();

    useEffect(() => {
        let cancelled = false;

        async function resolveResearchTarget() {
            const lastContext = getLastResearchContext();
            if (lastContext) {
                const resolved = await resolveContext(lastContext);
                if (!cancelled && resolved) {
                    setLastActiveSessionId(resolved.sessionId);
                    setLastResearchContext(resolved.sessionId, resolved.findingId);
                    router.replace(`/research/${resolved.sessionId}/${resolved.findingId}`);
                    return;
                }
                clearLastResearchContext();
            }

            const activeSessionId = getLastActiveSessionId();
            if (activeSessionId) {
                const sessionContext = getLastResearchContextForSession(activeSessionId);
                if (sessionContext) {
                    const resolved = await resolveContext(sessionContext);
                    if (!cancelled && resolved) {
                        setLastActiveSessionId(resolved.sessionId);
                        setLastResearchContext(resolved.sessionId, resolved.findingId);
                        router.replace(`/research/${resolved.sessionId}/${resolved.findingId}`);
                        return;
                    }
                    clearLastResearchContextForSession(activeSessionId);
                }

                const activeSession = await db.sessions.get(activeSessionId);
                if (!cancelled && activeSession?.state === 'READY') {
                    router.replace(`/dashboard/${activeSessionId}?notice=research_unavailable`);
                    return;
                }
            }

            const fallbackSessionId = await getLatestReadySessionId();
            if (!cancelled && fallbackSessionId) {
                setLastActiveSessionId(fallbackSessionId);
                router.replace(`/dashboard/${fallbackSessionId}?notice=research_unavailable`);
                return;
            }

            if (!cancelled) {
                router.replace('/drop?empty=1');
            }
        }

        resolveResearchTarget();

        return () => {
            cancelled = true;
        };
    }, [router]);

    return (
        <div className="flex h-screen items-center justify-center px-6">
            <p className="text-sm text-gray-500 dark:text-gray-400">Resolving research context...</p>
        </div>
    );
}
