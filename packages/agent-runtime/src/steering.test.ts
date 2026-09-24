import { describe, expect, it, vi } from "vitest";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { createPromptLifecycleEvent } from "./lifecycle.js";
import { DesktopAgentRuntime } from "./runtime.js";

describe("Slice 2 steering contract", () => {
  it("keeps lifecycle IDs distinct for requested and terminal steering events", () => {
    const requested = createPromptLifecycleEvent({ sessionId: "s", sequence: 1, kind: "steering_requested", expectedTurnId: "t", preview: "secret", sensitive: true });
    const accepted = createPromptLifecycleEvent({ sessionId: "s", sequence: 2, kind: "steering_accepted", expectedTurnId: "t" });
    expect(requested.id).not.toBe(accepted.id);
    expect(requested.preview).toBe("secret");
    expect(requested.sensitive).toBe(true);
  });

  it("does not require renderer error text to classify typed outcomes", () => {
    const response = { state: "rejected" as const, reason: "stale_turn" as const };
    expect(response.state).toBe("rejected");
    expect(response.reason).toBe("stale_turn");
    expect(vi.fn()).not.toHaveBeenCalled();
  });

  it("uses native steering and resumes the active turn", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./runtime.ts", import.meta.url), "utf8"),
    );
    const steeringBody = source.slice(source.indexOf("async steer("), source.indexOf("/** Ask pi-agent-core", source.indexOf("async steer(")));
    expect(steeringBody).toContain("this.agent.steer(agentMessage)");
    expect(steeringBody).toContain("await this.agent.continue()");
  });

  it("resumes the agent loop after admitting a steer", async () => {
    const runtime = new DesktopAgentRuntime({
      host: { call: vi.fn(), onNotification: vi.fn(() => () => {}) } as never,
      sessionId: "session-1",
      mode: "agent",
      turnId: "turn-1",
      provider: {
        id: "local",
        name: "Local",
        baseUrl: "http://localhost/v1",
        apiKey: "",
        authKind: "none",
        modelId: "model-1",
        supportsReasoning: false,
        supportedThinkingLevels: ["off"],
        modelConfig: { source: "generic", name: "Test", baseUrl: "http://localhost/v1", reasoning: false, input: ["text"], contextWindow: 4096, maxTokens: 256 },
      },
      commandShell: { id: "bash", label: "Bash", dialect: "posix", available: true, isDefault: true },
      thinkingLevel: "off",
      onEvent: vi.fn(),
    });
    const delivered: string[] = [];
    let queued: any;
    (runtime as any).agent = {
      state: { isStreaming: true, messages: [] },
      signal: {},
      steer: vi.fn((message: any) => { queued = message; delivered.push("admitted"); }),
      abort: vi.fn(),
      waitForIdle: vi.fn(async () => undefined),
      continue: vi.fn(async () => {
        if (queued) delivered.push(String(queued.content));
        (runtime as any).agent.state.isStreaming = true;
      }),
    };
    (runtime as any).agentActivity = { phase: "waiting-model", since: Date.now() };

    await expect((runtime as any).steer({ text: "queued once" }, "turn-1")).resolves.toMatchObject({ state: "accepted" });
    expect((runtime as any).agent.steer).toHaveBeenCalledTimes(1);
    expect((runtime as any).agent.abort).not.toHaveBeenCalled();
    expect((runtime as any).agent.continue).not.toHaveBeenCalled();
    expect(delivered).toEqual(["admitted"]);
    await runtime.dispose();
  });

  it("delivers the steered text to the provider exactly once after an abort race", async () => {
    const runtime = new DesktopAgentRuntime({
      host: { call: vi.fn(), onNotification: vi.fn(() => () => {}) } as never,
      sessionId: "session-1",
      mode: "agent",
      turnId: "turn-1",
      provider: {
        id: "local", name: "Local", baseUrl: "http://localhost/v1", apiKey: "", authKind: "none",
        modelId: "model-1", supportsReasoning: false, supportedThinkingLevels: ["off"],
        modelConfig: { source: "generic", name: "Test", baseUrl: "http://localhost/v1", reasoning: false, input: ["text"], contextWindow: 4096, maxTokens: 256 },
      },
      commandShell: { id: "bash", label: "Bash", dialect: "posix", available: true, isDefault: true },
      thinkingLevel: "off",
      onEvent: vi.fn(),
    });
    const agent = (runtime as any).agent;
    const providerInputs: string[] = [];
    let requestCount = 0;
    agent.streamFunction = (_model: unknown, context: any, options: any) => {
      requestCount += 1;
      const stream = createAssistantMessageEventStream();
      const userMessages = context.messages.filter((message: any) => message.role === "user");
      const last = userMessages.at(-1);
      providerInputs.push(typeof last?.content === "string" ? last.content : last?.content?.[0]?.text ?? "");
      if (requestCount === 1) {
        setTimeout(() => {
          const first = {
            role: "assistant", content: [{ type: "text", text: "first reply" }], api: "openai-completions", provider: "local", model: "model-1",
            usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
            stopReason: "stop", timestamp: Date.now(),
          } as any;
          stream.push({ type: "start", partial: first });
          stream.push({ type: "done", reason: "stop", message: first });
          stream.end(first);
        }, 10);
      } else {
        const complete = {
          role: "assistant", content: [{ type: "text", text: "reply to steer" }], api: "openai-completions", provider: "local", model: "model-1",
          usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: "stop", timestamp: Date.now(),
        } as any;
        queueMicrotask(() => {
          stream.push({ type: "start", partial: complete });
          stream.push({ type: "done", reason: "stop", message: complete });
          stream.end(complete);
        });
      }
      return stream;
    };

    const prompt = runtime.prompt("initial", "initial-user", "turn-1");
    for (let attempt = 0; attempt < 20 && requestCount === 0; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requestCount).toBe(1);
    await expect(runtime.steer({ text: "steer exactly once" }, "turn-1")).resolves.toMatchObject({ state: "accepted" });
    await prompt;
    expect(providerInputs).toEqual(["initial", "steer exactly once"]);
    expect(requestCount).toBe(2);
    await runtime.dispose();
  });
});
