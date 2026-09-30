import { engineAdapter } from './adapters.mjs';
import { modelGateway } from './gateway.mjs';
import { defaultProfileRoot, PINS, workspaceFor } from './process.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function nativeRecovery({ engine, root = defaultProfileRoot() }) {
  const directory = join(root, 'recovery-' + engine + '-' + randomUUID().slice(0, 8));
  await mkdir(directory, { recursive: true });
  const gateway = await modelGateway({
    fixturePath: join(workspaceFor(directory, engine), 'evaluation-note.txt'),
  });
  const events = [];
  let adapter;
  let resolveTurn;
  const onEvent = (event) => {
    events.push(event);
    if (event.kind === 'terminal') resolveTurn?.(event);
  };
  const turn = async (text) => {
    const completed = new Promise((resolve) => {
      resolveTurn = resolve;
    });
    let timeout;
    try {
      return await Promise.race([
        (async () => {
          await adapter.run(text);
          return await completed;
        })(),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error('TRIAL_TIMEOUT')), 20000);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
      resolveTurn = null;
    }
  };
  let report;
  try {
    adapter = await engineAdapter(engine, { root: directory, gateway, onEvent });
    const first = await turn('Reply briefly: checkpoint one.');
    const handle = adapter.nativeHandle;
    const before = await adapter.snapshot();
    await adapter.close();
    adapter = null;
    const requestsBefore = gateway.records.length;
    adapter = await engineAdapter(engine, { root: directory, gateway, onEvent, restore: handle });
    const after = await adapter.snapshot();
    const noReplay = gateway.records.length === requestsBefore;
    const second = await turn('Reply briefly: checkpoint two.');
    const final = await adapter.snapshot();
    report = {
      engine,
      pinnedVersion: PINS[engine],
      scope: 'Completed-turn engine restart/reconstruction, not crash-during-mutation recovery',
      outcomes: [first.outcome, second.outcome],
      before,
      after,
      final,
      noReplay,
      restoredSameHandle: before.handle === after.handle,
      requests: gateway.records,
      toolEvents: events.filter((e) => e.type === 'tool').length,
    };
  } catch (error) {
    report = { engine, pinnedVersion: PINS[engine], failure: String(error.message).split(':')[0] };
  } finally {
    await adapter?.close();
    await gateway.close();
  }
  const reportPath = join(directory, 'evidence.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  return { report, reportPath };
}

export async function checkStaleEdit(result) {
  const contents = await readFile(join(result.report.workspace, 'evaluation-note.txt'), 'utf8');
  const failedTool = result.snapshot.items.some((i) => i.type === 'tool' && i.status === 'failed');
  const unchanged = contents === 'Nexus evaluation fixture: violet lantern, number 47.\n';
  result.report.trials['safe-edit'] = {
    status: failedTool && unchanged ? 'stale-context-rejection-verified' : 'failed',
    unchanged,
    failedTool,
    reason:
      'Deliberately absent old text through the native edit tool. Does not prove transactional concurrency safety.',
  };
  await writeFile(result.reportPath, JSON.stringify(result.report, null, 2));
  return result.report.trials['safe-edit'];
}

export async function uncertainMutation({ engine, root = defaultProfileRoot() }) {
  const directory = join(root, 'uncertain-' + engine + '-' + randomUUID().slice(0, 8));
  await mkdir(directory, { recursive: true });
  const gateway = await modelGateway({ scenario: 'uncertain-mutation' });
  const events = [];
  let adapter;
  let running;
  let report;
  try {
    adapter = await engineAdapter(engine, {
      root: directory,
      gateway,
      scenario: 'uncertain-mutation',
      onEvent: (e) => events.push(e),
    });
    const handle = adapter.nativeHandle;
    running = adapter
      .run('Call evaluation_checkpoint once; then report its result.')
      .catch(() => {});
    const markerPath = join(adapter.workspace, 'mutation-marker.txt');
    const until = Date.now() + 15000;
    let marker;
    while (Date.now() < until) {
      try {
        marker = await readFile(markerPath, 'utf8');
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    if (!marker) throw new Error('MUTATION_NOT_REACHED');
    await adapter.close();
    adapter = null;
    await running;
    const beforeRequests = gateway.records.length;
    adapter = await engineAdapter(engine, {
      root: directory,
      gateway,
      scenario: 'uncertain-mutation',
      restore: handle,
      onEvent: (e) => events.push(e),
    });
    const snapshot = await adapter.snapshot();
    const afterMarker = await readFile(markerPath, 'utf8');
    report = {
      engine,
      pinnedVersion: PINS[engine],
      scope:
        engine === 'pi'
          ? 'Cancellation after tool side effect, before result; SDK reconstruction'
          : 'Abrupt engine shutdown after MCP side effect, before result; native reconstruction',
      preservedMutation: afterMarker === 'applied\n',
      noAutomaticReplay: beforeRequests === gateway.records.length,
      markerCount: afterMarker.trim().split('\n').length,
      nativeSnapshot: snapshot,
      completedTurnBeforeStop: events.some(
        (e) => e.kind === 'terminal' && e.outcome === 'completed',
      ),
      requests: gateway.records,
    };
  } catch (error) {
    report = { engine, failure: String(error.message).split(':')[0] };
  } finally {
    await adapter?.close();
    await gateway.close();
  }
  const reportPath = join(directory, 'evidence.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  return { report, reportPath };
}

// A distinct live-engine cancellation probe: interrupt a tool after its side
// effect, keep the native engine alive long enough to inspect terminal state.
export async function nativeInterruption({ engine, root = defaultProfileRoot() }) {
  const directory = join(root, 'interruption-' + engine + '-' + randomUUID().slice(0, 8));
  await mkdir(directory, { recursive: true });
  const gateway = await modelGateway({ scenario: 'uncertain-mutation' });
  const events = [];
  let adapter;
  let running;
  let report;
  let finish;
  let timer;
  const terminal = new Promise((resolve) => {
    finish = resolve;
  });
  const bounded = (promise) =>
    Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('INTERRUPTION_TIMEOUT')), 10000);
      }),
    ]).finally(() => clearTimeout(timer));
  try {
    adapter = await engineAdapter(engine, {
      root: directory,
      gateway,
      scenario: 'uncertain-mutation',
      onEvent: (event) => {
        events.push(event);
        if (event.kind === 'terminal') finish(event);
      },
    });
    running = adapter.run('Call evaluation_checkpoint once.').catch(() => {});
    const markerPath = join(adapter.workspace, 'mutation-marker.txt');
    const until = Date.now() + 15000;
    let marker;
    while (Date.now() < until) {
      try {
        marker = await readFile(markerPath, 'utf8');
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    if (!marker) throw new Error('MUTATION_NOT_REACHED');
    const startedAt = Date.now();
    await bounded(adapter.interrupt());
    const outcome = await bounded(terminal);
    report = {
      engine,
      pinnedVersion: PINS[engine],
      scope: 'Native interruption while a harness fault tool awaits its result',
      outcome: outcome.outcome,
      interruptionMs: Date.now() - startedAt,
      markerPreservedOnce: (await readFile(markerPath, 'utf8')) === 'applied\n',
      terminalOutcomes: events
        .filter((event) => event.kind === 'terminal')
        .map((event) => event.outcome),
      nativeSnapshot: await adapter.snapshot(),
      requests: gateway.records,
    };
  } catch (error) {
    report = { engine, pinnedVersion: PINS[engine], failure: String(error.message).split(':')[0] };
  } finally {
    await adapter?.close();
    await running;
    await gateway.close();
  }
  const reportPath = join(directory, 'evidence.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  return { report, reportPath };
}
