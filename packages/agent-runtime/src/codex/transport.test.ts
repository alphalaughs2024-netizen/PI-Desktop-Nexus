import { afterEach, expect, it } from "vitest";
import { AppServerTransport } from "./transport.js";
const transports: AppServerTransport[] = [];
afterEach(async () => { await Promise.all(transports.splice(0).map(t => t.close())); });
it("closes a malformed stream instead of leaving a live turn invisible", async () => {
  let exits = 0;
  const transport = new AppServerTransport(process.execPath, ["-e", "process.stdin.once('data',()=>{console.log('invalid-json');setInterval(()=>{},1000);});"], { cwd: process.cwd(), env: {} }, { event: () => undefined, request: () => undefined, exit: () => { exits++; } }); transports.push(transport);
  await expect(transport.request("initialize", {})).rejects.toThrow("CODEX_INVALID_FRAME");
  expect(exits).toBeGreaterThan(0); await transport.close();
});
it("redacts credential values from engine startup diagnostics", async () => {
  const transport = new AppServerTransport(process.execPath, ["-e", "process.stdin.once('data',()=>{console.error('bad: '+process.env.NEXUS_CODEX_PROVIDER_KEY);process.exit(1);});"], { cwd: process.cwd(), env: { NEXUS_CODEX_PROVIDER_KEY: "fixture-secret-do-not-print" } }, { event: () => undefined, request: () => undefined, exit: () => undefined }); transports.push(transport);
  try { await transport.request("initialize", {}); throw new Error("expected failure"); }
  catch (error) { expect(String(error)).toContain("[redacted]"); expect(String(error)).not.toContain("fixture-secret-do-not-print"); }
});

it("rejects a syntactically valid but invalid frame shape", async () => {
  let exits = 0;
  const transport = new AppServerTransport(process.execPath, ["-e", "process.stdin.once('data',()=>{console.log('null');setInterval(()=>{},1000);});"], { cwd: process.cwd(), env: {} }, { event: () => undefined, request: () => undefined, exit: () => { exits++; } }); transports.push(transport);
  await expect(transport.request("initialize", {})).rejects.toThrow("CODEX_INVALID_FRAME");
  expect(exits).toBeGreaterThan(0);
});
it("redacts credentials split across stderr chunks", async () => {
  const transport = new AppServerTransport(process.execPath, ["-e", "process.stdin.once('data',()=>{const key=process.env.NEXUS_CODEX_PROVIDER_KEY;process.stderr.write('bad: '+key.slice(0,10));setTimeout(()=>{process.stderr.write(key.slice(10));process.exit(1);},50);});"], { cwd: process.cwd(), env: { NEXUS_CODEX_PROVIDER_KEY: "fixture-secret-do-not-print" } }, { event: () => undefined, request: () => undefined, exit: () => undefined }); transports.push(transport);
  try { await transport.request("initialize", {}); throw new Error("expected failure"); }
  catch (error) { expect(String(error)).toContain("[redacted]"); expect(String(error)).not.toContain("fixture-secret"); }
});
