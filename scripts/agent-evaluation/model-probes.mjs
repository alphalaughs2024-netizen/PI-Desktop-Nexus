import { modelGateway, TEST_IMAGE } from './gateway.mjs';
import { jsonEvents } from './stream.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaultProfileRoot } from './process.mjs';

async function completion(gateway, messages, tools = []) {
  const response = await fetch(gateway.baseUrl + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: gateway.model, messages, tools, stream: true, max_tokens: 2048 }),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error('MODEL_PROBE_HTTP_' + response.status);
  let text = '';
  const calls = new Map();
  let finishReason;
  for await (const event of jsonEvents(response.body)) {
    const choice = event.choices?.[0];
    text += choice?.delta?.content ?? '';
    finishReason = choice?.finish_reason ?? finishReason;
    for (const delta of choice?.delta?.tool_calls ?? []) {
      const previous = calls.get(delta.index) ?? {
        id: '',
        type: 'function',
        function: { name: '', arguments: '' },
      };
      if (delta.id) previous.id = delta.id;
      previous.function.name += delta.function?.name ?? '';
      previous.function.arguments += delta.function?.arguments ?? '';
      calls.set(delta.index, previous);
    }
  }
  return {
    message: { role: 'assistant', content: text || null, tool_calls: [...calls.values()] },
    text,
    calls: [...calls.values()],
    finishReason,
  };
}

// Same simple prompts across models. These are provider/model probes, not engine trials.
export async function probeModel({ model, credential, root = defaultProfileRoot() }) {
  const gateway = await modelGateway({ mode: 'xkiro', model, credential });
  const startedAt = Date.now();
  const results = {};
  try {
    const messages = [
      {
        role: 'user',
        content:
          'Read the fixture with read_fixture. Return its exact contents, without guessing. The tool needs no arguments.',
      },
    ];
    const tools = [
      {
        type: 'function',
        function: {
          name: 'read_fixture',
          description: 'Read the private evaluation fixture.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      },
    ];
    const first = await completion(gateway, messages, tools);
    const call = first.calls[0];
    results.toolRequest = {
      passed: first.calls.length === 1 && call?.function.name === 'read_fixture',
      finishReason: first.finishReason,
    };
    if (results.toolRequest.passed) {
      messages.push(first.message, {
        role: 'tool',
        tool_call_id: call.id,
        content: 'Nexus fixture: violet lantern, number 47.',
      });
      const final = await completion(gateway, messages, tools);
      results.toolResult = {
        passed:
          final.calls.length === 0 &&
          final.text.includes('violet lantern') &&
          final.text.includes('47'),
        finishReason: final.finishReason,
      };
    }
    if (gateway.capabilities.vision) {
      const image = await completion(gateway, [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'What single solid color fills this image? Answer only the color.',
            },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,' + TEST_IMAGE } },
          ],
        },
      ]);
      results.vision = {
        passed: /^red[.!]?$/i.test(image.text.trim()),
        finishReason: image.finishReason,
      };
    } else
      results.vision = { passed: false, reason: 'Catalog declares no vision support; not sent.' };
    const coding = await completion(gateway, [
      {
        role: 'user',
        content:
          'Return only JSON with keys oldText and newText. Fix this JavaScript function so it handles an empty array and computes the numeric sum. oldText must be an exact copy of the provided source. Source: function sum(xs) { return xs.reduce((a, b) => a + b); }',
      },
    ]);
    let patch;
    try {
      patch = JSON.parse(
        coding.text.trim().replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/g, ''),
      );
    } catch {}
    results.coding = {
      passed:
        patch?.oldText === 'function sum(xs) { return xs.reduce((a, b) => a + b); }' &&
        typeof patch?.newText === 'string' &&
        /reduce\s*\([\s\S]*,\s*0\s*\)/.test(patch.newText),
      scope: 'Tiny content-anchored code patch; no website-quality claim.',
    };
  } catch (error) {
    results.failure = String(error.message).slice(0, 150);
  } finally {
    await gateway.close();
  }
  const report = {
    schemaVersion: 1,
    scope: 'Provider/model probe, not engine performance',
    model,
    startedAt,
    elapsedMs: Date.now() - startedAt,
    results,
    requests: gateway.records,
  };
  const directory = join(root, 'model-probe-' + randomUUID().slice(0, 8));
  await mkdir(directory, { recursive: true });
  const reportPath = join(directory, 'evidence.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  return { report, reportPath };
}
