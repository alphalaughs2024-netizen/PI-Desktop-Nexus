export type LocalToolResult = {
  ok: boolean;
  content: unknown;
  isError?: boolean;
  errorCode?: string;
};

export type LocalToolInput = {
  sessionId: string;
  toolCallId: string;
  args: unknown;
  mode?: "agent" | "plan" | "goal";
  turnId?: string;
  permissionScope?: string;
  commandShell?: { id: string; dialect: string };
  signal?: AbortSignal;
};
export type LocalToolHandler = (input: LocalToolInput) => Promise<LocalToolResult>;

/** Main owns cancellation; handlers check the signal before later side effects. */
export class LocalToolExecutor {
  private active = new Map<string, AbortController>();
  private timeoutMs: number;
  constructor(timeoutMs: number) { this.timeoutMs = timeoutMs; }

  abort(sessionId: string, toolCallId: string): boolean {
    const controller = this.active.get(JSON.stringify([sessionId, toolCallId]));
    controller?.abort(new Error("TOOL_ABORTED: work stopped; already applied changes are not undone."));
    return !!controller;
  }

  abortAll(): void {
    for (const controller of this.active.values()) controller.abort(new Error("TOOL_ABORTED: execution owner closed."));
  }

  async run(handler: LocalToolHandler, input: LocalToolInput, timeoutMs = this.timeoutMs): Promise<LocalToolResult> {
    const key = JSON.stringify([input.sessionId, input.toolCallId]);
    if (this.active.has(key)) throw new Error("TOOL_CALL_ALREADY_RUNNING");
    const controller = new AbortController();
    this.active.set(key, controller);
    const timer = setTimeout(() => controller.abort(new Error("TOOL_TIMEOUT: Main-owned work timed out; inspect any applied changes.")), timeoutMs);
    let onAbort!: () => void;
    try {
      return await Promise.race([
        Promise.resolve().then(() => {
          controller.signal.throwIfAborted();
          return handler({ ...input, signal: controller.signal });
        }),
        new Promise<LocalToolResult>((resolve) => {
          onAbort = () => resolve({ ok: false, isError: true,
            errorCode: controller.signal.reason.message.startsWith("TOOL_TIMEOUT") ? "TOOL_TIMEOUT" : "TOOL_ABORTED",
            content: controller.signal.reason.message });
          controller.signal.addEventListener("abort", onAbort, { once: true });
        }),
      ]);
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", onAbort);
      if (this.active.get(key) === controller) this.active.delete(key);
    }
  }
}
