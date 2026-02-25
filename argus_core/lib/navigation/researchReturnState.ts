import type { FindingsFilter, FindingsSort } from '@/hooks/useFindingsQuery';

const STORAGE_PREFIX = 'argus.research.return-state.';
const MAX_STORED_STATES = 20;

export interface DashboardReturnState {
    sessionId: string;
    filter: FindingsFilter;
    sort: FindingsSort;
    collapsedGroups: string[];
    scrollTop: number;
    savedAt: number;
}

function hasSessionStorage(): boolean {
    return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function pruneOldStates() {
    if (!hasSessionStorage()) return;

    const keys: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
        const key = window.sessionStorage.key(i);
        if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
    }

    if (keys.length <= MAX_STORED_STATES) return;

    const entries = keys
        .map((key) => {
            const raw = window.sessionStorage.getItem(key);
            let savedAt = 0;
            if (raw) {
                try {
                    const parsed = JSON.parse(raw) as Partial<DashboardReturnState>;
                    savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : 0;
                } catch {
                    savedAt = 0;
                }
            }
            return { key, savedAt };
        })
        .sort((a, b) => a.savedAt - b.savedAt);

    const toDelete = entries.slice(0, Math.max(0, entries.length - MAX_STORED_STATES));
    toDelete.forEach(({ key }) => window.sessionStorage.removeItem(key));
}

export function saveResearchReturnState(
    sessionId: string,
    state: Omit<DashboardReturnState, 'sessionId' | 'savedAt'>
): string | null {
    if (!hasSessionStorage()) return null;

    const stateKey = `${sessionId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payload: DashboardReturnState = {
        ...state,
        sessionId,
        savedAt: Date.now(),
    };

    window.sessionStorage.setItem(`${STORAGE_PREFIX}${stateKey}`, JSON.stringify(payload));
    pruneOldStates();
    return stateKey;
}

export function consumeResearchReturnState(stateKey: string): DashboardReturnState | null {
    if (!hasSessionStorage()) return null;

    const storageKey = `${STORAGE_PREFIX}${stateKey}`;
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;

    window.sessionStorage.removeItem(storageKey);

    try {
        const parsed = JSON.parse(raw) as DashboardReturnState;
        if (!parsed || typeof parsed !== 'object') return null;
        if (typeof parsed.sessionId !== 'string') return null;
        if (typeof parsed.scrollTop !== 'number') return null;
        if (!parsed.sort || typeof parsed.sort !== 'object') return null;
        if (!Array.isArray(parsed.collapsedGroups)) return null;
        return parsed;
    } catch {
        return null;
    }
}
