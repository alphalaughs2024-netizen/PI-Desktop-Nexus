import test from 'node:test';
import assert from 'node:assert/strict';
import { Timeline, StreamBatcher } from './timeline.mjs';
import { codexEvent, openCodeEvent } from './adapters.mjs';
import { freeModel, modelGateway, TEST_IMAGE } from './gateway.mjs';
import { launcher, PINS } from './process.mjs';

test('whole user turn survives tool cycles, approvals, and exactly one terminal event', () => {
  let clock = 100;
  const timeline = new Timeline({ now: () => clock });
  const token = timeline.begin('pi', 'fixture');
  clock = 200;
  timeline.accept({ kind: 'phase', phase: 'waiting-model' }, token);
  clock = 500;
  timeline.accept({ kind: 'phase', phase: 'tool' }, token);
  clock = 700;
  timeline.accept({ kind: 'phase', phase: 'approval' }, token);
  clock = 1700;
  timeline.accept({ kind: 'phase', phase: 'waiting-model' }, token);
  clock = 2000;
  timeline.accept({ kind: 'terminal', outcome: 'completed' }, token);
  assert.equal(timeline.accept({ kind: 'terminal', outcome: 'completed' }, token), false);
  const s = timeline.snapshot();
  assert.equal(s.turn.elapsedMs, 1900);
  assert.equal(s.turn.terminalEvents, 1);
  assert.equal(
    Object.values(s.turn.phaseMs).reduce((a, b) => a + b),
    1900,
  );
});
test('new generations reject late deltas and terminal events from the preceding request', () => {
  const t = new Timeline();
  const old = t.begin('codex', 'fixture');
  t.accept({ kind: 'terminal', outcome: 'interrupted' }, old);
  const current = t.begin('codex', 'fixture');
  assert.equal(t.accept({ kind: 'item', id: 'old', delta: 'stale' }, old), false);
  t.accept({ kind: 'item', id: 'new', type: 'assistant', delta: 'current' }, current);
  assert.deepEqual(
    t.snapshot().items.map((i) => i.text),
    ['current'],
  );
});
test('duplicate transport notifications do not duplicate response text', () => {
  const t = new Timeline();
  t.begin('codex', 'fixture');
  const event = { kind: 'item', id: 'm', type: 'assistant', delta: 'hello', eventId: 'same' };
  t.accept(event);
  t.accept(event);
  assert.equal(t.snapshot().items[0].text, 'hello');
});
test('first token is immediate and buffered deltas are delivered before terminal state', () => {
  const delivered = [];
  let callback;
  const b = new StreamBatcher((e) => delivered.push(e), {
    schedule: (f) => {
      callback = f;
      return 1;
    },
    cancel: () => {},
  });
  b.push({ kind: 'item', id: 'a', delta: 'one' });
  assert.equal(delivered.length, 1);
  b.push({ kind: 'item', id: 'a', delta: 'two' });
  b.push({ kind: 'item', id: 'a', delta: 'three' });
  assert.equal(delivered.length, 1);
  b.push({ kind: 'terminal', outcome: 'completed' });
  assert.equal(delivered[1].delta, 'twothree');
  assert.equal(delivered[2].kind, 'terminal');
});
test('evidence export excludes visible text and tool argument content', () => {
  const t = new Timeline();
  t.begin('pi', 'fixture');
  t.accept({
    kind: 'item',
    id: 'a',
    type: 'assistant',
    text: 'private-content',
    args: { key: 'sensitive' },
  });
  const exportText = JSON.stringify(t.evidence());
  assert(!exportText.includes('private-content'));
  assert(!exportText.includes('sensitive'));
});
test('Codex interruption is not completed; OpenCode events cannot cross session boundaries', () => {
  assert.equal(
    codexEvent({ method: 'turn/completed', params: { turn: { status: 'interrupted' } } }).outcome,
    'interrupted',
  );
  assert.equal(
    openCodeEvent({ type: 'session.error', properties: { sessionID: 'other' } }, 'current'),
    null,
  );
});
test('paid, unknown, and non-tool models cannot enter a cloud trial', () => {
  const catalog = {
    data: [
      {
        id: 'ok',
        access_tier: 'free',
        pricing: { input: 0, output: 0 },
        capabilities: { tools: true },
      },
      {
        id: 'paid',
        access_tier: 'free',
        pricing: { input: 1, output: 0 },
        capabilities: { tools: true },
      },
    ],
  };
  assert.equal(freeModel(catalog, 'ok').id, 'ok');
  assert.throws(() => freeModel(catalog, 'paid'));
  assert.throws(() => freeModel(catalog, 'unknown'));
});
test('loopback fixture counts image payloads and caps requests without inference', async () => {
  const gateway = await modelGateway({ maxRequests: 1, delayMs: 0 });
  try {
    const body = {
      model: gateway.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'data:image/png;base64,' + TEST_IMAGE } },
          ],
        },
      ],
    };
    const first = await fetch(gateway.baseUrl + '/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    assert.equal(first.status, 200);
    await first.text();
    assert.equal(gateway.records[0].imageCount, 1);
    const second = await fetch(gateway.baseUrl + '/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    assert.equal(second.status, 429);
  } finally {
    await gateway.close();
  }
});

import { OpenCodeProjection } from './adapters.mjs';
import { jsonEvents } from './stream.mjs';
import { serve } from './server.mjs';

test('SSE preserves split UTF-8 and CRLF, and rejects truncated frames', async () => {
  const bytes = Buffer.from('data: {"text":"東京 🌲"}\r\n\r\n');
  async function* chunks() {
    for (const byte of bytes) yield Buffer.from([byte]);
  }
  const received = [];
  for await (const e of jsonEvents(chunks())) received.push(e);
  assert.deepEqual(received, [{ text: '東京 🌲' }]);
  await assert.rejects(async () => {
    for await (const e of jsonEvents([Buffer.from('data: {"unfinished":true}')])) void e;
  }, /TRUNCATED/);
});
test('OpenCode projects only assistant parts and keeps reasoning delta identity', () => {
  const p = new OpenCodeProjection('s');
  const message = (id, role) =>
    p.project({ type: 'message.updated', properties: { info: { id, role, sessionID: 's' } } });
  const part = (id, messageID, type) =>
    p.project({
      type: 'message.part.updated',
      properties: { part: { id, messageID, type, sessionID: 's', text: 'initial' } },
    });
  message('u', 'user');
  assert.equal(part('up', 'u', 'text'), null);
  message('a', 'assistant');
  assert.equal(part('rp', 'a', 'reasoning').type, 'reasoning');
  assert.equal(
    p.project({
      type: 'message.part.delta',
      properties: { sessionID: 's', partID: 'rp', field: 'text', delta: 'next' },
    }).type,
    'reasoning',
  );
  assert.equal(
    p.project({
      type: 'message.part.delta',
      properties: { sessionID: 'other', partID: 'rp', delta: 'wrong' },
    }),
    null,
  );
});
test('Codex exposes failed tool errors and never projects user text as assistant text', () => {
  assert.equal(
    codexEvent({
      method: 'item/started',
      params: { item: { id: 'u', type: 'userMessage', text: 'user' } },
    }),
    null,
  );
  const e = codexEvent({
    method: 'item/completed',
    params: {
      item: {
        id: 'tool',
        type: 'mcpToolCall',
        status: 'failed',
        error: { message: 'approval required' },
      },
    },
  });
  assert.equal(e.type, 'tool');
  assert.equal(e.status, 'failed');
  assert.equal(e.text, 'approval required');
});
test('live elapsed time advances without a new model event', () => {
  let now = 100;
  const t = new Timeline({ now: () => now });
  t.begin('pi', 'fixture');
  now = 4100;
  assert.equal(t.snapshot().turn.elapsedMs, 4000);
  assert.equal(t.snapshot().turn.phaseMs.preparing, 4000);
});
test('dashboard rejects missing tokens, cross-origin access and cloud runs without authorization', async () => {
  let calls = 0;
  const server = await serve({
    inspect: async () => ({ engines: {} }),
    evaluateRun: async () => {
      calls++;
    },
  });
  const url = new URL(server.address);
  const token = url.hash.slice(1);
  const base = url.origin;
  try {
    assert.equal((await fetch(base + '/state')).status, 403);
    assert.equal(
      (await fetch(base + '/state?token=' + token, { headers: { Origin: 'https://example.com' } }))
        .status,
      403,
    );
    assert.equal((await fetch(base + '/state?token=' + token)).status, 200);
    assert.equal(
      (
        await fetch(base + '/run?token=' + token, {
          method: 'POST',
          body: JSON.stringify({ engine: 'pi', mode: 'xkiro' }),
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(base + '/run?token=' + token, { method: 'POST', body: 'null' })).status,
      403,
    );
    assert.equal(calls, 0);
  } finally {
    await server.close();
  }
});
test('dashboard owns one run and aborts it on stop while retaining partial output', async () => {
  let started;
  const began = new Promise((r) => {
    started = r;
  });
  const server = await serve({
    inspect: async () => ({ engines: {} }),
    evaluateRun: async ({ signal, onUpdate }) => {
      const snapshot = {
        turn: { acceptedAt: Date.now(), endedAt: null, phase: 'waiting-model' },
        items: [{ text: 'partial' }],
      };
      onUpdate(snapshot);
      started();
      await new Promise((r) => signal.addEventListener('abort', r, { once: true }));
      return {
        snapshot: {
          ...snapshot,
          turn: { ...snapshot.turn, endedAt: Date.now(), outcome: 'interrupted' },
        },
        reportPath: 'fixture-report',
      };
    },
  });
  const url = new URL(server.address);
  const endpoint = (path) => url.origin + path + '?token=' + url.hash.slice(1);
  try {
    assert.equal(
      (
        await fetch(endpoint('/run'), {
          method: 'POST',
          body: JSON.stringify({ engine: 'pi', mode: 'fixture' }),
        })
      ).status,
      202,
    );
    await began;
    assert.equal(
      (
        await fetch(endpoint('/run'), {
          method: 'POST',
          body: JSON.stringify({ engine: 'pi', mode: 'fixture' }),
        })
      ).status,
      409,
    );
    await fetch(endpoint('/interrupt'), { method: 'POST' });
    const state = await (await fetch(endpoint('/state'))).json();
    assert.equal(state.snapshot.items[0].text, 'partial');
    assert.equal(state.snapshot.turn.outcome, 'interrupted');
  } finally {
    await server.close();
  }
});

import { companion } from './companion.mjs';
import { customCodexCatalog } from './codex-profile.mjs';
import { workspaceFor } from './process.mjs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
async function removeOwnedFixture(root, prefix) {
  const absolute = resolve(root);
  assert.equal(dirname(absolute), resolve(tmpdir()));
  assert(basename(absolute).startsWith(prefix));
  await rm(absolute, { recursive: true });
}

test('explicit Codex metadata enables native patch without borrowing a foreground catalog', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nexus-evaluation-catalog-'));
  try {
    const result = await customCodexCatalog(root, 'evaluation-model');
    const { models } = JSON.parse(await readFile(result.path, 'utf8'));
    assert.equal(models.length, 1);
    assert.equal(models[0].slug, 'evaluation-model');
    assert.equal(models[0].apply_patch_tool_type, 'freeform');
    assert.equal(models[0].supports_reasoning_summary_parameter, false);
    assert.deepEqual(models[0].input_modalities, ['text', 'image']);
    assert(!JSON.stringify(models).includes('gpt-5.5'));
  } finally {
    await removeOwnedFixture(root, 'nexus-evaluation-catalog-');
  }
});
test('raw Codex patch validation errors become failed items with the original call identity', () => {
  const calls = new Map();
  const started = codexEvent(
    {
      method: 'rawResponseItem/completed',
      params: {
        item: {
          type: 'custom_tool_call',
          name: 'apply_patch',
          call_id: 'patch-1',
          input: 'private arguments',
        },
      },
    },
    calls,
  );
  assert.equal(started.status, 'running');
  assert(!JSON.stringify(started).includes('private arguments'));
  const failed = codexEvent(
    {
      method: 'rawResponseItem/completed',
      params: {
        item: {
          type: 'custom_tool_call_output',
          call_id: 'patch-1',
          output: 'apply_patch verification failed: expected text missing',
        },
      },
    },
    calls,
  );
  assert.equal(failed.id, started.id);
  assert.equal(failed.status, 'failed');
});
test('private workspace selection remains stable on recovery and outside AppData', () => {
  const workspace = workspaceFor(join(tmpdir(), 'unique-run'), 'codex');
  assert.equal(workspace, workspaceFor(join(tmpdir(), 'unique-run'), 'codex'));
  assert.notEqual(workspace, workspaceFor(join(tmpdir(), 'another-run'), 'codex'));
  if (process.env.LOCALAPPDATA)
    assert(!workspace.toLowerCase().startsWith(process.env.LOCALAPPDATA.toLowerCase()));
});
test('SSE size limit rejects a complete oversized frame rather than only unfinished frames', async () => {
  await assert.rejects(async () => {
    for await (const value of jsonEvents([Buffer.from('data: {"text":"東京東京東京"}\n\n')], {
      maxFrameBytes: 20,
    }))
      void value;
  }, /SSE_FRAME_TOO_LARGE/);
});
test('pending companion mutation returns on abort and cannot execute after shutdown', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nexus-evaluation-companion-'));
  const service = await companion(root, { mutationProbe: true });
  const controller = new AbortController();
  try {
    const pending = assert.rejects(
      service.execute('evaluation_checkpoint', {}, { signal: controller.signal }),
      /MUTATION_RESULT_INTERRUPTED/,
    );
    const deadline = Date.now() + 3000;
    while (!service.records.some((record) => record.kind === 'mutation') && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 10));
    assert.equal(await readFile(join(root, 'mutation-marker.txt'), 'utf8'), 'applied\n');
    controller.abort();
    await pending;
    await service.close();
    await assert.rejects(service.execute('evaluation_checkpoint', {}), /COMPANION_CLOSED/);
    assert.equal(await readFile(join(root, 'mutation-marker.txt'), 'utf8'), 'applied\n');
  } finally {
    await service.close();
    await removeOwnedFixture(root, 'nexus-evaluation-companion-');
  }
});

import { timingSummary } from './timing.mjs';
test('provider timing excludes post-turn requests and merges concurrent intervals', () => {
  const timing = timingSummary(
    { acceptedAt: 100, endedAt: 300, elapsedMs: 200, phaseMs: { tool: 100, 'waiting-model': 100 } },
    [
      { startedAt: 50, endedAt: 180 },
      { startedAt: 160, endedAt: 220 },
      { startedAt: 290, endedAt: 400 },
      { startedAt: 500, endedAt: 600 },
      { startedAt: 250 },
    ],
  );
  assert.equal(timing.providerHttpUnionWithinTurnMs, 130);
  assert.equal(timing.incompleteProviderRequests, 1);
  assert.equal(timing.totalMs, 200);
});

test('turn timer includes preparation since acceptance and exposes output truncation', () => {
  const timeline = new Timeline({ now: () => 1200 });
  timeline.begin('codex', 'fixture', 1000);
  assert.equal(timeline.snapshot().turn.elapsedMs, 200);
  assert.equal(timeline.snapshot().turn.phaseMs.preparing, 200);
  timeline.accept({ kind: 'item', id: 'long', type: 'tool', text: 'x'.repeat(1024 * 1024 + 1) });
  assert.equal(timeline.snapshot().items[0].text.length, 1024 * 1024);
  assert.equal(timeline.evidence().items[0].truncated, true);
});
