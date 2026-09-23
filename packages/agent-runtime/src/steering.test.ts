import { describe, expect, it, vi } from "vitest";
import { createPromptLifecycleEvent } from "./lifecycle.js";

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
});
