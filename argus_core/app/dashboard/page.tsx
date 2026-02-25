'use client';

import { useEffect } from 'react';
import Dexie from 'dexie';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import {
    clearLastActiveSessionId,
    getLastActiveSessionId,
    setLastActiveSessionId,
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
        // Older local DBs might not have upgraded indexes yet; fallback is still deterministic.
        const sessions = await db.sessions.toArray();
        const latestReady = sessions
            .filter((session) => session.state === 'READY')
            .sort((a, b) => b.timestamp - a.timestamp)[0];
        return latestReady?.id ?? null;
    }
}

export default function DashboardResolverPage() {
    const router = useRouter();

    useEffect(() => {
        let cancelled = false;

        async function resolveDashboardSession() {
            const fromMemory = getLastActiveSessionId();
            if (fromMemory) {
                const session = await db.sessions.get(fromMemory);
                if (!cancelled && session?.state === 'READY') {
                    setLastActiveSessionId(session.id);
                    router.replace(`/dashboard/${session.id}`);
                    return;
                }
                clearLastActiveSessionId();
            }

            const fallbackSessionId = await getLatestReadySessionId();
            if (!cancelled && fallbackSessionId) {
                setLastActiveSessionId(fallbackSessionId);
                router.replace(`/dashboard/${fallbackSessionId}`);
                return;
            }

            if (!cancelled) {
                router.replace('/drop?empty=1');
            }
        }

        resolveDashboardSession();

        return () => {
            cancelled = true;
        };
    }, [router]);

    return (
        <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center px-6">
            <p className="text-sm text-gray-500 dark:text-gray-400">Resolving latest dashboard session...</p>
        </div>
    );
}
