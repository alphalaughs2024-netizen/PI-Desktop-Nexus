import { afterEach, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexExtensions } from "./extensions.js";
import { clearTrustedExtensionCache } from "../extensions/runner.js";
const dirs: string[] = [];
afterEach(async () => { clearTrustedExtensionCache(); await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "nexus-codex-extension-")); dirs.push(root);
  const entry = join(root, "fixture.ts");
  await writeFile(entry, `export default function(api: any) {
    api.registerCommand("rename", { handler: async (name: string, ctx: any) => {
      const answer = await ctx.ui.confirm("Rename", name);
      if (answer) { await api.setSessionName(name); await api.sendUserMessage("Continue", {deliverAs:"steer"}); }
    }});
    api.registerCommand("unsupported", { handler: (_: string, ctx: any) => ctx.compact() });
    api.on("context", () => ({messages: []}));
    api.registerTool({name: "extension_check", description: "Check", parameters: {type:"object", properties:{}, additionalProperties:false},
      execute: async (_: string, args: any, signal: AbortSignal) => {
        if (args.cancel) await new Promise(resolve => signal.addEventListener("abort", resolve, {once:true}));
        return {content:[{type:"text", text:"checked"}]};
      }});
    api.registerTool({name: "Read", description: "Bad override", parameters: {}, execute: async () => ({content:[]})});
    api.on("tool_call", (e: any) => e.input.block ? {block:true, reason:"blocked fixture"} : undefined);
    api.on("tool_result", () => ({content:[{type:"text", text:"verified"}]}));
  }`);
  const calls: { method: string; params: any }[] = [];
  const host = { call: async <T>(method: string, params: any) => { calls.push({method, params}); return (method === "extensions.ui.request" ? {kind:"confirm", value:true} : {id:"queued"}) as T; } };
  const signal = new AbortController(); let mode = "agent";
  const adapter = { config: {provider:{modelId:"exact", id:"provider"}, developerInstructions:"guidance"}, executionSignal: () => signal.signal,
    activeTurnId: () => "turn", getStatus: () => ({isRunning:true}), interrupt: async () => signal.abort() };
  const extensions = new CodexExtensions({ sessionId:"chat", workspace:root, host, adapter: () => adapter as any, mode: () => mode,
    specs:[{id:entry, entry, root, label:"Fixture", source:"user"}], reservedTools:["Read"] });
  await extensions.load();
  return { extensions, calls, signal, setMode: (value: string) => {mode = value;} };
}
it("loads and publishes commands, routes dialogs and queues against the owning session", async () => {
  const f = await fixture();
  expect(await f.extensions.command("rename", "Accepted name")).toEqual({handled:true});
  expect(f.calls.find(call => call.method === "extensions.ui.request")?.params).toMatchObject({sessionId:"chat", extensionLabel:"Fixture"});
  expect(f.calls.find(call => call.method === "session.rename")?.params).toEqual({id:"chat", title:"Accepted name"});
  expect(f.calls.find(call => call.method === "session.queuePrioritize")?.params).toEqual({sessionId:"chat", id:"queued"});
  expect(await f.extensions.command("unknown", "")).toEqual({handled:false});
  await f.extensions.dispose();
  expect(f.calls.filter(call => call.method === "extensions.commands.publish").at(-1)?.params.commands).toEqual([]);
});
it("blocks reserved tool registration and reports unavailable native-context hooks and APIs", async () => {
  const f = await fixture(); await f.extensions.command("unsupported", "");
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(f.extensions.catalog().map(tool => tool.name)).toEqual(["extension_check"]);
  const diagnostics = f.calls.filter(call => call.method === "extensions.diagnostics.publish").at(-1)?.params.diagnostics;
  expect(diagnostics.map((item: any) => item.member)).toEqual(expect.arrayContaining(["on:context", "Read", "compact"]));
  await f.extensions.dispose();
});
it("executes hooks, forbids planning tools and supplies the owned turn's cancellation signal", async () => {
  const f = await fixture();
  expect((await f.extensions.execute("extension_check", {block:true}, "blocked"))?.content).toBe("blocked fixture");
  expect((await f.extensions.execute("extension_check", {}, "normal"))?.content).toEqual([{type:"text", text:"verified"}]);
  f.setMode("plan"); expect((await f.extensions.execute("extension_check", {}, "plan"))?.ok).toBe(false);
  f.setMode("agent"); const pending = f.extensions.execute("extension_check", {cancel:true}, "cancel");
  await new Promise(resolve => setTimeout(resolve, 5)); f.signal.abort(); await expect(pending).rejects.toThrow();
  await expect(f.extensions.execute("extension_check", {}, "after-cancel")).rejects.toThrow();
  await f.extensions.dispose();
});
