import { describe, expect, it } from "vitest";
import { rendererRegistrationError } from "./renderer.js";
import { validateManifest } from "./index.js";

const base = { schemaVersion: 1, id: "demo.ext", name: "Demo", version: "1.0.0", main: "main.js" };

describe("renderer extension contract", () => {
  it("requires an explicit grant and declared actions", () => {
    expect(validateManifest({ ...base, renderer: "renderer.mjs" }).error).toMatch(/renderer.extension/);
    expect(validateManifest({ ...base, renderer: "renderer.mjs", permissions: ["renderer.extension"],
      rendererActions: ["plugin.command", "composer.insertText"] }).ok).toBe(true);
    expect(validateManifest({ ...base, renderer: "renderer.mjs", permissions: ["renderer.extension"],
      rendererActions: ["session.read"] }).error).toMatch(/unknown action/);
    expect(validateManifest({ ...base, renderer: 123, permissions: ["renderer.extension"] }).ok).toBe(false);
    expect(validateManifest({ ...base, renderer: "../other.mjs", permissions: ["renderer.extension"] }).ok).toBe(false);
  });

  it("limits tool cards and code tags to the contributing plugin", () => {
    expect(rendererRegistrationError("demo.ext", {
      slot: "toolCard", toolName: "search", component: () => null,
    }, ["search"])).toBeUndefined();
    expect(rendererRegistrationError("demo.ext", {
      slot: "toolCard", toolName: "other", component: () => null,
    }, ["search"])).toMatch(/belong/);
    expect(rendererRegistrationError("demo.ext", {
      slot: "blockRenderer", language: "demo.ext:chart", component: () => null,
    }, [])).toBeUndefined();
    expect(rendererRegistrationError("demo.ext", {
      slot: "blockRenderer", language: "other.ext:chart", component: () => null,
    }, [])).toMatch(/namespace/);
  });

  it("rejects invalid triggers and missing components", () => {
    expect(rendererRegistrationError("demo.ext", { slot: "composerTrigger", trigger: "!", items: () => [] }, [])).toBeUndefined();
    expect(rendererRegistrationError("demo.ext", { slot: "composerTrigger", trigger: "/", items: () => [] }, [])).toMatch(/trigger/);
    expect(rendererRegistrationError("demo.ext", { slot: "composerControl" }, [])).toMatch(/component/);
  });
});
