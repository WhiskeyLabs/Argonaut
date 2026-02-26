#!/usr/bin/env node
console.log('[DEBUG] demo-judge.js entry');
require('ts-node').register({

  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    moduleResolution: 'node',
  },
});

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');

const { runAcquirePipeline } = require('../lib/data_plane/pipeline/acquire');
const { enrichFindingsContext } = require('../lib/data_plane/pipeline/enrich');
const { scoreAndWriteback } = require('../lib/data_plane/scoring/scoreAndWriteback');
const { runDeterminismHarness } = require('../lib/data_plane/harness/determinismHarness');
const { InMemoryDataPlaneClient } = require('../lib/data_plane/testing/inMemoryClient');
const { ElasticsearchDataPlaneClient } = require('../lib/data_plane/es/ElasticsearchDataPlaneClient');
const { fetchBundleFromObjectStore } = require('../lib/acquire/objectStoreFetcher');
const { PIPELINE_VERSION, computeCanonicalBundleHash, computeRunId, EsRunLogger } = require('../lib/runtime/runLogging');
const { SlackNotifier } = require('../lib/runtime/slackNotifier');

function readArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for --${name}`);
  }
  return value;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function requireValue(value, name) {
  if (!value || String(value).trim().length === 0) {
    throw new Error(`Missing required value for ${name}`);
  }
  return String(value).trim();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function nowMs() {
  return Date.now();
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function hashFile(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function collectBundleHash(bundlePath) {
  const files = fs.readdirSync(bundlePath)
    .filter((entry) => fs.statSync(path.join(bundlePath, entry)).isFile())
    .sort((a, b) => a.localeCompare(b));

  const parts = files.map((file) => `${file}:${hashFile(path.join(bundlePath, file))}`);
  return {
    bundlePath,
    files,
    bundleHash: sha256(parts.join('|')),
  };
}

function normalizeForDiff(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForDiff(entry));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const record = value;
  const result = {};
  for (const key of Object.keys(record).sort((a, b) => a.localeCompare(b))) {
    if (key === 'startedAt' || key === 'finishedAt' || key === 'createdAt' || key === 'updatedAt' || key === 'computedAt' || key === 'runId') {
      continue;
    }
    result[key] = normalizeForDiff(record[key]);
  }
  return result;
}

async function listFromClient(client, index) {
  const value = client.list(index);
  return Promise.resolve(value);
}

async function countFromClient(client, index) {
  const value = client.count(index);
  return Promise.resolve(value);
}

async function summarizeActions(client) {
  const rows = await listFromClient(client, 'argonaut_actions');
  return rows
    .map((doc) => doc.source)
    .map((action) => ({
      actionId: action.actionId,
      idempotencyKey: action.idempotencyKey,
      actionType: action.actionType,
      status: action.status,
      findingId: action.findingId,
      findingIds: Array.isArray(action.findingIds)
        ? [...action.findingIds].sort((a, b) => String(a).localeCompare(String(b)))
        : undefined,
      targetSystem: action.targetSystem,
      payloadHash: action.payloadHash,
    }))
    .sort((a, b) => String(a.actionId).localeCompare(String(b.actionId)));
}

function buildStageTrace(summary) {
  return summary.stageResults.map((stage, idx) => ({
    seq: idx + 1,
    stage: stage.stage,
    status: stage.status,
    written: stage.written,
    errors: stage.errors,
  }));
}

async function runSingleFlowMemory({ repo, buildId, bundlePath, topN }) {
  const client = new InMemoryDataPlaneClient();

  const t0 = nowMs();
  const acquire = await runAcquirePipeline(client, { repo, buildId, bundlePath, dryRun: false, verbose: false });
  const t1 = nowMs();

  const enrichStart = nowMs();
  await enrichFindingsContext(client);
  const enrichEnd = nowMs();

  const scoreStart = nowMs();
  const score = await scoreAndWriteback(client, topN);
  const scoreEnd = nowMs();

  const traces = buildStageTrace(acquire);
  traces.push({ seq: traces.length + 1, stage: 'enrich', status: 'SUCCESS', written: 0, errors: [] });
  traces.push({ seq: traces.length + 1, stage: 'score', status: 'SUCCESS', written: score.processed, errors: [] });

  return {
    acquire,
    traces,
    topN: score.topN,
    actionAudit: await summarizeActions(client),
    timings: {
      acquireMs: t1 - t0,
      enrichMs: enrichEnd - enrichStart,
      scoreMs: scoreEnd - scoreStart,
      totalMs: scoreEnd - t0,
    },
  };
}

function toJsonl(rows) {
  return rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
}

function getEnvVersions(executionMode) {
  const npmVersion = childProcess.execSync('npm --version', { encoding: 'utf8' }).trim();
  let gitCommit = 'unknown';
  try {
    gitCommit = childProcess.execSync('git rev-parse --verify HEAD 2>/dev/null', {
      encoding: 'utf8',
      shell: true,
    }).trim();
  } catch (_error) {
    gitCommit = 'unknown';
  }

  return {
    os: `${process.platform} ${process.arch}`,
    node: process.version,
    npm: npmVersion,
    executionMode,
    commit: gitCommit,
  };
}

function writeEnvVersions(filePath, envInfo, bundleInfo) {
  const lines = [
    `os=${envInfo.os}`,
    `node=${envInfo.node}`,
    `npm=${envInfo.npm}`,
    `executionMode=${envInfo.executionMode}`,
    `commit=${envInfo.commit}`,
    `bundlePath=${bundleInfo.bundlePath}`,
    `bundleHash=${bundleInfo.bundleHash}`,
    `bundleFiles=${bundleInfo.files.join(',')}`,
  ];

  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
}

function acquireStageStatusToTaskStatus(status) {
  if (status === 'SUCCESS') {
    return 'SUCCEEDED';
  }
  if (status === 'FAILED') {
    return 'FAILED';
  }
  return 'SKIPPED';
}

function normalizeTerminalToRunStatus(status) {
  if (status === 'SUCCEEDED') {
    return 'SUCCESS';
  }
  if (status === 'FAILED') {
    return 'FAILED';
  }
  return 'SKIPPED';
}

function assertStageSummaryIntegrity(stageSummary, terminalStatuses) {
  const required = ['ACQUIRE', 'ENRICH', 'SCORE', 'ACTIONS'];
  for (const stage of required) {
    const runStatus = stageSummary[stage];
    const terminal = terminalStatuses[stage];
    if (!runStatus || !terminal) {
      throw new Error(`Missing stage summary or terminal log for stage=${stage}.`);
    }

    const runStatusStr = typeof runStatus === 'object' ? runStatus.status : runStatus;
    if (String(runStatusStr) !== normalizeTerminalToRunStatus(String(terminal))) {
      throw new Error(`Stage summary mismatch for stage=${stage}. run=${runStatusStr} terminal=${terminal}`);
    }
  }
}

async function safeNotifyLifecycle(notifier, event) {
  if (!notifier) {
    return null;
  }

  try {
    return await notifier.notifyLifecycle(event);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[slack-lifecycle] ${message}\n`);
    return null;
  }
}

async function runMemoryEvidence({ repo, buildId, bundlePath, topN, execution }) {
  const evidenceRoot = path.resolve(__dirname, '../../program_management/epics/epic_5_demo_hardening_submission/evidence');
  const run1Dir = path.join(evidenceRoot, 'run_01');
  const run2Dir = path.join(evidenceRoot, 'run_02');
  const snapshotDir = path.join(evidenceRoot, 'config_snapshot');

  ensureDir(evidenceRoot);
  ensureDir(run1Dir);
  ensureDir(run2Dir);
  ensureDir(snapshotDir);

  const bundleInfo = collectBundleHash(bundlePath);
  bundleInfo.execution = execution;
  writeJson(path.join(snapshotDir, 'bundle_snapshot.json'), bundleInfo);

  const harnessReport = await runDeterminismHarness({
    repo,
    buildId,
    bundlePath,
    topN,
    failFast: true,
    dryRun: false,
    verbose: false,
  });
  writeJson(path.join(evidenceRoot, 'determinism_report.json'), harnessReport);

  const run01 = await runSingleFlowMemory({ repo, buildId, bundlePath, topN });
  const run02 = await runSingleFlowMemory({ repo, buildId, bundlePath, topN });

  writeJson(path.join(run1Dir, 'acquire_summary.json'), run01.acquire);
  writeJson(path.join(run1Dir, 'topn_output.json'), run01.topN);
  writeJson(path.join(run1Dir, 'action_audit.json'), run01.actionAudit);
  fs.writeFileSync(path.join(run1Dir, 'stage_traces.jsonl'), toJsonl(run01.traces), 'utf8');

  writeJson(path.join(run2Dir, 'acquire_summary.json'), run02.acquire);
  writeJson(path.join(run2Dir, 'topn_output.json'), run02.topN);
  writeJson(path.join(run2Dir, 'action_audit.json'), run02.actionAudit);
  fs.writeFileSync(path.join(run2Dir, 'stage_traces.jsonl'), toJsonl(run02.traces), 'utf8');

  writeJson(path.join(evidenceRoot, 'topn_output.json'), { run_01: run01.topN, run_02: run02.topN });
  writeJson(path.join(evidenceRoot, 'action_audit.json'), { run_01: run01.actionAudit, run_02: run02.actionAudit });

  const normalized = normalizeForDiff({
    run_01: run01,
    run_02: run02,
    harness: normalizeForDiff(harnessReport),
  });
  writeJson(path.join(evidenceRoot, 'outputs_normalized.json'), normalized);

  const runtimeMetrics = {
    targetMs: 45000,
    run_01: run01.timings,
    run_02: run02.timings,
  };
  writeJson(path.join(evidenceRoot, 'runtime_metrics.json'), runtimeMetrics);

  const envInfo = getEnvVersions(execution);
  writeEnvVersions(path.join(evidenceRoot, 'env_versions.txt'), envInfo, bundleInfo);

  console.log(`Evidence written to ${evidenceRoot}`);
}

async function runEsExecution({ repo, buildId, bundlePath, bundleId, topN, clean }) {
  const client = new ElasticsearchDataPlaneClient();
  const notifier = new SlackNotifier(client, {
    mode: process.env.SLACK_MODE,
    webhookUrl: process.env.SLACK_WEBHOOK_URL,
    channel: process.env.SLACK_CHANNEL,
    attempt: 1,
    templateVersion: '1.0',
  });

  const canonicalBundleHash = computeCanonicalBundleHash(bundlePath);
  const runId = computeRunId({
    repo,
    buildId,
    bundleId,
    canonicalBundleHash,
    pipelineVersion: PIPELINE_VERSION,
  });

  if (clean) {
    await client.deleteByRunId(runId);
  }

  const logger = new EsRunLogger({
    client,
    runId,
    repo,
    buildId,
    bundleId,
    executionMode: 'es',
    pipelineVersion: PIPELINE_VERSION,
  });

  const startedAt = nowMs();
  const stageSummary = {};
  const terminalStatuses = {};
  let counts = {};
  let errorSummary = null;

  await logger.writeRun({
    status: 'RUNNING',
    startedAt,
    endedAt: null,
    stageSummary,
    counts,
    errorSummary,
  });

  // START ANCHOR: Emit workflow:meta log so Kibana dashboard picks up the run immediately
  await logger.writeTask({
    stage: 'SYSTEM',
    taskType: 'SYSTEM',
    taskKey: 'workflow:meta',
    status: 'STARTED',
    message: 'Workflow execution started',
    startedAt,
    endedAt: startedAt,
  });

  await safeNotifyLifecycle(notifier, {
    eventType: 'created',
    runId,
    repo,
    buildId,
    stage: 'SYSTEM',
    status: 'RUNNING',
    message: 'Run created',
    pipelineVersion: PIPELINE_VERSION,
    executionMode: 'es',
  });

  try {
    const acquireStart = nowMs();
    await logger.writeStageStart({
      stage: 'ACQUIRE',
      startedAt: acquireStart,
      refs: { runId, bundleId, repo, buildId },
    });

    console.log(`[DEBUG] Starting ACQUIRE stage for run: ${runId}`);
    const acquireSummary = await runAcquirePipeline(client, {
      repo,
      buildId,
      bundlePath,
      runId,
      dryRun: false,
      verbose: hasFlag('verbose'),
    });
    console.log(`[DEBUG] ACQUIRE stage finished with status: ${acquireSummary.status}`);
    const acquireEnd = nowMs();


    stageSummary.ACQUIRE = { status: acquireSummary.status, startedAt: new Date(acquireStart).toISOString(), endedAt: new Date(acquireEnd).toISOString() };
    terminalStatuses.ACQUIRE = acquireSummary.status === 'SUCCESS' ? 'SUCCEEDED' : 'FAILED';
    await logger.writeStageTerminal({
      stage: 'ACQUIRE',
      status: terminalStatuses.ACQUIRE,
      startedAt: acquireStart,
      endedAt: acquireEnd,
      refs: { runId, bundleId, status: acquireSummary.status },
      error: acquireSummary.status === 'SUCCESS' ? null : { code: 'E_ACQUIRE_PIPELINE_FAILED', message: 'Acquire stage failed' },
    });
    await safeNotifyLifecycle(notifier, {
      eventType: 'status_changed',
      runId,
      repo,
      buildId,
      stage: 'ACQUIRE',
      status: terminalStatuses.ACQUIRE,
      message: `Acquire stage ${String(terminalStatuses.ACQUIRE).toLowerCase()}`,
      pipelineVersion: PIPELINE_VERSION,
      executionMode: 'es',
    });

    await logger.writeTask({
      stage: 'ACQUIRE',
      taskType: 'SYSTEM',
      taskKey: 'acquire.pipeline',
      status: acquireSummary.status === 'SUCCESS' ? 'SUCCEEDED' : 'FAILED',
      message: 'Acquire pipeline execution',
      startedAt: acquireStart,
      endedAt: acquireEnd,
      refs: { runId, bundleId },
      error: acquireSummary.status === 'SUCCESS' ? null : { code: 'E_ACQUIRE_PIPELINE_FAILED', message: 'Acquire stage failed' },
    });

    for (const stageResult of acquireSummary.stageResults) {
      const terminalStatus = acquireStageStatusToTaskStatus(stageResult.status);
      await logger.writeTask({
        stage: 'ACQUIRE',
        taskType: 'BATCH',
        taskKey: `acquire.batch.${stageResult.stage}`,
        status: terminalStatus,
        message: `Acquire batch ${stageResult.stage} ${stageResult.status.toLowerCase()}`,
        startedAt: acquireStart,
        endedAt: acquireEnd,
        refs: {
          runId,
          stage: stageResult.stage,
          written: stageResult.written,
          errors: stageResult.errors.length,
        },
        error: stageResult.errors.length > 0
          ? { code: 'E_ACQUIRE_BATCH_FAILED', message: stageResult.errors.join('; ').slice(0, 512) }
          : null,
      });
    }

    const enrichStart = nowMs();
    await logger.writeStageStart({
      stage: 'ENRICH',
      startedAt: enrichStart,
      refs: { runId },
    });

    console.log(`[DEBUG] Starting ENRICH stage`);
    const enrichSummary = await enrichFindingsContext(client);
    console.log(`[DEBUG] ENRICH stage finished, processed: ${enrichSummary.processed}`);

    const enrichEnd = nowMs();

    stageSummary.ENRICH = { status: 'SUCCESS', startedAt: new Date(enrichStart).toISOString(), endedAt: new Date(enrichEnd).toISOString() };
    terminalStatuses.ENRICH = 'SUCCEEDED';
    await logger.writeStageTerminal({
      stage: 'ENRICH',
      status: 'SUCCEEDED',
      startedAt: enrichStart,
      endedAt: enrichEnd,
      refs: { processed: enrichSummary.processed, warnings: enrichSummary.warnings.length },
      error: null,
    });
    await safeNotifyLifecycle(notifier, {
      eventType: 'status_changed',
      runId,
      repo,
      buildId,
      stage: 'ENRICH',
      status: terminalStatuses.ENRICH,
      message: 'Enrich stage succeeded',
      pipelineVersion: PIPELINE_VERSION,
      executionMode: 'es',
    });

    await logger.writeTask({
      stage: 'ENRICH',
      taskType: 'SYSTEM',
      taskKey: 'enrich.context',
      status: 'SUCCEEDED',
      message: 'Enrich stage execution',
      startedAt: enrichStart,
      endedAt: enrichEnd,
      refs: { processed: enrichSummary.processed },
      error: null,
    });

    await logger.writeTask({
      stage: 'ENRICH',
      taskType: 'BATCH',
      taskKey: 'enrich.integrity',
      status: 'SUCCEEDED',
      message: 'Enrich referential integrity check',
      startedAt: enrichStart,
      endedAt: enrichEnd,
      refs: {
        brokenReachabilityRefsCount: enrichSummary.integrity.brokenReachabilityRefsCount,
        brokenExplanationRefsCount: enrichSummary.integrity.brokenExplanationRefsCount,
        brokenDependencyBuildRefsCount: enrichSummary.integrity.brokenDependencyBuildRefsCount,
      },
      error: null,
    });

    const scoreStart = nowMs();
    await logger.writeStageStart({
      stage: 'SCORE',
      startedAt: scoreStart,
      refs: { runId, topN },
    });

    console.log(`[DEBUG] Starting SCORE stage`);
    const scoreSummary = await scoreAndWriteback(client, topN);
    console.log(`[DEBUG] SCORE stage finished, processed: ${scoreSummary.processed}`);

    const scoreEnd = nowMs();

    stageSummary.SCORE = { status: 'SUCCESS', startedAt: new Date(scoreStart).toISOString(), endedAt: new Date(scoreEnd).toISOString() };
    terminalStatuses.SCORE = 'SUCCEEDED';
    await logger.writeStageTerminal({
      stage: 'SCORE',
      status: 'SUCCEEDED',
      startedAt: scoreStart,
      endedAt: scoreEnd,
      refs: { processed: scoreSummary.processed, topN: scoreSummary.topN.length },
      error: null,
    });
    await safeNotifyLifecycle(notifier, {
      eventType: 'status_changed',
      runId,
      repo,
      buildId,
      stage: 'SCORE',
      status: terminalStatuses.SCORE,
      message: 'Score stage succeeded',
      pipelineVersion: PIPELINE_VERSION,
      executionMode: 'es',
    });

    await logger.writeTask({
      stage: 'SCORE',
      taskType: 'QUERY',
      taskKey: 'score.writeback',
      status: 'SUCCEEDED',
      message: 'Score and writeback execution',
      startedAt: scoreStart,
      endedAt: scoreEnd,
      refs: { processed: scoreSummary.processed, topN: scoreSummary.topN.length },
      error: null,
    });

    const actionsStart = nowMs();
    await logger.writeStageStart({
      stage: 'ACTIONS',
      startedAt: actionsStart,
      refs: { runId },
    });

    stageSummary.ACTIONS = { status: 'SKIPPED' };
    terminalStatuses.ACTIONS = 'SKIPPED';
    const actionsTs = nowMs();
    await logger.writeStageTerminal({
      stage: 'ACTIONS',
      status: 'SKIPPED',
      startedAt: actionsStart,
      endedAt: actionsTs,
      refs: { reason: 'demo:judge action stage disabled' },
      error: null,
    });
    await safeNotifyLifecycle(notifier, {
      eventType: 'status_changed',
      runId,
      repo,
      buildId,
      stage: 'ACTIONS',
      status: terminalStatuses.ACTIONS,
      message: 'Action stage skipped in demo:judge',
      pipelineVersion: PIPELINE_VERSION,
      executionMode: 'es',
    });

    await logger.writeTask({
      stage: 'ACTIONS',
      taskType: 'SYSTEM',
      taskKey: 'actions.skipped',
      status: 'SKIPPED',
      message: 'Action stage skipped in demo:judge',
      startedAt: actionsTs,
      endedAt: actionsTs,
      refs: {},
      error: null,
    });

    counts = {
      argonaut_artifacts: await countFromClient(client, 'argonaut_artifacts'),
      argonaut_findings: await countFromClient(client, 'argonaut_findings'),
      argonaut_dependencies: await countFromClient(client, 'argonaut_dependencies'),
      argonaut_sbom: await countFromClient(client, 'argonaut_sbom'),
      argonaut_reachability: await countFromClient(client, 'argonaut_reachability'),
      argonaut_threatintel: await countFromClient(client, 'argonaut_threatintel'),
      argonaut_actions: await countFromClient(client, 'argonaut_actions'),
      argonaut_runs: await countFromClient(client, 'argonaut_runs'),
      argonaut_tasklogs: await countFromClient(client, 'argonaut_tasklogs'),
    };

    assertStageSummaryIntegrity(stageSummary, terminalStatuses);

    const endedAt = nowMs();

    // COMPLETE ANCHOR: Terminal status for Kibana dashboard
    await logger.writeTask({
      stage: 'SYSTEM',
      taskType: 'SYSTEM',
      taskKey: 'workflow:meta',
      status: 'SUCCEEDED',
      message: 'Workflow execution succeeded',
      startedAt: endedAt,
      endedAt: endedAt,
    });

    console.log(`[DEBUG] Finalizing run record`);
    await logger.writeRun({
      status: 'SUCCEEDED',
      startedAt,
      endedAt,
      stageSummary,
      counts,
      errorSummary,
    });
    console.log(`[DEBUG] Run record finalized`);


    process.stdout.write(`${JSON.stringify({
      status: 'SUCCEEDED',
      runId,
      bundleId,
      repo,
      buildId,
      executionMode: 'es',
      pipelineVersion: PIPELINE_VERSION,
      stageSummary,
      counts,
    }, null, 2)}\n`);
  } catch (error) {
    const failedAt = nowMs();
    const message = error instanceof Error ? error.message : String(error);

    errorSummary = {
      code: 'E_JUDGE_FAILED',
      message,
    };

    const failureStage = stageSummary.ACQUIRE ? (stageSummary.ENRICH ? (stageSummary.SCORE ? (stageSummary.ACTIONS ? 'SYSTEM' : 'ACTIONS') : 'SCORE') : 'ENRICH') : 'ACQUIRE';
    if (failureStage !== 'SYSTEM') {
      stageSummary[failureStage] = { status: 'FAILED' };
      if (!terminalStatuses[failureStage]) {
        terminalStatuses[failureStage] = 'FAILED';
        await logger.writeStageTerminal({
          stage: failureStage,
          status: 'FAILED',
          startedAt: failedAt,
          endedAt: failedAt,
          refs: { runId },
          error: { code: 'E_STAGE_FAILED', message },
        });
        await safeNotifyLifecycle(notifier, {
          eventType: 'status_changed',
          runId,
          repo,
          buildId,
          stage: failureStage,
          status: 'FAILED',
          message: `Stage ${failureStage} failed`,
          pipelineVersion: PIPELINE_VERSION,
          executionMode: 'es',
        });
      }
    }

    await logger.writeTask({
      stage: failureStage,
      taskType: 'SYSTEM',
      taskKey: failureStage === 'SYSTEM' ? 'system.failure' : `${String(failureStage).toLowerCase()}.failure`,
      status: 'FAILED',
      message: 'Stage failed',
      startedAt: failedAt,
      endedAt: failedAt,
      refs: { runId },
      error: { code: 'E_STAGE_FAILED', message },
    });

    // COMPLETE ANCHOR: Terminal status for Kibana dashboard
    await logger.writeTask({
      stage: 'SYSTEM',
      taskType: 'SYSTEM',
      taskKey: 'workflow:meta',
      status: 'FAILED',
      message: `Workflow execution failed: ${message}`,
      startedAt: failedAt,
      endedAt: failedAt,
    });

    await logger.writeRun({
      status: 'FAILED',
      startedAt,
      endedAt: failedAt,
      stageSummary,
      counts,
      errorSummary,
    });

    await safeNotifyLifecycle(notifier, {
      eventType: 'run.failed',
      runId,
      repo,
      buildId,
      stage: failureStage,
      status: 'FAILED',
      message,
      pipelineVersion: PIPELINE_VERSION,
      executionMode: 'es',
    });

    throw error;
  }
}

async function main() {
  const execution = (readArg('execution') || process.env.EXECUTION_MODE || 'memory').trim().toLowerCase();
  if (execution !== 'memory' && execution !== 'es') {
    throw new Error(`Invalid --execution value '${execution}'. Expected memory|es.`);
  }

  const clean = hasFlag('clean');
  const bundleIdArg = readArg('bundleId') || process.env.DEMO_BUNDLE_ID;
  let bundlePath = readArg('bundle') || process.env.DEMO_BUNDLE_PATH;
  let bundleId = bundleIdArg || null;
  let fetchedManifest = null;

  if (bundleIdArg) {
    const fetched = await fetchBundleFromObjectStore(String(bundleIdArg).trim());
    bundlePath = fetched.bundlePath;
    fetchedManifest = fetched.manifest;
    bundleId = fetched.manifest.bundleId;
  }

  bundlePath = requireValue(bundlePath, 'bundle/DEMO_BUNDLE_PATH or --bundleId/DEMO_BUNDLE_ID');
  bundleId = bundleId || path.basename(bundlePath);

  const repo = requireValue(readArg('repo') || process.env.DEMO_REPO || (fetchedManifest && fetchedManifest.repo), 'repo/DEMO_REPO');
  const buildId = requireValue(readArg('build-id') || process.env.DEMO_BUILD_ID || (fetchedManifest && fetchedManifest.buildId), 'build-id/DEMO_BUILD_ID');
  const topN = Number(readArg('top-n') || process.env.DEMO_TOP_N || '10');

  if (!Number.isInteger(topN) || topN <= 0) {
    throw new Error('top-n must be a positive integer');
  }

  if (!fs.existsSync(bundlePath) || !fs.statSync(bundlePath).isDirectory()) {
    throw new Error(`Bundle path does not exist or is not a directory: ${bundlePath}`);
  }

  if (execution === 'es') {
    await runEsExecution({ repo, buildId, bundlePath, bundleId, topN, clean });
    return;
  }

  await runMemoryEvidence({ repo, buildId, bundlePath, topN, execution });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
