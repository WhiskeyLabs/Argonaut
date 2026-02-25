import { describe, expect, test, vi } from 'vitest';
import { SlackNotifier } from '../../lib/runtime/slackNotifier';

type UnknownRecord = Record<string, unknown>;

class InMemoryActionClient {
    private readonly docs = new Map<string, UnknownRecord>();

    async bulk(params: { operations: Array<Record<string, unknown>> }): Promise<unknown> {
        const items: Array<{ index: { _id: string; status: number } }> = [];

        for (let i = 0; i < params.operations.length; i += 2) {
            const action = params.operations[i];
            const source = params.operations[i + 1];
            const meta = (action as { index?: { _index?: string; _id?: string } }).index;
            const id = meta?._id;

            if (typeof id !== 'string') {
                items.push({ index: { _id: '__missing__', status: 400 } });
                continue;
            }

            this.docs.set(id, structuredClone((source as UnknownRecord) ?? {}));
            items.push({ index: { _id: id, status: 201 } });
        }

        return {
            errors: items.some((item) => item.index.status >= 300),
            items,
        };
    }

    async getById(index: 'argonaut_actions', id: string): Promise<UnknownRecord | null> {
        if (index !== 'argonaut_actions') {
            return null;
        }

        return this.docs.has(id) ? structuredClone(this.docs.get(id) as UnknownRecord) : null;
    }

    getAction(id: string): UnknownRecord | null {
        return this.docs.has(id) ? structuredClone(this.docs.get(id) as UnknownRecord) : null;
    }
}

describe('SlackNotifier', () => {
    test('dry-run mode persists deterministic lifecycle payload and dedupes reruns', async () => {
        const client = new InMemoryActionClient();
        const notifier = new SlackNotifier(client, {
            mode: 'dry-run',
            now: () => 1700000000000,
        });

        const first = await notifier.notifyLifecycle({
            eventType: 'created',
            runId: 'run-1',
            repo: 'payment-service',
            buildId: 'build-128',
            stage: 'SYSTEM',
            status: 'RUNNING',
            message: 'Run created',
        });

        const second = await notifier.notifyLifecycle({
            eventType: 'created',
            runId: 'run-1',
            repo: 'payment-service',
            buildId: 'build-128',
            stage: 'SYSTEM',
            status: 'RUNNING',
            message: 'Run created',
        });

        expect(first.status).toBe('DRY_RUN_READY');
        expect(first.duplicate).toBe(false);
        expect(first.posted).toBe(false);
        expect(second.status).toBe('SKIPPED_DUPLICATE');
        expect(second.duplicate).toBe(true);

        const stored = client.getAction(first.actionId);
        expect(stored).not.toBeNull();
        expect(stored?.actionType).toBe('SLACK_LIFECYCLE');
        expect(stored?.status).toBe('DRY_RUN_READY');
    });

    test('enabled mode posts once per idempotency key', async () => {
        const client = new InMemoryActionClient();
        const fetchSpy = vi.fn(async () => ({
            ok: true,
            status: 200,
            text: async () => 'ok',
        }));

        const notifier = new SlackNotifier(client, {
            mode: 'enabled',
            webhookUrl: 'https://hooks.slack.invalid/services/T000/B000/XXXX',
            fetchImpl: fetchSpy as unknown as typeof fetch,
            now: () => 1700000001000,
        });

        const first = await notifier.notifyLifecycle({
            eventType: 'status_changed',
            runId: 'run-2',
            repo: 'payment-service',
            buildId: 'build-129',
            stage: 'SCORE',
            status: 'SUCCEEDED',
            message: 'Score succeeded',
        });

        const second = await notifier.notifyLifecycle({
            eventType: 'status_changed',
            runId: 'run-2',
            repo: 'payment-service',
            buildId: 'build-129',
            stage: 'SCORE',
            status: 'SUCCEEDED',
            message: 'Score succeeded',
        });

        expect(first.status).toBe('EXECUTED');
        expect(first.posted).toBe(true);
        expect(second.status).toBe('SKIPPED_DUPLICATE');
        expect(second.duplicate).toBe(true);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test('enabled mode without webhook is gated and does not post', async () => {
        const client = new InMemoryActionClient();
        const fetchSpy = vi.fn();

        const notifier = new SlackNotifier(client, {
            mode: 'enabled',
            webhookUrl: null,
            fetchImpl: fetchSpy as unknown as typeof fetch,
            now: () => 1700000002000,
        });

        const result = await notifier.notifyLifecycle({
            eventType: 'run.failed',
            runId: 'run-3',
            repo: 'payment-service',
            buildId: 'build-bad',
            stage: 'ACQUIRE',
            status: 'FAILED',
            message: 'Acquire failed',
        });

        expect(result.status).toBe('FAILED_VALIDATION');
        expect(result.posted).toBe(false);
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
