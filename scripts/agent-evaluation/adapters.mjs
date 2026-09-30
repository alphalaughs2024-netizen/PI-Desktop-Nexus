import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launcher, JsonRpcProcess, profile, stopProcess } from './process.mjs';
import { TEST_IMAGE } from './gateway.mjs';
import { jsonEvents } from './stream.mjs';
import { pathToFileURL } from 'node:url';
import { companion } from './companion.mjs';
import { customCodexCatalog } from './codex-profile.mjs';
import { fileURLToPath } from 'node:url';

function itemType(type = '') {
  if (/reason/i.test(type)) return 'reasoning';
  if (/command|tool|fileChange|mcp/i.test(type)) return 'tool';
  return 'assistant';
}
export function codexEvent(event, rawCalls = new Map()) {
  const p = event.params ?? {};
  if (event.method === 'rawResponseItem/completed') {
    const item = p.item;
    if (['function_call', 'custom_tool_call'].includes(item?.type)) {
      rawCalls.set(item.call_id, item.name);
      return { kind: 'item', id: item.call_id, type: 'tool', label: item.name, status: 'running' };
    }
    if (['function_call_output', 'custom_tool_call_output'].includes(item?.type)) {
      const name = rawCalls.get(item.call_id);
      // Typed notifications own ordinary tools. Raw patch output covers validation
      // failures that occur before the engine emits a fileChange item.
      if (!['apply_patch', 'write_stdin'].includes(name)) return null;
      const text = typeof item.output === 'string' ? item.output : '';
      return {
        kind: 'item',
        id: item.call_id,
        type: 'tool',
        label: name,
        status: /^(?:apply_patch verification failed|Failed to|Error:)/i.test(text.trim())
          ? 'failed'
          : 'completed',
        text,
      };
    }
    return null;
  }
  if (event.method === 'turn/started') return { kind: 'phase', phase: 'waiting-model' };
  if (event.method === 'turn/completed')
    return {
      kind: 'terminal',
      outcome:
        p.turn?.status === 'completed'
          ? 'completed'
          : p.turn?.status === 'interrupted'
            ? 'interrupted'
            : 'failed',
    };
  if (event.method === 'item/started' || event.method === 'item/completed') {
    if (p.item.type === 'userMessage') return null;
    return {
      kind: 'item',
      id: p.item.id,
      type: itemType(p.item.type),
      label: p.item.tool ?? p.item.name ?? p.item.type,
      status:
        event.method === 'item/completed'
          ? p.item.status === 'failed' || (p.item.exitCode !== undefined && p.item.exitCode !== 0)
            ? 'failed'
            : 'completed'
          : 'running',
      text:
        p.item.text ??
        p.item.aggregatedOutput ??
        p.item.error?.message ??
        p.item.result?.content
          ?.filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('\n'),
    };
  }
  if (event.method === 'item/agentMessage/delta' || /reasoning\/.*Delta$/.test(event.method))
    return {
      kind: 'item',
      id: p.itemId,
      type: /reasoning/.test(event.method) ? 'reasoning' : 'assistant',
      delta: p.delta ?? '',
      status: 'running',
    };
  if (event.method === 'item/commandExecution/outputDelta')
    return { kind: 'item', id: p.itemId, type: 'tool', delta: p.delta ?? '', status: 'running' };
  if (event.method === 'error' && !p.willRetry) return { kind: 'terminal', outcome: 'failed' };
  return null;
}
export class OpenCodeProjection {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.roles = new Map();
    this.parts = new Map();
  }
  project(event) {
    const payload = event.payload ?? event;
    const p = payload.properties ?? {};
    if (p.sessionID && p.sessionID !== this.sessionId) return null;
    if (payload.type === 'session.status')
      return {
        kind: 'phase',
        phase:
          p.status?.type === 'retry'
            ? 'retrying'
            : p.status?.type === 'idle'
              ? 'idle'
              : 'waiting-model',
      };
    if (payload.type === 'session.error') return { kind: 'terminal', outcome: 'failed' };
    if (payload.type === 'message.updated') {
      if (p.info?.sessionID !== this.sessionId) return null;
      this.roles.set(p.info.id, p.info.role);
      if (p.info.error) return { kind: 'terminal', outcome: 'failed' };
      return null;
    }
    if (payload.type === 'message.part.updated') {
      const part = p.part;
      if (!part || part.sessionID !== this.sessionId) return null;
      this.parts.set(part.id, { type: part.type, messageID: part.messageID });
      if (
        this.roles.get(part.messageID) !== 'assistant' ||
        !['text', 'reasoning', 'tool'].includes(part.type)
      )
        return null;
      return {
        kind: 'item',
        id: part.id,
        type: part.type === 'text' ? 'assistant' : part.type,
        label: part.tool,
        status:
          part.state?.status === 'error'
            ? 'failed'
            : (part.state?.status ?? (part.time?.end ? 'completed' : 'running')),
        text: part.text ?? part.state?.output ?? part.state?.error,
      };
    }
    if (payload.type === 'message.part.delta') {
      const part = this.parts.get(p.partID);
      if (
        !part ||
        this.roles.get(part.messageID) !== 'assistant' ||
        !['text', 'reasoning'].includes(part.type)
      )
        return null;
      return {
        kind: 'item',
        id: p.partID,
        type: part.type === 'reasoning' ? 'reasoning' : 'assistant',
        delta: p.delta ?? '',
        status: 'running',
      };
    }
    return null;
  }
}
export function openCodeEvent(event, sessionId) {
  return new OpenCodeProjection(sessionId).project(event);
}
async function waitUntil(check, timeoutMs = 20000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('ENGINE_READINESS_TIMEOUT');
}
async function unusedPort() {
  const socket = createServer();
  await new Promise((r) => socket.listen(0, '127.0.0.1', r));
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  return port;
}
export async function engineAdapter(
  engine,
  { root, gateway, onEvent, onRaw = () => {}, scenario = 'text', restore },
) {
  const launch = await launcher(engine);
  const p = await profile(root, engine);
  const useCompanion = ['browser', 'website', 'uncertain-mutation'].includes(scenario);
  const companionScript = fileURLToPath(new URL('./companion-mcp.mjs', import.meta.url));
  if (!restore)
    await writeFile(
      join(p.workspace, 'evaluation-note.txt'),
      'Nexus evaluation fixture: violet lantern, number 47.\n',
    );
  if (scenario === 'browser' && !restore)
    await writeFile(
      join(p.workspace, 'index.html'),
      '<title>Browser probe</title><style>body{background:#124d38;color:white}h1{font:32px sans-serif}</style><h1>Violet lantern 47</h1><script>console.log("probe");console.log("probe")</script>',
    );
  if (scenario === 'command-session' && !restore)
    await writeFile(
      join(p.workspace, 'command-probe.mjs'),
      "console.log('COMMAND_READY'); const timer=setInterval(()=>console.log('COMMAND_HEARTBEAT'),500); process.on('SIGINT',()=>{clearInterval(timer);console.log('COMMAND_STOPPED');process.exit(0);});",
    );
  if (engine === 'pi') {
    const sdk = await import(pathToFileURL(join(launch.root, 'pi-coding-agent/dist/index.js')));
    const tools = [sdk.createReadTool(p.workspace)];
    const services = useCompanion
      ? await companion(p.workspace, { mutationProbe: scenario === 'uncertain-mutation' })
      : null;
    if (services)
      tools.push(
        ...services.tools.map((tool) => ({
          ...tool,
          label: tool.name,
          execute: async (_id, args, signal) => services.execute(tool.name, args, { signal }),
        })),
      );
    if (['stale-edit', 'website'].includes(scenario))
      tools.push(sdk.createEditTool(p.workspace), sdk.createWriteTool(p.workspace));
    const sessionManager = restore
      ? sdk.SessionManager.open(restore)
      : sdk.SessionManager.create(p.workspace, join(p.directory, 'sessions'));
    let messageSequence = 0;
    let interrupting = false;
    let terminalSent = false;
    const terminal = (outcome) => {
      if (!terminalSent) {
        terminalSent = true;
        onEvent({ kind: 'terminal', outcome });
      }
    };
    const model = {
      id: gateway.model,
      name: gateway.model,
      api: 'openai-completions',
      provider: 'evaluation',
      baseUrl: gateway.baseUrl,
      reasoning: false,
      input: ['text', 'image'],
      contextWindow: 32768,
      maxTokens: 2048,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      compat: {
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
      },
    };
    const agentDir = join(p.directory, 'agent');
    const runtime = await sdk.ModelRuntime.create({
      authPath: join(p.directory, 'auth.json'),
      modelsPath: null,
      allowModelNetwork: false,
      refreshOnCreate: false,
    });
    runtime.registerProvider('evaluation', {
      name: 'Nexus evaluation',
      api: 'openai-completions',
      baseUrl: gateway.baseUrl,
      apiKey: 'evaluation-relay',
      models: [model],
    });
    const settings = sdk.SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: false, maxRetries: 0 },
    });
    const loader = new sdk.DefaultResourceLoader({
      cwd: p.workspace,
      agentDir,
      settingsManager: settings,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    await loader.reload();
    const { session: agent } = await sdk.createAgentSession({
      cwd: p.workspace,
      agentDir,
      modelRuntime: runtime,
      model: runtime.getModel('evaluation', gateway.model),
      thinkingLevel: 'off',
      tools: tools.map((tool) => tool.name),
      customTools: services?.tools.map((tool) => ({
        ...tool,
        label: tool.name,
        execute: async (_id, args, signal) => services.execute(tool.name, args, { signal }),
      })),
      settingsManager: settings,
      resourceLoader: loader,
      sessionManager,
    });
    agent.subscribe((event) => {
      onRaw(event.type);
      if (event.type === 'agent_start') onEvent({ kind: 'phase', phase: 'waiting-model' });
      if (event.type === 'message_start' && event.message.role === 'assistant') messageSequence++;
      if (event.type === 'message_update') {
        const e = event.assistantMessageEvent;
        if (e.type === 'text_delta' || e.type === 'thinking_delta')
          onEvent({
            kind: 'item',
            id:
              'pi-step-' +
              messageSequence +
              (e.type === 'thinking_delta' ? '-reasoning' : '-answer'),
            type: e.type === 'thinking_delta' ? 'reasoning' : 'assistant',
            delta: e.delta,
            status: 'running',
          });
      }
      if (event.type === 'tool_execution_start') {
        onEvent({ kind: 'phase', phase: 'tool' });
        onEvent({
          kind: 'item',
          id: event.toolCallId,
          type: 'tool',
          label: event.toolName,
          status: 'running',
        });
      }
      if (event.type === 'tool_execution_end') {
        onEvent({
          kind: 'item',
          id: event.toolCallId,
          type: 'tool',
          status: event.isError ? 'failed' : 'completed',
          label: event.toolName,
          text: event.result?.content
            ?.filter((part) => part.type === 'text')
            .map((part) => part.text)
            .join('\n'),
        });
        onEvent({ kind: 'phase', phase: 'waiting-model' });
      }
      if (event.type === 'message_end') {
        if (event.message.role === 'assistant')
          for (const type of ['text', 'thinking']) {
            const text = event.message.content
              .filter((part) => part.type === type)
              .map((part) => part[type] ?? '')
              .join('');
            if (text)
              onEvent({
                kind: 'item',
                id: 'pi-step-' + messageSequence + (type === 'thinking' ? '-reasoning' : '-answer'),
                type: type === 'thinking' ? 'reasoning' : 'assistant',
                text,
                status: 'completed',
              });
          }
      }
      if (
        event.type === 'message_end' &&
        event.message.role === 'assistant' &&
        ['error', 'aborted'].includes(event.message.stopReason)
      )
        terminal(interrupting || event.message.stopReason === 'aborted' ? 'interrupted' : 'failed');
      if (event.type === 'agent_end') terminal(interrupting ? 'interrupted' : 'completed');
    });
    return {
      version: launch.version,
      workspace: p.workspace,
      nativeHandle: sessionManager.getSessionFile(),
      async snapshot() {
        return {
          messages: sessionManager.buildSessionContext().messages.length,
          handle: sessionManager.getSessionFile(),
        };
      },
      async run(text, { image = false, imageData = TEST_IMAGE } = {}) {
        interrupting = false;
        terminalSent = false;
        await agent.prompt(text, {
          images: image ? [{ type: 'image', data: imageData, mimeType: 'image/png' }] : undefined,
        });
      },
      async interrupt() {
        interrupting = true;
        await agent.abort();
        terminal('interrupted');
      },
      async close() {
        interrupting = true;
        await services?.close();
        await agent.abort();
        agent.dispose();
      },
      serviceRecords: services?.records,
    };
  }
  if (engine === 'codex') {
    const catalog = await customCodexCatalog(p.directory, gateway.model);
    const args = [
      ...launch.prefix,
      'app-server',
      '-c',
      'model_provider="evaluation"',
      '-c',
      `model="${gateway.model}"`,
      '-c',
      'model_context_window=32768',
      '-c',
      'model_catalog_json=' + JSON.stringify(catalog.path.replaceAll('\\', '/')),
      '-c',
      'model_max_output_tokens=2048',
      '-c',
      'features.enable_request_compression=false',
      '-c',
      'features.unified_exec=false',
      '-c',
      'model_providers.evaluation.name="Nexus evaluation"',
      '-c',
      `model_providers.evaluation.base_url="${gateway.baseUrl}"`,
      '-c',
      'model_providers.evaluation.wire_api="responses"',
      '-c',
      'model_providers.evaluation.requires_openai_auth=false',
    ];
    if (process.platform === 'win32') args.push('-c', 'windows.sandbox="unelevated"');
    if (scenario === 'uncertain-mutation')
      args.push('-c', 'mcp_servers.evaluation.env.NEXUS_EVALUATION_MUTATION="true"');
    if (useCompanion)
      args.push(
        '-c',
        'mcp_servers.evaluation.default_tools_approval_mode="approve"',
        '-c',
        'mcp_servers.evaluation.command=' + JSON.stringify(process.execPath.replaceAll('\\', '/')),
        '-c',
        'mcp_servers.evaluation.args=' + JSON.stringify([companionScript.replaceAll('\\', '/')]),
        '-c',
        'mcp_servers.evaluation.env.NEXUS_EVALUATION_WORKSPACE=' +
          JSON.stringify(p.workspace.replaceAll('\\', '/')),
      );
    let nativeThread;
    let nativeTurn;
    const rawCalls = new Map();
    const rpc = new JsonRpcProcess(
      launch.executable,
      args,
      { env: p.env, cwd: p.workspace },
      (event) => {
        onRaw(
          event.method,
          undefined,
          event.params?.item
            ? {
                type: event.params.item.type,
                status: event.params.item.status,
                exitCode: event.params.item.exitCode,
              }
            : undefined,
        );
        if (event.method === 'turn/started') nativeTurn = event.params.turn.id;
        if (event.params?.threadId && nativeThread && event.params.threadId !== nativeThread)
          return;
        const normalized = codexEvent(event, rawCalls);
        if (normalized) onEvent(normalized);
      },
    );
    try {
      await rpc.request('initialize', {
        clientInfo: { name: 'nexus-evaluation', version: '1.0.0' },
        capabilities: { experimentalApi: true },
      });
      rpc.send({ method: 'initialized' });
      const result = await rpc.request(restore ? 'thread/resume' : 'thread/start', {
        ...(restore ? { threadId: restore } : {}),
        cwd: p.workspace,
        model: gateway.model,
        modelProvider: 'evaluation',
        approvalPolicy: 'never',
        sandbox: ['stale-edit', 'website'].includes(scenario) ? 'workspace-write' : 'read-only',
        ephemeral: false,
        experimentalRawEvents: true,
      });
      nativeThread = result.thread.id;
    } catch (error) {
      await rpc.close();
      throw error;
    }
    return {
      version: launch.version,
      workspace: p.workspace,
      nativeHandle: nativeThread,
      async snapshot() {
        const result = await rpc.request('thread/read', {
          threadId: nativeThread,
          includeTurns: true,
        });
        return {
          handle: result.thread.id,
          turns: result.thread.turns.length,
          status: result.thread.status,
        };
      },
      async run(text, { image = false, imageData = TEST_IMAGE } = {}) {
        const input = [{ type: 'text', text }];
        if (image) input.push({ type: 'image', url: 'data:image/png;base64,' + imageData });
        await rpc.request('turn/start', { threadId: nativeThread, input });
      },
      async interrupt() {
        if (nativeTurn)
          await rpc.request('turn/interrupt', { threadId: nativeThread, turnId: nativeTurn });
      },
      async close() {
        await rpc.close();
      },
    };
  }
  if (engine === 'opencode') {
    const port = await unusedPort();
    const base = 'http://127.0.0.1:' + port;
    const config = {
      model: 'evaluation/' + gateway.model,
      small_model: 'evaluation/' + gateway.model,
      enabled_providers: ['evaluation'],
      provider: {
        evaluation: {
          npm: '@ai-sdk/openai-compatible',
          name: 'Nexus evaluation',
          options: { baseURL: gateway.baseUrl, apiKey: 'evaluation-relay' },
          models: {
            [gateway.model]: {
              name: gateway.model,
              attachment: true,
              tool_call: true,
              modalities: { input: ['text', 'image'], output: ['text'] },
              limit: { context: 32768, output: 2048 },
            },
          },
        },
      },
      permission: {
        '*': 'deny',
        read: 'allow',
        glob: 'allow',
        grep: 'allow',
        edit: ['stale-edit', 'website'].includes(scenario) ? 'allow' : 'deny',
        external_directory: 'deny',
        ...(useCompanion ? { 'evaluation_*': 'allow' } : {}),
      },
    };
    if (useCompanion)
      config.mcp = {
        evaluation: {
          type: 'local',
          command: [process.execPath, companionScript],
          environment: {
            NEXUS_EVALUATION_WORKSPACE: p.workspace,
            NEXUS_EVALUATION_MUTATION: String(scenario === 'uncertain-mutation'),
          },
        },
      };
    const env = {
      ...p.env,
      OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
      OPENCODE_CONFIG_DIR: join(p.directory, 'config/opencode'),
      OPENCODE_DISABLE_MODELS_FETCH: 'true',
      OPENCODE_DISABLE_AUTOUPDATE: 'true',
    };
    const child = spawn(
      launch.executable,
      [...launch.prefix, 'serve', '--pure', '--hostname', '127.0.0.1', '--port', String(port)],
      { env, cwd: p.workspace, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    child.on('error', () => {});
    child.stdout.resume();
    child.stderr.resume();
    const streamAbort = new AbortController();
    let projection;
    let active = false;
    let busy = false;
    let sessionId;
    let readerTask;
    const call = async (path, body) => {
      const r = await fetch(base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', 'x-opencode-directory': p.workspace },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) throw new Error('OPENCODE_HTTP_' + r.status);
      return r.status === 204 ? null : r.json();
    };
    try {
      await waitUntil(async () => {
        if (child.exitCode !== null) throw new Error('OPENCODE_PROCESS_EXITED');
        try {
          return (await fetch(base + '/global/health', { signal: AbortSignal.timeout(500) })).ok;
        } catch {
          return false;
        }
      });
      sessionId = restore ?? (await call('/session', {})).id;
      projection = new OpenCodeProjection(sessionId);
      const stream = await fetch(base + '/event', {
        headers: { 'x-opencode-directory': p.workspace },
        signal: streamAbort.signal,
      });
      if (!stream.ok) throw new Error('OPENCODE_EVENT_STREAM_FAILED');
      readerTask = (async () => {
        for await (const event of jsonEvents(stream.body)) {
          const payload = event.payload ?? event;
          onRaw(
            payload.type,
            payload.type === 'session.error' ? payload.properties?.error : undefined,
          );
          const normalized = projection.project(event);
          if (!active || !normalized) continue;
          if (normalized.kind === 'phase' && normalized.phase === 'idle') {
            if (busy) {
              active = false;
              onEvent({ kind: 'terminal', outcome: 'completed' });
            }
            continue;
          }
          if (normalized.kind === 'phase') busy = true;
          onEvent(normalized);
        }
      })().catch(() => {
        if (active) onEvent({ kind: 'terminal', outcome: 'failed' });
      });
    } catch (error) {
      streamAbort.abort();
      await stopProcess(child);
      throw error;
    }
    return {
      version: launch.version,
      workspace: p.workspace,
      nativeHandle: sessionId,
      async snapshot() {
        const messages = await call('/session/' + sessionId + '/message');
        return {
          handle: sessionId,
          messages: messages.length,
          parts: messages.reduce((sum, m) => sum + m.parts.length, 0),
        };
      },
      async run(text, { image = false, imageData = TEST_IMAGE } = {}) {
        active = true;
        busy = false;
        const parts = [{ type: 'text', text }];
        if (image)
          parts.push({
            type: 'file',
            mime: 'image/png',
            url: 'data:image/png;base64,' + imageData,
            filename: 'fixture.png',
          });
        onEvent({ kind: 'phase', phase: 'waiting-model' });
        await call('/session/' + sessionId + '/prompt_async', {
          parts,
          model: { providerID: 'evaluation', modelID: gateway.model },
        });
      },
      async interrupt() {
        active = false;
        await call('/session/' + sessionId + '/abort', {});
        onEvent({ kind: 'terminal', outcome: 'interrupted' });
      },
      async close() {
        active = false;
        streamAbort.abort();
        await stopProcess(child);
        await readerTask;
      },
    };
  }
  throw new Error('UNKNOWN_ENGINE');
}
