import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
export type NativeEvent = { method: string; params: any };
export type NativeRequest = NativeEvent & { id: number | string };
export interface CodexRpc {
  request<T = any>(method: string, params?: unknown): Promise<T>;
  notify(method: string, params?: unknown): void;
  reply(id: number | string, result: unknown): void;
  reject(id: number | string, message: string): void;
  close(): Promise<void>;
}
export class AppServerTransport implements CodexRpc {
  private child: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private stopped = false;
  private stderrTail = "";
  private closing?: Promise<void>;
  constructor(command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }, callbacks: { event: (event: NativeEvent) => void; request: (request: NativeRequest) => void; exit: () => void }) {
    this.child = spawn(command, args, { ...options, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    // Drain diagnostics; never log provider secrets or request bodies by default.
    const secrets = Object.entries(options.env).filter(([key]) => /KEY|TOKEN|AUTHORIZATION|NEXUS_CODEX_HEADER/.test(key)).map(([, value]) => value).filter((value): value is string => !!value && value.length > 3);
    this.child.stderr.on("data", chunk => {
      let text = this.stderrTail + chunk.toString();
      for (const secret of secrets) text = text.replaceAll(secret, "[redacted]");
      this.stderrTail = text.slice(-4000);
    });
    const input = createInterface({ input: this.child.stdout });
    input.on("line", line => {
      let message: any;
      try {
        message = JSON.parse(line);
        if (!message || typeof message !== "object" || Array.isArray(message)
          || (message.method !== undefined && (typeof message.method !== "string" || !message.method))
          || (message.id !== undefined && !["number", "string"].includes(typeof message.id))
          || (message.method === undefined && (message.id === undefined || !("result" in message || "error" in message)))
          || (message.params !== undefined && (!message.params || typeof message.params !== "object" || Array.isArray(message.params)))) throw new Error("Invalid frame shape");
        if (message.method) message.params ??= {};
      } catch { this.fail(new Error("CODEX_INVALID_FRAME")); callbacks.exit(); void this.close(); return; }
      if (message.id !== undefined && message.method) { callbacks.request(message); return; }
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id); clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error("CODEX_RPC_ERROR: " + String(message.error.message ?? "request failed")));
        else pending.resolve(message.result);
      } else if (message.method) callbacks.event(message);
    });
    this.child.on("error", () => { this.fail(new Error("CODEX_PROCESS_START_FAILED")); callbacks.exit(); });
    this.child.on("exit", () => { this.fail(new Error("CODEX_PROCESS_EXITED: " + this.stderrTail.trim())); callbacks.exit(); input.close(); });
    this.child.stdin.on("error", () => this.fail(new Error("CODEX_TRANSPORT_CLOSED")));
  }
  private send(message: unknown): void {
    if (this.stopped) throw new Error("CODEX_TRANSPORT_CLOSED");
    this.child.stdin.write(JSON.stringify(message) + "\n");
  }
  request<T = any>(method: string, params: unknown = {}): Promise<T> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("CODEX_RPC_TIMEOUT: " + method)); }, 30_000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ jsonrpc: "2.0", id, method, params }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  notify(method: string, params: unknown = {}): void { this.send({ jsonrpc: "2.0", method, params }); }
  reply(id: number | string, result: unknown): void { this.send({ jsonrpc: "2.0", id, result }); }
  reject(id: number | string, message: string): void { this.send({ jsonrpc: "2.0", id, error: { code: -32601, message } }); }
  private fail(error: Error): void {
    this.stopped = true;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
  }
  close(): Promise<void> {
    return this.closing ??= this.stop();
  }
  private async stop(): Promise<void> {
    this.fail(new Error("CODEX_TRANSPORT_CLOSED"));
    if (this.child.exitCode !== null || this.child.signalCode !== null || !this.child.pid) return;
    // Own the complete engine tree, including native command sessions.
    if (process.platform === "win32") {
      await new Promise<void>(resolve => {
        const killer = spawn("taskkill.exe", ["/PID", String(this.child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        killer.once("error", () => resolve()); killer.once("exit", () => resolve());
      });
    } else this.child.kill("SIGTERM");
  }
}
