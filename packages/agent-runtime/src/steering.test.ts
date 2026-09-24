import { describe, expect, it, vi } from "vitest";
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
    expect(steeringBody).toContain("this.agent.abort()");
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
      steer: vi.fn((message: any) => { queued = message; delivered.push("admitted"); }),
      abort: vi.fn(() => { (runtime as any).agent.state.isStreaming = false; }),
      waitForIdle: vi.fn(async () => undefined),
      continue: vi.fn(async () => {
        if (queued) delivered.push(String(queued.content));
        (runtime as any).agent.state.isStreaming = true;
      }),
    };

    await expect((runtime as any).steer({ text: "queued once" }, "turn-1")).resolves.toMatchObject({ state: "accepted" });
    expect((runtime as any).agent.steer).toHaveBeenCalledTimes(1);
    expect((runtime as any).agent.abort).toHaveBeenCalledTimes(1);
    expect((runtime as any).agent.continue).toHaveBeenCalledTimes(1);
    expect(delivered).toEqual(["admitted", "queued once"]);
    await runtime.dispose();
  });
});
