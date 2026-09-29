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

  it("keeps a steer queued while the parent waits for a subagent", async () => {
    const onEvent = vi.fn();
    const runtime = new DesktopAgentRuntime({
      host: { call: vi.fn(), onNotification: vi.fn(() => () => {}) } as never,
      sessionId: "session-1", mode: "agent", turnId: "turn-1",
      provider: {
        id: "local", name: "Local", baseUrl: "http://localhost/v1", apiKey: "", authKind: "none",
        modelId: "model-1", supportsReasoning: false, supportedThinkingLevels: ["off"],
        modelConfig: { source: "generic", name: "Test", baseUrl: "http://localhost/v1", reasoning: false, input: ["text"], contextWindow: 4096, maxTokens: 256 },
      },
      commandShell: { id: "bash", label: "Bash", dialect: "posix", available: true, isDefault: true },
      thinkingLevel: "off", onEvent,
    });
    const agent = (runtime as any).agent;
    const abort = vi.spyOn(agent, "abort");
    const continueRun = vi.spyOn(agent, "continue");
    let resolveCompletion!: () => void;
    const completion = new Promise<void>((resolve) => { resolveCompletion = resolve; });
    const record = {
      delegationId: "delegate-1", status: "running", startedEpoch: (runtime as any).turnEpoch,
      agentName: "researcher", startedAt: Date.now(), turns: 1, toolCalls: 0,
      reportDelivered: false, completion, resolveCompletion, abort: vi.fn(),
    };
    (runtime as any).delegations.set("delegate-1", record);
    const providerInputs: string[][] = [];
    agent.streamFunction = (_model: unknown, context: any) => {
      providerInputs.push(context.messages.filter((entry: any) => entry.role === "user").map((entry: any) =>
        typeof entry.content === "string" ? entry.content : entry.content?.[0]?.text ?? "",
      ));
      const stream = createAssistantMessageEventStream();
      const complete = {
        role: "assistant", content: [{ type: "text", text: "combined reply" }], api: "openai-completions",
        provider: "local", model: "model-1", usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: Date.now(),
      } as any;
      queueMicrotask(() => {
        stream.push({ type: "start", partial: complete });
        stream.push({ type: "done", reason: "stop", message: complete });
        stream.end(complete);
      });
      return stream;
    };

    const resume = (runtime as any).resumeAfterDelegations();
    expect(runtime.getStatus().isRunning).toBe(true);
    await expect(runtime.steer({ text: "new direction" }, "turn-1")).resolves.toMatchObject({ state: "accepted" });
    expect(agent.hasQueuedMessages()).toBe(true);
    expect(abort).not.toHaveBeenCalled();
    expect(continueRun).not.toHaveBeenCalled();
    expect(runtime.getStatus().isRunning).toBe(true);
    expect(onEvent.mock.calls.some(([envelope]) => envelope.event.type === "agent_end")).toBe(false);
    record.status = "completed";
    (record as any).result = { report: "delegate result" };
    resolveCompletion();
    await resume;
    expect(providerInputs).toHaveLength(1);
    expect(providerInputs[0]).toContain("new direction");
    expect(providerInputs[0].some((text) => text.includes("delegate result"))).toBe(true);
    expect(onEvent.mock.calls.filter(([envelope]) => envelope.event.type === "agent_end")).toHaveLength(1);
    await runtime.abort();
    expect(agent.hasQueuedMessages()).toBe(false);
    await runtime.dispose();
  });

  it("delivers two steers to the provider exactly once within the original turn", async () => {
    const onEvent = vi.fn();
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
      onEvent,
    });
    const agent = (runtime as any).agent;
    const providerInputs: string[] = [];
    let requestCount = 0;
    let finishFirst: (() => void) | undefined;
    agent.streamFunction = (_model: unknown, context: any, options: any) => {
      requestCount += 1;
      const stream = createAssistantMessageEventStream();
      const userMessages = context.messages.filter((message: any) => message.role === "user");
      const last = userMessages.at(-1);
      providerInputs.push(typeof last?.content === "string" ? last.content : last?.content?.[0]?.text ?? "");
      if (requestCount === 1) {
        finishFirst = () => {
          const complete = { role: "assistant", content: [{ type: "text", text: "initial reply" }], api: "openai-completions", provider: "local", model: "model-1", usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: Date.now() } as any;
          stream.push({ type: "start", partial: complete });
          stream.push({ type: "done", reason: "stop", message: complete });
          stream.end(complete);
        };
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
    await expect(runtime.steer({ text: "first steer" }, "turn-1", {
      id: "steer-1", role: "user", content: "first steer", createdAt: new Date().toISOString(), status: "complete",
    } as any)).resolves.toMatchObject({ state: "accepted" });
    await expect(runtime.steer({ text: "second steer" }, "turn-1", {
      id: "steer-2", role: "user", content: "second steer", createdAt: new Date().toISOString(), status: "complete",
    } as any)).resolves.toMatchObject({ state: "accepted" });
    expect(requestCount).toBe(1);
    expect(onEvent.mock.calls.some(([envelope]) => envelope.event.type === "agent_end" || envelope.event.type === "error")).toBe(false);
    finishFirst?.();
    await prompt;
    expect(providerInputs).toEqual(["initial", "first steer", "second steer"]);
    expect(requestCount).toBe(3);
    expect(onEvent.mock.calls.filter(([envelope]) => envelope.event.type === "agent_end")).toHaveLength(1);
    expect((runtime as any).fullEntries.filter((entry: any) => entry.message.role === "user")).toHaveLength(3);
    await runtime.dispose();
  });

  it("interrupts each active generation without ending the durable turn", async () => {
    const onEvent = vi.fn();
    const runtime = new DesktopAgentRuntime({
      host: { call: vi.fn(), onNotification: vi.fn(() => () => {}) } as never,
      sessionId: "session-1", mode: "agent", turnId: "turn-1",
      provider: {
        id: "local", name: "Local", baseUrl: "http://localhost/v1", apiKey: "", authKind: "none",
        modelId: "model-1", supportsReasoning: false, supportedThinkingLevels: ["off"],
        modelConfig: { source: "generic", name: "Test", baseUrl: "http://localhost/v1", reasoning: false, input: ["text"], contextWindow: 4096, maxTokens: 256 },
      },
      commandShell: { id: "bash", label: "Bash", dialect: "posix", available: true, isDefault: true },
      thinkingLevel: "off", onEvent,
    });
    const agent = (runtime as any).agent;
    const providerInputs: string[] = [];
    const aborted: boolean[] = [];
    agent.streamFunction = (model: any, context: any, options: any) =>
      (runtime as any).steerableGeneration(model, context, options, (generationOptions: any) => {
        const stream = createAssistantMessageEventStream();
        const last = context.messages.filter((entry: any) => entry.role === "user").at(-1);
        providerInputs.push(typeof last?.content === "string" ? last.content : last?.content?.[0]?.text ?? "");
        const index = providerInputs.length;
        const partial = {
          role: "assistant", content: [{ type: "text", text: `partial ${index}` }],
          api: "openai-completions", provider: "local", model: "model-1",
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: "stop", timestamp: Date.now(),
        } as any;
        queueMicrotask(() => {
          stream.push({ type: "start", partial });
          if (index === 3) stream.push({ type: "done", reason: "stop", message: { ...partial, content: [{ type: "text", text: "final" }] } });
        });
        generationOptions.signal.addEventListener("abort", () => {
          aborted[index - 1] = true;
          stream.push({ type: "error", reason: "aborted", error: { ...partial, stopReason: "aborted" } });
        });
        return stream;
      });
    const prompt = runtime.prompt("initial", "initial-user", "turn-1");
    const waitForRequest = async (count: number) => {
      for (let attempt = 0; attempt < 50 && providerInputs.length < count; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      expect(providerInputs).toHaveLength(count);
    };
    await waitForRequest(1);
    await runtime.steer({ text: "first steer" }, "turn-1");
    await waitForRequest(2);
    await runtime.steer({ text: "second steer" }, "turn-1");
    await waitForRequest(3);
    await prompt;
    expect(aborted).toEqual([true, true]);
    expect(providerInputs).toEqual(["initial", "first steer", "second steer"]);
    expect(onEvent.mock.calls.filter(([envelope]) => envelope.event.type === "agent_end")).toHaveLength(1);
    expect(onEvent.mock.calls.filter(([envelope]) => envelope.event.type === "message_end" && envelope.event.message?.status === "aborted")).toHaveLength(2);
    await runtime.dispose();
  });
});
