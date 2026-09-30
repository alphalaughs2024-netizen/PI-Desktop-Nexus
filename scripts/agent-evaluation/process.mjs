import { spawn, execFileSync } from 'node:child_process';
import { readFile, access, mkdir } from 'node:fs/promises';
import { join, resolve, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const PINS = { codex: '0.157.1', opencode: '1.18.23', pi: '0.85.1' };
export async function launcher(engine) {
  const npmRoot = process.env.APPDATA ? join(process.env.APPDATA, 'npm/node_modules') : null;
  if (npmRoot && engine !== 'pi') {
    const root = join(npmRoot, engine === 'codex' ? '@openai/codex' : 'opencode-ai');
    const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const entry = resolve(
      root,
      typeof metadata.bin === 'string' ? metadata.bin : metadata.bin[engine],
    );
    await access(entry);
    return {
      executable: entry.endsWith('.js') ? process.execPath : entry,
      prefix: entry.endsWith('.js') ? [entry] : [],
      version: metadata.version,
    };
  }
  if (engine === 'pi') {
    let root = process.env.NEXUS_EVALUATION_PI_ROOT;
    if (!root) {
      const common = execFileSync('git', ['rev-parse', '--git-common-dir'], {
        encoding: 'utf8',
        cwd: fileURLToPath(new URL('../../', import.meta.url)),
      }).trim();
      root = join(dirname(resolve(common)), 'packages/agent-runtime/node_modules/@earendil-works');
    }
    const metadata = JSON.parse(await readFile(join(root, 'pi-coding-agent/package.json'), 'utf8'));
    return { root, version: metadata.version };
  }
  throw new Error('An explicit installed engine launcher is required on this platform.');
}
export async function piModules() {
  const { root, version } = await launcher('pi');
  return {
    version,
    core: await import(pathToFileURL(join(root, 'pi-agent-core/dist/index.js'))),
    api: await import(pathToFileURL(join(root, 'pi-ai/dist/api/openai-completions.js'))),
  };
}
// Windows restricted writes under AppData failed in the live probes. Keep private
// workspaces outside AppData, while profiles/reports retain their established root.
export const workspaceFor = (root, engine) =>
  join(homedir(), '.nexus-agent-evaluation', 'workspaces', basename(resolve(root)), engine);
export async function profile(root, engine) {
  const directory = resolve(root, engine);
  await mkdir(directory, { recursive: true });
  const workspace = workspaceFor(root, engine);
  await mkdir(workspace, { recursive: true });
  const env = {
    ...process.env,
    CODEX_HOME: join(directory, 'codex'),
    XDG_CONFIG_HOME: join(directory, 'config'),
    XDG_DATA_HOME: join(directory, 'data'),
    XDG_CACHE_HOME: join(directory, 'cache'),
    PI_DESKTOP_DATA_DIR: join(directory, 'nexus'),
  };
  // Never borrow credentials or endpoint configuration from the foreground app.
  for (const key of Object.keys(env))
    if (
      /API_KEY|AUTH_TOKEN|ACCESS_TOKEN|OPENCODE_CONFIG|OPENAI_BASE_URL|ANTHROPIC_BASE_URL/i.test(
        key,
      )
    )
      delete env[key];
  await mkdir(env.CODEX_HOME, { recursive: true });
  return { directory, workspace, env };
}
export async function stopProcess(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit').catch(() => {});
  let timer;
  if (process.platform === 'win32') {
    await new Promise((resolveStop) => {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      killer.on('error', resolveStop);
      killer.on('exit', resolveStop);
    });
  } else child.kill('SIGTERM');
  try {
    await Promise.race([
      exited,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('OWNED_PROCESS_STOP_TIMEOUT')), 5000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export class JsonRpcProcess {
  constructor(command, args, options, notify) {
    this.nextId = 1;
    this.pending = new Map();
    this.stderr = '';
    this.notify = notify;
    this.child = spawn(command, args, {
      ...options,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stderr.on('data', (chunk) => {
      this.stderr = (this.stderr + chunk.toString()).slice(-8192);
    });
    createInterface({ input: this.child.stdout }).on('line', (line) => {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      if (event.method && event.id !== undefined) {
        this.notify({ method: event.method, params: {} });
        this.send({ id: event.id, result: { decision: 'decline' } });
        return;
      }
      if (event.id !== undefined && this.pending.has(event.id)) {
        const pending = this.pending.get(event.id);
        this.pending.delete(event.id);
        clearTimeout(pending.timer);
        event.error
          ? pending.reject(new Error('RPC_ERROR: ' + JSON.stringify(event.error)))
          : pending.resolve(event.result);
      } else if (event.method) this.notify(event);
    });
    const fail = () => {
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error('ENGINE_PROCESS_EXITED'));
      }
      this.pending.clear();
    };
    this.child.on('error', fail);
    this.child.on('exit', fail);
  }
  send(value) {
    if (!this.child.stdin.destroyed) this.child.stdin.write(JSON.stringify(value) + '\n');
  }
  request(method, params = {}, timeoutMs = 30000) {
    const id = this.nextId++;
    return new Promise((resolveRequest, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('RPC_TIMEOUT: ' + method));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolveRequest, reject, timer });
      this.send({ id, method, params });
    });
  }
  async close() {
    await stopProcess(this.child);
  }
}
export const defaultProfileRoot = () =>
  join(process.env.LOCALAPPDATA || join(homedir(), '.cache'), 'NexusAgentEvaluation');
