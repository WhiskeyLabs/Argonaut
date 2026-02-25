export interface LastResearchContext {
    sessionId: string;
    findingId: string;
    savedAt: number;
}

const LAST_ACTIVE_SESSION_KEY = 'argus.nav.lastActiveSessionId';
const LAST_RESEARCH_CONTEXT_KEY = 'argus.nav.lastResearchContext';
const LAST_RESEARCH_BY_SESSION_PREFIX = 'argus.nav.lastResearchBySession.';
const LEGACY_ACTIVE_SESSION_KEY = 'aletheia_active_session';

function getStorage(): Storage | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
}

function parseResearchContext(raw: string | null): LastResearchContext | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<LastResearchContext>;
        if (!parsed || typeof parsed !== 'object') return null;
        if (typeof parsed.sessionId !== 'string') return null;
        if (typeof parsed.findingId !== 'string') return null;
        if (typeof parsed.savedAt !== 'number') return null;
        return {
            sessionId: parsed.sessionId,
            findingId: parsed.findingId,
            savedAt: parsed.savedAt,
        };
    } catch {
        return null;
    }
}

export function getLastActiveSessionId(): string | null {
    const storage = getStorage();
    if (!storage) return null;

    const normalized = storage.getItem(LAST_ACTIVE_SESSION_KEY);
    if (normalized) return normalized;

    // One-time legacy migration for existing browsers.
    const legacy = storage.getItem(LEGACY_ACTIVE_SESSION_KEY);
    if (legacy) {
        storage.setItem(LAST_ACTIVE_SESSION_KEY, legacy);
        storage.removeItem(LEGACY_ACTIVE_SESSION_KEY);
        return legacy;
    }

    return null;
}

export function setLastActiveSessionId(sessionId: string): void {
    const storage = getStorage();
    if (!storage) return;
    if (!sessionId) return;
    storage.setItem(LAST_ACTIVE_SESSION_KEY, sessionId);
}

export function clearLastActiveSessionId(): void {
    const storage = getStorage();
    if (!storage) return;
    storage.removeItem(LAST_ACTIVE_SESSION_KEY);
}

export function getLastResearchContext(): LastResearchContext | null {
    const storage = getStorage();
    if (!storage) return null;
    return parseResearchContext(storage.getItem(LAST_RESEARCH_CONTEXT_KEY));
}

export function getLastResearchContextForSession(sessionId: string): LastResearchContext | null {
    const storage = getStorage();
    if (!storage || !sessionId) return null;
    const key = `${LAST_RESEARCH_BY_SESSION_PREFIX}${sessionId}`;
    return parseResearchContext(storage.getItem(key));
}

export function setLastResearchContext(sessionId: string, findingId: string): void {
    const storage = getStorage();
    if (!storage) return;
    if (!sessionId || !findingId) return;

    const payload: LastResearchContext = {
        sessionId,
        findingId,
        savedAt: Date.now(),
    };

    const serialized = JSON.stringify(payload);
    storage.setItem(LAST_RESEARCH_CONTEXT_KEY, serialized);
    storage.setItem(`${LAST_RESEARCH_BY_SESSION_PREFIX}${sessionId}`, serialized);
}

export function clearLastResearchContext(): void {
    const storage = getStorage();
    if (!storage) return;
    storage.removeItem(LAST_RESEARCH_CONTEXT_KEY);
}

export function clearLastResearchContextForSession(sessionId: string): void {
    const storage = getStorage();
    if (!storage || !sessionId) return;
    storage.removeItem(`${LAST_RESEARCH_BY_SESSION_PREFIX}${sessionId}`);
}

export function clearNavMemoryForSession(sessionId: string): void {
    if (!sessionId) return;
    const active = getLastActiveSessionId();
    if (active === sessionId) {
        clearLastActiveSessionId();
    }

    const globalResearch = getLastResearchContext();
    if (globalResearch?.sessionId === sessionId) {
        clearLastResearchContext();
    }
    clearLastResearchContextForSession(sessionId);
}

export function clearAllNavMemory(): void {
    const storage = getStorage();
    if (!storage) return;

    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (!key) continue;
        if (key === LAST_ACTIVE_SESSION_KEY || key === LAST_RESEARCH_CONTEXT_KEY || key === LEGACY_ACTIVE_SESSION_KEY) {
            keysToRemove.push(key);
            continue;
        }
        if (key.startsWith(LAST_RESEARCH_BY_SESSION_PREFIX)) {
            keysToRemove.push(key);
        }
    }

    for (const key of keysToRemove) {
        storage.removeItem(key);
    }
}
