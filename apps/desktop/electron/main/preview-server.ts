import { connect } from "node:net";
import type { ManagedProcessRead } from "@pi-desktop/shared";
import type { LocalToolInput, LocalToolResult } from "./local-tool-executor";

type Host = { call<T>(method: string, params: unknown, timeoutMs?: number): Promise<T> };
type ProcessResult = LocalToolResult & { content: ManagedProcessRead };
const live = (status?: string) => status === "starting" || status === "running";

export function previewAddress(raw: unknown): URL {
  if (typeof raw !== "string" || raw.length > 2048) throw new Error("PREVIEW_URL_INVALID: supply a loopback HTTP URL.");
  const url = new URL(raw);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password || url.hash || !url.port) {
    throw new Error("PREVIEW_URL_INVALID: use http://127.0.0.1:<port> with no credentials or fragment.");
  }
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  return url;
}

async function portOccupied(url: URL, signal?: AbortSignal): Promise<boolean> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const socket = connect({ host: url.hostname === "[::1]" ? "::1" : url.hostname, port: Number(url.port) });
    const finish = (value: boolean) => { socket.destroy(); signal?.removeEventListener("abort", abort); resolve(value); };
    const abort = () => { socket.destroy(); signal?.removeEventListener("abort", abort); reject(signal?.reason); };
    signal?.addEventListener("abort", abort, { once: true });
    socket.setTimeout(800, () => finish(true));
    socket.once("connect", () => finish(true));
    socket.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ECONNREFUSED") finish(false);
      else { socket.destroy(); signal?.removeEventListener("abort", abort); reject(error); }
    });
  });
}

/** Readiness is an observed HTTP response, never an assertion based on stdout. */
export async function runPreviewServer(host: Host, input: LocalToolInput,
  shell: { id: string; dialect: string },
  probe: (url: URL, signal?: AbortSignal) => Promise<number | undefined> = async (url, signal) => {
    try {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.any([AbortSignal.timeout(1000), ...(signal ? [signal] : [])]) });
      await response.body?.cancel();
      return response.status;
    } catch { signal?.throwIfAborted(); return undefined; }
  },
  occupied: (url: URL, signal?: AbortSignal) => Promise<boolean> = portOccupied,
): Promise<LocalToolResult> {
  const args = (input.args ?? {}) as Record<string, unknown>;
  const operation = args.operation;
  if (!["start", "status", "stop", "list"].includes(String(operation))) throw new Error("PREVIEW_OPERATION_INVALID");
  if (input.mode !== "agent" && operation !== "status" && operation !== "list") {
    return { ok: false, isError: true, errorCode: "TOOL_DISABLED_IN_PLAN", content: "Preview start/stop require Agent mode." };
  }
  const call = async (toolName: string, toolArgs: unknown, suffix: string) => host.call<ProcessResult>("tools.execute", {
    sessionId: input.sessionId, turnId: input.turnId, toolCallId: `${input.toolCallId}:${suffix}`, toolName, args: toolArgs, mode: input.mode,
    ...(input.permissionScope ? { permissionScope: input.permissionScope } : {}),
    expectedCommandShellId: shell.id, expectedCommandShellDialect: shell.dialect,
  }, 180_000);
  input.signal?.throwIfAborted();
  if (operation === "list") {
    const result = await call("ProcessRead", {}, "list");
    if (!result.ok) return result;
    return { ...result, content: { processes: result.content.processes?.filter(process => !!process.previewUrl) ?? [] } };
  }
  if (operation !== "start" && (typeof args.id !== "string" || !args.id)) throw new Error("PREVIEW_ID_REQUIRED");
  if (operation === "stop") return call("ProcessStop", { id: args.id }, "stop");
  let url: URL;
  let result: ProcessResult;
  if (operation === "start") {
    if (typeof args.command !== "string" || !args.command.trim()) throw new Error("PREVIEW_COMMAND_REQUIRED");
    url = previewAddress(args.url);
    if (await occupied(url, input.signal)) return { ok: false, isError: true, errorCode: "PREVIEW_PORT_IN_USE", content: "The preview port is already occupied. Inspect the existing server or choose another port; no command was launched." };
    input.signal?.throwIfAborted();
    const abort = () => { void host.call("tools.abort", { sessionId: input.sessionId, toolCallId: `${input.toolCallId}:start` }, 1000).catch(() => undefined); };
    input.signal?.addEventListener("abort", abort, { once: true });
    try {
      result = await call("ProcessStart", { command: args.command, ...(typeof args.cwd === "string" ? { cwd: args.cwd } : {}), previewUrl: url.href }, "start");
      if (!result.ok) return result;
      if (input.signal?.aborted) {
        if (result.content.process?.id) await call("ProcessStop", { id: result.content.process.id }, "cancel");
        input.signal.throwIfAborted();
      }
    } finally { input.signal?.removeEventListener("abort", abort); }
  } else {
    result = await call("ProcessRead", { id: args.id, ...(typeof args.cursor === "number" ? { cursor: args.cursor } : {}) }, "read");
    if (!result.ok) return result;
    url = previewAddress(result.content.process?.previewUrl);
  }
  const id = result.content.process?.id;
  if (!id) throw new Error("PREVIEW_HANDLE_MISSING");
  const waitMs = typeof args.waitMs === "number" && Number.isFinite(args.waitMs) ? Math.max(0, Math.min(30_000, args.waitMs)) : 5000;
  const deadline = Date.now() + waitMs;
  let httpStatus: number | undefined;
  try {
    while (live(result.content.process?.status)) {
      input.signal?.throwIfAborted();
      httpStatus = await probe(url, input.signal);
      // Confirm the process still exists after the network observation.
      result = await call("ProcessRead", { id, ...(typeof args.cursor === "number" ? { cursor: args.cursor } : {}) }, "poll");
      if (!result.ok) return result;
      if (!live(result.content.process?.status) || httpStatus !== undefined && httpStatus >= 200 && httpStatus < 400 || Date.now() >= deadline) break;
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); input.signal?.removeEventListener("abort", abort); reject(input.signal?.reason); };
        const timer = setTimeout(() => { input.signal?.removeEventListener("abort", abort); resolve(); }, 150);
        input.signal?.addEventListener("abort", abort, { once: true });
        if (input.signal?.aborted) abort();
      });
    }
  } catch (error) {
    if (operation === "start") await call("ProcessStop", { id }, "cancel");
    throw error;
  }
  const running = live(result.content.process?.status);
  return { ok: running, ...(!running ? { isError: true, errorCode: "PREVIEW_PROCESS_EXITED" } : {}), content: {
    ...result.content, url: url.href, ready: running && httpStatus !== undefined && httpStatus >= 200 && httpStatus < 400,
    httpStatus, readiness: "HTTP reachability; inspect the page to verify its content.",
    ...(!running ? { message: "The owned command exited before readiness; inspect output and exit status." } : {}),
  } };
}
