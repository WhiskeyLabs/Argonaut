import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { EsRunLogger, computeCanonicalBundleHash, computeRunId } from '../../lib/runtime/runLogging';

type LoggedDoc = { index: string; doc: Record<string, unknown> };

class MockRunClient {
  docs: LoggedDoc[] = [];

  async bulkUpsert(index: 'argonaut_runs' | 'argonaut_tasklogs', documents: unknown[]) {
    for (const doc of documents) {
      this.docs.push({ index, doc: doc as Record<string, unknown> });
    }

    return {
      attempted: documents.length,
      succeeded: documents.length,
      failed: 0,
    };
  }
}

function makeBundleDir(files: Array<{ name: string; content: string }>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'argonaut-runhash-'));
  for (const file of files) {
    fs.writeFileSync(path.join(dir, file.name), file.content, 'utf8');
  }
  return dir;
}

describe('run logging utilities', () => {
  test('computeRunId is deterministic for same canonical bundle hash', () => {
    const bundleA = makeBundleDir([
      { name: 'a.txt', content: 'A' },
      { name: 'b.txt', content: 'B' },
    ]);
    const bundleB = makeBundleDir([
      { name: 'b.txt', content: 'B' },
      { name: 'a.txt', content: 'A' },
    ]);

    const hashA = computeCanonicalBundleHash(bundleA);
    const hashB = computeCanonicalBundleHash(bundleB);

    const runA = computeRunId({ repo: 'payment-service', buildId: 'build-128', bundleId: 'bundle-1', canonicalBundleHash: hashA });
    const runB = computeRunId({ repo: 'payment-service', buildId: 'build-128', bundleId: 'bundle-1', canonicalBundleHash: hashB });

    expect(hashA).toBe(hashB);
    expect(runA).toBe(runB);
  });

  test('EsRunLogger writes run and monotonic task sequence', async () => {
    const client = new MockRunClient();
    const logger = new EsRunLogger({
      client,
      runId: 'run-1',
      repo: 'payment-service',
      buildId: 'build-128',
      bundleId: 'payment-service_build-128',
      executionMode: 'es',
    });

    await logger.writeRun({
      status: 'RUNNING',
      startedAt: 1700000000000,
      endedAt: null,
      stageSummary: {},
      counts: {},
      errorSummary: null,
    });

    await logger.writeTask({
      stage: 'ACQUIRE',
      taskType: 'SYSTEM',
      taskKey: 'acquire.pipeline',
      status: 'SUCCEEDED',
      message: 'Acquire pipeline execution',
      startedAt: 1700000000000,
      endedAt: 1700000001000,
      refs: { runId: 'run-1' },
      error: null,
    });

    await logger.writeTask({
      stage: 'SCORE',
      taskType: 'QUERY',
      taskKey: 'score.writeback',
      status: 'FAILED',
      message: 'Stage failed',
      startedAt: 1700000002000,
      endedAt: 1700000002001,
      refs: { runId: 'run-1' },
      error: { code: 'E_STAGE_FAILED', message: 'boom' },
    });

    const runDocs = client.docs.filter((entry) => entry.index === 'argonaut_runs');
    const taskDocs = client.docs.filter((entry) => entry.index === 'argonaut_tasklogs');

    expect(runDocs).toHaveLength(1);
    expect(taskDocs).toHaveLength(2);
    expect(taskDocs[0].doc.seq).toBe(1);
    expect(taskDocs[1].doc.seq).toBe(2);
    expect(taskDocs[0].doc.taskId).not.toBe(taskDocs[1].doc.taskId);
    expect(taskDocs[1].doc.error).toEqual({ code: 'E_STAGE_FAILED', message: 'boom' });
  });

  test('EsRunLogger writes stage lifecycle events with deterministic keys', async () => {
    const client = new MockRunClient();
    const logger = new EsRunLogger({
      client,
      runId: 'run-2',
      repo: 'payment-service',
      buildId: 'build-129',
      bundleId: 'payment-service_build-129',
      executionMode: 'es',
    });

    await logger.writeStageStart({
      stage: 'ACQUIRE',
      startedAt: 1700000003000,
      refs: { runId: 'run-2' },
    });

    await logger.writeStageTerminal({
      stage: 'ACQUIRE',
      status: 'SUCCEEDED',
      startedAt: 1700000003000,
      endedAt: 1700000004000,
      refs: { written: 10 },
      error: null,
    });

    const taskDocs = client.docs.filter((entry) => entry.index === 'argonaut_tasklogs');
    expect(taskDocs).toHaveLength(2);
    expect(taskDocs[0].doc.taskKey).toBe('acquire.stage.start');
    expect(taskDocs[0].doc.status).toBe('STARTED');
    expect(taskDocs[1].doc.taskKey).toBe('acquire.stage.end');
    expect(taskDocs[1].doc.status).toBe('SUCCEEDED');
  });
});
