import { db } from '../db';
import { AppEvent, EventType } from '../types/events';
import { v4 as uuidv4 } from 'uuid';

export class EvidenceLogService {

    /**
     * Log an immutable event to the audit trail.
     */
    async log(sessionId: string, type: EventType, payload: Record<string, any>): Promise<void> {
        const event: AppEvent = {
            id: uuidv4(),
            sessionId,
            type,
            timestamp: Date.now(),
            payload
        };

        try {
            await db.table('events').add(event);
            console.debug(`[EvidenceLog] ${type}`, payload);
        } catch (err) {
            console.error(`[EvidenceLog] Failed to persist event ${type}`, err);
        }
    }

    /**
     * Retrieve the audit trail for a specific session.
     */
    async getEvents(sessionId: string): Promise<AppEvent[]> {
        return await db.table('events')
            .where('sessionId')
            .equals(sessionId)
            .sortBy('timestamp');
    }

    /**
     * Retrieve events of a specific type for a session (e.g., all AI actions).
     */
    async getEventsByType(sessionId: string, type: EventType): Promise<AppEvent[]> {
        return await db.table('events')
            .where({ sessionId, type })
            .sortBy('timestamp');
    }
}

export const evidenceLog = new EvidenceLogService();
