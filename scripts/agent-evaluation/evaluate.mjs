import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Timeline, StreamBatcher } from './timeline.mjs';
import { timingSummary } from './timing.mjs';
import { websiteReference, WEBSITE_PROMPT } from './website-fixture.mjs';
import { engineAdapter } from './adapters.mjs';
import { modelGateway } from './gateway.mjs';
import { PINS, defaultProfileRoot, launcher, workspaceFor } from './process.mjs';

export const TRIALS = [
  'quiet-start',
  'multi-step',
  'vision',
  'safe-edit',
  'managed-process',
  'browser-viewports',
  'cancellation',
  'reload-recovery',
];
export async function doctor() {
  const engines = {};
  for (const name of Object.keys(PINS)) {
    try {
      const installed = await launcher(name);
      engines[name] = {
        installed: installed.version,
        pinned: PINS[name],
        matches: installed.version === PINS[name],
      };
    } catch {
      engines[name] = { installed: null, pinned: PINS[name], matches: false };
    }
  }
  return {
    engines,
    productionEngineChanged: false,
    defaultModelRequests: false,
    profileRoot: defaultProfileRoot(),
  };
}
export async function evaluate({
  engine,
  mode = 'fixture',
  model = 'nexus-fixture',
  root = defaultProfileRoot(),
  prompt = 'Reply with exactly: Nexus evaluation ready.',
  image = false,
  imageData,
  cancelAfterMs,
  credential,
  scenario = 'text',
  signal,
  onUpdate = () => {},
  timeoutMs = 150000,
  acceptedAt = Date.now(),
} = {}) {
  if (!Object.keys(PINS).includes(engine)) throw new Error('UNKNOWN_ENGINE');
  const runRoot = join(
    root,
    new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID().slice(0, 8),
  );
  await mkdir(runRoot, { recursive: true });
  const timeline = new Timeline();
  timeline.begin(engine, mode, acceptedAt);
  timeline.on('update', onUpdate);
  onUpdate(timeline.snapshot());
  const token = timeline.token();
  const rawEvents = {};
  const diagnostics = [];
  const nativeItems = [];
  const activeTools = new Set();
  let observedPhase = 'preparing';
  const batcher = new StreamBatcher((event) => timeline.accept(event, token));
  let adapter;
  let gateway;
  let failure = null;
  let cancelTimer;
  let nativeSnapshot = null;
  const supervision = {};
  const preparation = {};
  let previewUrl;
  const interrupt = () => {
    batcher.push({ kind: 'phase', phase: 'stopping' });
    if (adapter)
      void adapter
        .interrupt()
        .then(() => batcher.push({ kind: 'terminal', outcome: 'interrupted' }))
        .catch(() => batcher.push({ kind: 'terminal', outcome: 'failed' }));
    else batcher.push({ kind: 'terminal', outcome: 'interrupted' });
  };
  signal?.addEventListener('abort', interrupt, { once: true });
  const completed = new Promise((resolveDone) =>
    timeline.on('update', (snapshot) => {
      if (snapshot.turn.endedAt !== null) resolveDone();
    }),
  );
  try {
    if (signal?.aborted) {
      interrupt();
      throw new Error('EVALUATION_INTERRUPTED');
    }
    let stepAt = Date.now();
    const installed = await launcher(engine);
    preparation.versionCheckMs = Date.now() - stepAt;
    if (installed.version !== PINS[engine]) throw new Error('ENGINE_VERSION_MISMATCH');
    if (scenario === 'website') {
      if (mode !== 'xkiro') throw new Error('WEBSITE_TRIAL_REQUIRES_REAL_MODEL');
      image = true;
      prompt = WEBSITE_PROMPT;
      stepAt = Date.now();
      imageData ??= await websiteReference(join(runRoot, 'reference'));
      preparation.referenceMs = Date.now() - stepAt;
    }
    stepAt = Date.now();
    gateway = await modelGateway({
      mode,
      model,
      credential,
      scenario,
      requireVision: image,
      delayMs: cancelAfterMs ? 2000 : 250,
      fixturePath: join(workspaceFor(runRoot, engine), 'evaluation-note.txt'),
    });
    preparation.gatewaySetupMs = Date.now() - stepAt;
    preparation.providerCatalogMs = gateway.preparation.catalogMs;
    preparation.credentialLoadMs = gateway.preparation.credentialMs;
    if (signal?.aborted) throw new Error('EVALUATION_INTERRUPTED');
    stepAt = Date.now();
    adapter = await engineAdapter(engine, {
      root: runRoot,
      gateway,
      scenario,
      onEvent: (event) => {
        const phase = (next) => {
          if (next !== observedPhase) {
            observedPhase = next;
            batcher.push({ kind: 'phase', phase: next });
          }
        };
        if (event.kind === 'phase') {
          phase(event.phase);
          return;
        }
        if (event.kind === 'item') {
          if (event.type === 'tool') {
            if (event.status === 'running') activeTools.add(event.id);
            else activeTools.delete(event.id);
            phase(activeTools.size ? 'tool' : 'waiting-model');
          } else if (event.delta || event.text)
            phase(event.type === 'reasoning' ? 'thinking' : 'responding');
        }
        batcher.push(event);
      },
      onRaw: (type, error, item) => {
        rawEvents[type] = (rawEvents[type] ?? 0) + 1;
        if (item && nativeItems.length < 128) nativeItems.push(item);
        if (error)
          diagnostics.push({
            kind: 'engine-error',
            code:
              typeof error === 'object' && typeof error.name === 'string'
                ? error.name.slice(0, 80)
                : 'ENGINE_REPORTED_ERROR',
          });
      },
    });
    preparation.adapterReadyMs = Date.now() - stepAt;
    if (signal?.aborted) {
      interrupt();
      throw new Error('EVALUATION_INTERRUPTED');
    }
    if (cancelAfterMs) cancelTimer = setTimeout(interrupt, cancelAfterMs);
    let timeout;
    try {
      await Promise.race([
        (async () => {
          await adapter.run(prompt, { image, imageData });
          await completed;
        })(),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error('EVALUATION_TIMEOUT')), timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    failure = String(error.message).slice(0, 400);
    batcher.push({ kind: 'terminal', outcome: 'failed' });
  } finally {
    signal?.removeEventListener('abort', interrupt);
    clearTimeout(cancelTimer);
    batcher.flush();
    if (['browser', 'website'].includes(scenario)) {
      for (const item of timeline.snapshot().items.filter((item) => item.type === 'tool')) {
        try {
          const value = JSON.parse(item.text);
          if (value.running && /^http:\/\/127\.0\.0\.1:\d+$/.test(value.url))
            previewUrl = value.url;
        } catch {}
      }
      if (!previewUrl)
        for (const record of adapter?.serviceRecords ?? [])
          if (record.kind === 'process' && record.running) supervision.observedRunning = true;
      if (previewUrl)
        try {
          supervision.observedRunning = (
            await fetch(previewUrl, { signal: AbortSignal.timeout(1500) })
          ).ok;
        } catch {
          supervision.observedRunning = false;
        }
    }
    try {
      nativeSnapshot = await adapter?.snapshot();
    } catch {
      diagnostics.push('NATIVE_SNAPSHOT_UNAVAILABLE');
    }
    try {
      await adapter?.close();
    } catch {
      diagnostics.push('ENGINE_CLEANUP_FAILED');
    }
    if (previewUrl)
      try {
        await fetch(previewUrl, { signal: AbortSignal.timeout(1500) });
        supervision.portClosed = false;
      } catch {
        supervision.portClosed = true;
      }
    else if (adapter?.serviceRecords)
      supervision.processStopped = adapter.serviceRecords.some(
        (record) => record.kind === 'cleanup' && record.processStopped,
      );
    try {
      await gateway?.close();
    } catch {
      diagnostics.push('GATEWAY_CLEANUP_FAILED');
    }
  }
  const report = {
    schemaVersion: 1,
    engine,
    pinnedVersion: PINS[engine],
    mode,
    model,
    scenario,
    runRoot,
    workspace: adapter?.workspace ?? workspaceFor(runRoot, engine),
    failure,
    timeline: timeline.evidence(),
    requests: gateway?.records ?? [],
    rawEvents,
    diagnostics,
    nativeItems,
    nativeSnapshot,
    supervision,
    services: adapter?.serviceRecords ?? [],
    timing: timingSummary(timeline.snapshot().turn, gateway?.records ?? []),
    preparation,
    trials: Object.fromEntries(
      TRIALS.map((trial) => [
        trial,
        {
          status: 'not-tested',
          reason: 'Requires its dedicated trial; a successful transport turn is insufficient.',
        },
      ]),
    ),
    selection: {
      eligible: false,
      reason:
        'No engine selection until all required trials and deliverable quality have evidence.',
    },
  };
  report.trials['quiet-start'] = {
    status: report.timeline.turn.outcome === 'completed' ? 'transport-verified' : 'failed',
    scope:
      mode === 'fixture'
        ? 'real engine + scripted model, not inference quality'
        : 'real engine + xkiro free model',
  };
  if (scenario === 'read')
    report.trials['multi-step'] = {
      status: report.timeline.items.some(
        (item) => item.type === 'tool' && item.status === 'completed',
      )
        ? 'tool-cycle-verified'
        : 'failed',
      reason:
        'Read-tool cycle only; not a website-quality trial. pi uses its SDK read tool; earlier reports used a harness-owned read tool.',
    };
  if (image)
    report.trials.vision = {
      status: report.requests.some((r) => r.imageCount > 0) ? 'payload-verified' : 'failed',
      reason: 'Image presence at gateway is verified separately from image interpretation.',
    };
  if (cancelAfterMs)
    report.trials.cancellation = {
      status: report.timeline.turn.outcome === 'interrupted' ? 'interruption-verified' : 'failed',
      reason: 'This trial does not prove child-process cleanup.',
    };
  const reportPath = join(runRoot, 'evidence.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  return { report, reportPath, snapshot: timeline.snapshot() };
}
