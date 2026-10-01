import { app, BrowserWindow } from "electron";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { BrowserPane } from "../../apps/desktop/electron/main/browser-view";
import { BrowserTabsPane } from "../../apps/desktop/electron/main/browser-tabs-pane";
import { BrowserHost } from "../../apps/desktop/electron/main/browser-host";

const directory = process.argv[2];
app.setPath("userData", join(directory, "profile"));
const report: Record<string, unknown> = { passed: false, events: [] };
const waitFor = async (predicate: () => boolean) => {
  const until = Date.now() + 12_000;
  while (!predicate()) {
    if (Date.now() > until) throw new Error("Browser surface did not become ready");
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};
let window: BrowserWindow | undefined;
let host: BrowserHost | undefined;
let loads = 0;
const server = createServer((request, response) => {
  if (request.url === "/") loads++;
  response.setHeader("Content-Type", "text/html");
  response.end('<!doctype html><style>body{margin:0;background:#183c29;color:white;font:24px sans-serif}h1{background:#ae3151;padding:32px}button{margin:24px}</style><h1>Native surface fixture</h1><button>Ready</button>');
});

async function run() {
  await app.whenReady();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}/`;
  window = new BrowserWindow({ show: false, width: 1000, height: 800, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await window.loadURL("about:blank");
  const panes: BrowserPane[] = [];
  const tabs = new BrowserTabsPane(() => { (report.events as unknown[]).push(tabs.surfaceStatus()); }, onState => { const pane = new BrowserPane(onState); panes.push(pane); return pane; });
  tabs.setWindow(window);
  host = new BrowserHost({ pane: tabs, getFileRoot: async () => directory, getScratchDir: () => directory, onState() {} });
  host.activateTab("fixture", "browser-core-1");
  tabs.setVisible(true);
  const pane = panes[0];
  await host.navigate({ url }, "fixture");
  assert.equal(pane.surfaceStatus().paint, "unknown");
  assert.equal(pane.surfaceStatus().attachment, "detached");
  let captures = 0;
  const original = pane.probeSurface.bind(pane);
  pane.probeSurface = async () => ++captures === 1 ? { status: "empty", width: 0, height: 0, byteLength: 0 } : original();
  host.setCoreSurface({ sessionId: "fixture", browserId: "browser-core-1", visible: true, bounds: { x: 20, y: 100, width: 720, height: 560 } });
  await waitFor(() => pane.surfaceStatus().paint === "painted");
  assert.ok(captures >= 2 && captures <= 3, "Transient capture must recover within the bounded attempts");
  report.captureAttempts = captures;
  assert.equal(loads, 1);
  assert.equal((report.events as any[]).some(event => event.paint === "blank"), false);
  report.initial = pane.surfaceStatus();
  const image = await pane.getWebContents()!.capturePage();
  writeFileSync(join(directory, "surface.png"), image.toPNG());
  const bitmap = image.toBitmap(); const colors = new Set<number>();
  for (let offset = 0; offset + 4 <= bitmap.length; offset += 64) colors.add(bitmap.readUInt32LE(offset));
  assert.ok(image.getSize().width > 0 && colors.size > 5, "Captured page must contain actual colored content");
  report.capture = { ...image.getSize(), colors: colors.size };
  host.setCoreSurface({ sessionId: "fixture", browserId: "browser-core-1", visible: false, bounds: { x: 0, y: 0, width: 0, height: 0 } });
  host.setCoreSurface({ sessionId: "fixture", browserId: "browser-core-1", visible: true, bounds: { x: 20, y: 100, width: 600, height: 500 } });
  await waitFor(() => pane.surfaceStatus().paint === "painted");
  assert.equal(loads, 1);
  assert.equal(pane.getState()?.url, url);
  report.reattach = pane.surfaceStatus();
  report.passed = true;
}
run().catch(error => { report.error = error.message; process.exitCode = 1; }).finally(() => {
  host?.disposeGuest(); window?.destroy(); server.close();
  writeFileSync(join(directory, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  app.exit(process.exitCode ?? 0);
});
