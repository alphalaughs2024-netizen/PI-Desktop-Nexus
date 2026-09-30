import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash, createDecipheriv } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { homedir } from 'node:os';

export { TEST_IMAGE } from './test-image.mjs';
export async function xkiroCredential(dataRoot = join(homedir(), '.pi-desktop-nexus')) {
  const db = new DatabaseSync(join(dataRoot, 'pi.sqlite'), { readOnly: true });
  let provider;
  try {
    provider = db
      .prepare('SELECT id, base_url, secret_ref FROM providers WHERE lower(name)=? AND enabled=1')
      .get('xkiro');
  } finally {
    db.close();
  }
  if (!provider || new URL(provider.base_url).origin !== 'https://api.xkiro.com')
    throw new Error('XKIRO_PROVIDER_NOT_CONFIGURED');
  const secretRef = provider.secret_ref || `secret:provider:${provider.id}:api_key`;
  const key = await readFile(join(dataRoot, 'secrets/.machine-key'));
  const hash = createHash('sha256').update(secretRef).digest('hex');
  const encrypted = Buffer.from(
    (await readFile(join(dataRoot, 'secrets', hash + '.bin'), 'utf8')).trim(),
    'base64',
  );
  try {
    const cipher = createDecipheriv('aes-256-gcm', key, encrypted.subarray(0, 12));
    cipher.setAuthTag(encrypted.subarray(-16));
    return Buffer.concat([cipher.update(encrypted.subarray(12, -16)), cipher.final()]);
  } finally {
    key.fill(0);
    encrypted.fill(0);
  }
}
export function freeModel(catalog, id) {
  const model = catalog.data?.find((item) => item.id === id);
  if (
    !model ||
    model.access_tier !== 'free' ||
    model.pricing?.input !== 0 ||
    model.pricing?.output !== 0 ||
    !model.capabilities?.tools
  )
    throw new Error('MODEL_NOT_VERIFIED_FREE_WITH_TOOLS');
  return model;
}
function countImages(value) {
  if (!value || typeof value !== 'object') return 0;
  if (value.type === 'input_image' || value.type === 'image_url') return 1;
  return Object.values(value).reduce(
    (sum, child) =>
      sum +
      (Array.isArray(child) ? child.reduce((n, v) => n + countImages(v), 0) : countImages(child)),
    0,
  );
}
export async function modelGateway({
  mode = 'fixture',
  model = 'nexus-fixture',
  delayMs = 250,
  maxRequests = 8,
  credential,
  scenario = 'text',
  fixturePath,
  requireVision = false,
} = {}) {
  if (!['fixture', 'xkiro'].includes(mode)) throw new Error('UNKNOWN_MODEL_SOURCE');
  const records = [];
  const preparation = { catalogMs: 0, credentialMs: 0 };
  let secret;
  let stopped = false;
  let capabilities = { vision: true, tools: true };
  if (mode === 'xkiro') {
    const catalogAt = Date.now();
    const catalog = await (
      await fetch('https://api.xkiro.com/v1/models', { signal: AbortSignal.timeout(15000) })
    ).json();
    preparation.catalogMs = Date.now() - catalogAt;
    const selected = freeModel(catalog, model);
    capabilities = selected.capabilities;
    if (requireVision && !selected.capabilities?.vision)
      throw new Error('MODEL_DOES_NOT_SUPPORT_VISION');
    const credentialAt = Date.now();
    secret = credential ? Buffer.from(credential) : await xkiroCredential();
    preparation.credentialMs = Date.now() - credentialAt;
  }
  const server = createServer(async (request, response) => {
    try {
      if (request.headers.origin || request.headers.host !== `127.0.0.1:${server.address().port}`) {
        response.writeHead(403).end();
        return;
      }
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (request.method === 'GET' && pathname.endsWith('/models')) {
        response.setHeader('Content-Type', 'application/json');
        response.end(
          JSON.stringify({
            object: 'list',
            data: [{ id: model, object: 'model', created: 0, owned_by: 'evaluation' }],
          }),
        );
        return;
      }
      if (
        request.method !== 'POST' ||
        !['/v1/chat/completions', '/v1/responses'].includes(pathname)
      ) {
        response.writeHead(404).end();
        return;
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 4 * 1024 * 1024) throw new Error('REQUEST_TOO_LARGE');
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (body.model !== model || records.length >= maxRequests || stopped) {
        response
          .writeHead(429)
          .end(
            JSON.stringify({ error: { message: 'Evaluation request limit or model mismatch' } }),
          );
        return;
      }
      const record = {
        sequence: records.length + 1,
        api: pathname,
        startedAt: Date.now(),
        imageCount: countImages(body),
        toolCount: body.tools?.length ?? 0,
        toolNames: (body.tools ?? []).flatMap((tool) =>
          tool.name
            ? [tool.name]
            : tool.function?.name
              ? [tool.function.name]
              : (tool.tools ?? []).map((child) => child.name),
        ),
      };
      record.toolGroups = (body.tools ?? []).map((tool) => ({
        type: tool.type,
        name: tool.name ?? tool.function?.name,
        children: (tool.tools ?? []).map((child) => child.name),
      }));
      records.push(record);
      if (mode === 'xkiro') {
        // This relay forwards only to the user-selected provider. It performs no API translation.
        body.max_tokens = Math.min(body.max_tokens ?? 1024, 2048);
        if (pathname.endsWith('/responses')) {
          delete body.max_tokens;
          body.max_output_tokens = Math.min(body.max_output_tokens ?? 1024, 2048);
        }
        const controller = new AbortController();
        response.on('close', () => controller.abort());
        const upstream = await fetch('https://api.xkiro.com' + pathname, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + secret.toString('utf8'),
          },
          body: JSON.stringify(body),
          redirect: 'manual',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]),
        });
        record.httpStatus = upstream.status;
        record.headersAt = Date.now();
        if (!upstream.ok) {
          await upstream.body?.cancel();
          record.endedAt = Date.now();
          response.writeHead(upstream.status, { 'Content-Type': 'application/json' }).end(
            JSON.stringify({
              error: {
                message: 'xkiro returned HTTP ' + upstream.status,
                type: 'provider_error',
                code: 'XKIRO_HTTP_' + upstream.status,
              },
            }),
          );
          return;
        }
        response.writeHead(upstream.status, {
          'Content-Type': upstream.headers.get('content-type') || 'application/json',
        });
        let streamBuffer = '';
        const decoder = new TextDecoder();
        record.outputToolCalls = [];
        record.providerEventKinds = {};
        for await (const chunk of upstream.body) {
          streamBuffer += decoder.decode(chunk, { stream: true });
          streamBuffer = streamBuffer.replaceAll('\r\n', '\n');
          let boundary;
          while ((boundary = streamBuffer.indexOf('\n\n')) >= 0) {
            const frame = streamBuffer.slice(0, boundary);
            if (Buffer.byteLength(frame) > 1024 * 1024) throw new Error('SSE_FRAME_TOO_LARGE');
            streamBuffer = streamBuffer.slice(boundary + 2);
            const json = frame
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trim())
              .join('\n');
            let event;
            try {
              event = JSON.parse(json);
            } catch {
              continue;
            }
            const kind = event.type ?? event.object ?? 'unknown';
            record.providerEventKinds[kind] = (record.providerEventKinds[kind] ?? 0) + 1;
            if (
              event.item?.name &&
              record.outputToolCalls.length < 32 &&
              !record.outputToolCalls.some((call) => call.id === event.item.call_id)
            )
              record.outputToolCalls.push({
                id: event.item.call_id,
                name: event.item.name,
                namespace: event.item.namespace,
                type: event.item.type,
              });
            for (const call of event.choices?.[0]?.delta?.tool_calls ?? []) {
              if (call.function?.name && record.outputToolCalls.length < 32)
                record.outputToolCalls.push({
                  id: call.id,
                  name: call.function.name,
                  type: call.type,
                });
            }
          }
          if (Buffer.byteLength(streamBuffer) > 1024 * 1024) throw new Error('SSE_FRAME_TOO_LARGE');
          if (!record.firstByteAt) record.firstByteAt = Date.now();
          if (!response.destroyed) response.write(chunk);
        }
        streamBuffer += decoder.decode();
        if (streamBuffer.trim()) throw new Error('TRUNCATED_SSE_FRAME');
        record.endedAt = Date.now();
        response.end();
        return;
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
      if (stopped || response.destroyed) return;
      if (
        body.tools?.length &&
        (scenario === 'provider-failure' ||
          (scenario === 'partial-failure' && records.filter((r) => r.toolCount > 0).length > 1))
      ) {
        record.httpStatus = 401;
        record.endedAt = Date.now();
        response.writeHead(401, { 'Content-Type': 'application/json' }).end(
          JSON.stringify({
            error: { message: 'Scripted authentication failure', type: 'authentication_error' },
          }),
        );
        return;
      }
      record.httpStatus = 200;
      record.headersAt = Date.now();
      record.firstByteAt = Date.now();
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const tools = (body.tools ?? []).flatMap((tool) =>
        tool.function
          ? [tool.function]
          : tool.type === 'namespace'
            ? (tool.tools ?? []).map((child) => ({ ...child, namespace: tool.name }))
            : [tool],
      );
      const results =
        (body.messages ?? []).filter((m) => m.role === 'tool').length +
        (body.input ?? []).filter((m) =>
          ['function_call_output', 'custom_tool_call_output'].includes(m.type),
        ).length;
      const wanted =
        scenario === 'uncertain-mutation'
          ? 'evaluation_checkpoint'
          : scenario === 'browser'
            ? results < 2
              ? 'evaluation_preview'
              : 'evaluation_browser'
            : scenario === 'stale-edit' && results > 0
              ? 'edit'
              : 'read';
      const tool = tools.find((tool) =>
        wanted.startsWith('evaluation_')
          ? tool.name?.endsWith(wanted)
          : wanted === 'edit'
            ? ['edit', 'apply_patch'].includes(tool.name)
            : ['evaluation_read', 'read', 'exec_command'].includes(tool.name),
      );
      const hasResult =
        (body.messages ?? []).some((m) => m.role === 'tool') ||
        (body.input ?? []).some((m) =>
          ['function_call_output', 'custom_tool_call_output'].includes(m.type),
        );
      if (
        ((['read', 'partial-failure'].includes(scenario) && !hasResult) ||
          (scenario === 'stale-edit' && results < 2) ||
          (scenario === 'browser' && results < 4) ||
          (scenario === 'uncertain-mutation' && results === 0)) &&
        tool
      ) {
        const args =
          scenario === 'uncertain-mutation'
            ? {}
            : scenario === 'browser'
              ? results < 2
                ? { action: results === 0 ? 'start' : 'status' }
                : { viewport: results === 2 ? 'desktop' : 'mobile' }
              : tool.name === 'edit'
                ? tool.parameters?.properties?.edits
                  ? {
                      path: fixturePath,
                      edits: [
                        { oldText: 'THIS OLD CONTENT IS NOT IN THE FILE', newText: 'corrupted' },
                      ],
                    }
                  : {
                      filePath: fixturePath,
                      oldString: 'THIS OLD CONTENT IS NOT IN THE FILE',
                      newString: 'corrupted',
                    }
                : tool.name === 'evaluation_read'
                  ? {}
                  : tool.name === 'read'
                    ? tool.parameters?.properties?.path
                      ? { path: fixturePath }
                      : { filePath: fixturePath }
                    : {
                        cmd: "Get-Content -LiteralPath 'evaluation-note.txt'",
                        yield_time_ms: 1000,
                        max_output_tokens: 512,
                      };
        const call = {
          id: 'fixture-call-' + results,
          type: tool.type === 'custom' ? 'custom_tool_call' : 'function_call',
          status: 'completed',
          call_id: 'fixture-call-' + results,
          name: tool.name,
          ...(tool.namespace ? { namespace: tool.namespace } : {}),
          ...(tool.type === 'custom'
            ? {
                input:
                  '*** Begin Patch\n*** Update File: evaluation-note.txt\n@@\n-THIS OLD CONTENT IS NOT IN THE FILE\n+corrupted\n*** End Patch',
              }
            : { arguments: JSON.stringify(args) }),
        };
        if (pathname.endsWith('/chat/completions')) {
          response.write(
            'data: ' +
              JSON.stringify({
                id: 'fixture',
                object: 'chat.completion.chunk',
                created: 0,
                model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      role: 'assistant',
                      tool_calls: [
                        {
                          index: 0,
                          id: call.call_id,
                          type: 'function',
                          function: { name: call.name, arguments: call.arguments },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              }) +
              '\n\n',
          );
          response.write(
            'data: ' +
              JSON.stringify({
                id: 'fixture',
                object: 'chat.completion.chunk',
                created: 0,
                model,
                choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
              }) +
              '\n\n',
          );
          response.write('data: [DONE]\n\n');
        } else {
          const send = (type, payload) =>
            response.write(
              'event: ' + type + '\ndata: ' + JSON.stringify({ type, ...payload }) + '\n\n',
            );
          send('response.created', {
            response: { id: 'fixture', object: 'response', status: 'in_progress', output: [] },
          });
          send('response.output_item.added', {
            output_index: 0,
            item: {
              ...call,
              status: 'in_progress',
              ...(call.type === 'custom_tool_call' ? { input: '' } : { arguments: '' }),
            },
          });
          if (call.type === 'custom_tool_call') {
            send('response.custom_tool_call_input.delta', {
              item_id: call.id,
              output_index: 0,
              delta: call.input,
            });
            send('response.custom_tool_call_input.done', {
              item_id: call.id,
              output_index: 0,
              input: call.input,
            });
          } else {
            send('response.function_call_arguments.delta', {
              item_id: call.id,
              output_index: 0,
              delta: call.arguments,
            });
            send('response.function_call_arguments.done', {
              item_id: call.id,
              output_index: 0,
              arguments: call.arguments,
            });
          }
          send('response.output_item.done', { output_index: 0, item: call });
          send('response.completed', {
            response: {
              id: 'fixture',
              object: 'response',
              status: 'completed',
              output: [call],
              usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
            },
          });
        }
        record.endedAt = Date.now();
        response.end();
        return;
      }
      if (pathname.endsWith('/chat/completions')) {
        const delta = {
          role: 'assistant',
          content: 'Fixture response. This proves transport, not model quality.',
        };
        response.write(
          'data: ' +
            JSON.stringify({
              id: 'fixture',
              object: 'chat.completion.chunk',
              created: 0,
              model,
              choices: [{ index: 0, delta, finish_reason: null }],
            }) +
            '\n\n',
        );
        response.write(
          'data: ' +
            JSON.stringify({
              id: 'fixture',
              object: 'chat.completion.chunk',
              created: 0,
              model,
              choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            }) +
            '\n\n',
        );
        response.write('data: [DONE]\n\n');
      } else {
        const item = {
          id: 'message-fixture',
          type: 'message',
          status: 'completed',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Fixture response. This proves transport, not model quality.',
              annotations: [],
            },
          ],
        };
        const send = (type, payload) =>
          response.write(
            'event: ' + type + '\ndata: ' + JSON.stringify({ type, ...payload }) + '\n\n',
          );
        send('response.created', {
          response: { id: 'fixture', object: 'response', status: 'in_progress', output: [] },
        });
        send('response.output_item.added', {
          output_index: 0,
          item: { ...item, status: 'in_progress', content: [] },
        });
        send('response.content_part.added', {
          item_id: item.id,
          output_index: 0,
          content_index: 0,
          part: { type: 'output_text', text: '', annotations: [] },
        });
        send('response.output_text.delta', {
          item_id: item.id,
          output_index: 0,
          content_index: 0,
          delta: item.content[0].text,
        });
        send('response.output_text.done', {
          item_id: item.id,
          output_index: 0,
          content_index: 0,
          text: item.content[0].text,
        });
        send('response.output_item.done', { output_index: 0, item });
        send('response.completed', {
          response: {
            id: 'fixture',
            object: 'response',
            status: 'completed',
            output: [item],
            usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
          },
        });
      }
      record.endedAt = Date.now();
      response.end();
    } catch {
      if (!response.headersSent) response.writeHead(502);
      if (!response.destroyed)
        response.end(
          JSON.stringify({
            error: { message: 'Evaluation upstream failed; inspect metadata report' },
          }),
        );
    }
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  return {
    baseUrl: 'http://127.0.0.1:' + server.address().port + '/v1',
    model,
    mode,
    capabilities,
    preparation,
    records,
    async close() {
      stopped = true;
      server.closeAllConnections();
      await new Promise((resolveClose) => server.close(resolveClose));
      secret?.fill(0);
    },
  };
}
