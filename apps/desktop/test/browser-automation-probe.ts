import { app, nativeImage } from "electron";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { BrowserHost } from "../electron/main/browser-host";
import { BrowserPane } from "../electron/main/browser-view";
import { BrowserTabsPane } from "../electron/main/browser-tabs-pane";
import { BrowserBroker } from "../electron/main/browser-broker";

const scratch = join(app.getPath("temp"), "nexus-browser-capability-probe");
mkdirSync(scratch, { recursive: true });
app.setPath("userData", join(scratch, "profile"));
// Report uncaught native event failures to the probe log instead of Electron's
// modal error box, which would block automation and play a Windows alert.
process.on("uncaughtException", error => {
  console.error("PROBE_UNCAUGHT", error);
  writeFileSync(join(scratch, "result.json"), JSON.stringify({ ok: false, error: error.stack }));
  app.exit(1);
});
process.on("unhandledRejection", error => {
  console.error("PROBE_REJECTION", error);
  writeFileSync(join(scratch, "result.json"), JSON.stringify({ ok: false, error: String(error) }));
  app.exit(1);
});
const fixture = `<!doctype html><meta name="viewport" content="width=device-width"><style>body{margin:24px;background:#fafafa;color:#181818;font:16px Arial}h1{color:#245fcd}button,input,select{font:inherit;margin:8px;padding:8px}.long{height:6000px;background:repeating-linear-gradient(#eee 0 200px,#cef 200px 400px)}</style><h1>Nexus browser verification</h1><button>Save</button><input aria-label="Name"><input type="checkbox" aria-label="Enabled"><select aria-label="Color"><option>Red</option><option>Green</option></select><iframe src="/frame"></iframe><button id="popup">Open tab</button><a href="/download" download>Download fixture</a><div class="long">Page content</div><script>document.querySelector('button').onclick=()=>document.querySelector('button').textContent='Saved';document.querySelector('#popup').onclick=()=>window.open('/popup','_blank');console.warn('Probe warning');console.warn('Probe warning')</script>`;
const server = createServer((request, response) => {
  if (request.url === "/download") { response.writeHead(200, { "Content-Type": "text/plain", "Content-Disposition": 'attachment; filename="fixture.txt"' }); response.end("Nexus download"); }
  else { response.writeHead(200, { "Content-Type": "text/html" }); response.end(request.url === "/frame" ? '<button onclick="this.textContent=\'Inside saved\'">Inside</button>' : request.url === "/popup" ? "<h1>Popup document</h1>" : fixture); }
});

void app.whenReady().then(async () => {
  const tabs = new BrowserTabsPane(() => {}, onState => new BrowserPane(onState));
  const host = new BrowserHost({ pane: tabs, getFileRoot: async () => scratch, getScratchDir: () => scratch, onState() {}, approveSite: async () => true });
  const broker = new BrowserBroker(host);
  const assertions: string[] = [];
  const check = (condition: unknown, name: string) => { if (!condition) throw new Error(name); assertions.push(name); console.log("CHECK", name); };
  const deadline = setTimeout(() => { writeFileSync(join(scratch, "result.json"), JSON.stringify({ ok: false, error: "Probe deadline", assertions })); host.disposeGuest(); app.exit(1); }, 60_000);
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const context = { sessionId: "probe", mode: "agent" as const };
    check((await broker.open({ url }, context)).ok, "Native hidden guest starts");
    const browserId = host.activeBrowserId("probe");
    const target = { ...context, browserId };
    const interact = async (input: Parameters<BrowserBroker["interact"]>[0]) => { writeFileSync(join(scratch, "stage.txt"), JSON.stringify(input)); const result = await broker.interact(input, target); if (!result.ok) throw new Error(JSON.stringify(result)); };
    await interact({ action: "fill", locator: { label: "Name" }, text: "Nexus" });
    await interact({ action: "check", locator: { label: "Enabled" } });
    await interact({ action: "select", locator: { label: "Color" }, values: ["Green"] });
    await interact({ action: "click", locator: { role: "button", name: "Save" } });
    await interact({ action: "click", locator: { frames: ["iframe"], role: "button", name: "Inside" } });
    const state = await host.evaluate(`({name:document.querySelector('input').value,checked:document.querySelector('input[type=checkbox]').checked,color:document.querySelector('select').value,button:document.querySelector('button').textContent,frame:document.querySelector('iframe').contentDocument.querySelector('button').textContent})`, host.resolveTarget("probe", browserId));
    const values = state as { name: string; checked: boolean; color: string; button: string; frame: string };
    check(values.name === "Nexus" && values.checked && values.color === "Green" && values.button === "Saved" && values.frame === "Inside saved", "Locators, native input and iframe interaction");
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844, mobile: true }]) {
      check((await broker.viewport(viewport, target)).ok, `Viewport ${viewport.width}`);
      const shot = await host.screenshot({ format: "png" }, "probe", host.resolveTarget("probe", browserId));
      const image = nativeImage.createFromBuffer(Buffer.from(shot.data, "base64"));
      const pixels = image.toBitmap(); const colors = new Set<string>();
      for (let index = 0; index < pixels.length; index += 160) colors.add(pixels.subarray(index, index + 3).toString("hex"));
      check(image.getSize().width === viewport.width && colors.size > 20, `Nonblank screenshot ${viewport.width}`);
      writeFileSync(join(scratch, `viewport-${viewport.width}.png`), image.toPNG());
    }
    const tall = await host.screenshot({ format: "png", fullPage: true }, "probe", host.resolveTarget("probe", browserId)) as { truncated?: boolean };
    check(tall.truncated, "Full-page height limit is explicit");
    check((await broker.service("developer", { operation: "enable" }, target)).ok, "Per-site Developer grant");
    await broker.evaluate("fetch('/resource').then(r=>r.text())", target);
    const events = await broker.service("events", { cursor: 0 }, target);
    check(events.ok && (events.result as { events: unknown[] }).events.length > 0, "Bounded network events");
    check((await broker.service("developer", { operation: "disable" }, target)).ok, "Developer revocation cleans up");
    check((await broker.service("developer", { operation: "enable" }, target)).ok, "Developer regrant initializes again");
    check((await broker.snapshot(target)).ok, "Automation reconnects after Developer revocation");
    await interact({ action: "click", locator: { role: "link", name: "Download fixture" } });
    let downloads: any;
    for (let attempt = 0; attempt < 25; attempt++) { downloads = await broker.service("downloads", { operation: "list" }, target); if (downloads.result?.downloads?.[0]?.state === "completed") break; await new Promise(resolve => setTimeout(resolve, 100)); }
    check(downloads?.result?.downloads?.[0]?.state === "completed", "Managed download completes in scratch");
    check((await broker.service("page", { operation: "export", format: "text" }, target)).ok, "Page text export");
    check((await broker.service("styles", { operation: "apply", selector: "h1", properties: { color: "red" } }, target)).ok, "Temporary style preview");
    check((await broker.service("styles", { operation: "clear" }, target)).ok, "Style preview cleanup");
    await interact({ action: "click", locator: { role: "button", name: "Open tab" } });
    for (let attempt = 0; attempt < 25 && tabs.listTabs().length < 2; attempt++) await new Promise(resolve => setTimeout(resolve, 100));
    const popup = tabs.listTabs().find(tab => tab.openerBrowserId === browserId);
    check(popup && tabs.listTabs().find(tab => tab.browserId === browserId)?.state?.url === `${url}/`, "Popup retains opener page and own native guest");
    if (popup) {
      const popupTarget = host.resolveTarget("probe", popup.browserId);
      await host.evaluate("setTimeout(() => window.close(), 25); true", popupTarget);
      for (let attempt = 0; attempt < 25 && tabs.hasTab("probe", popup.browserId); attempt++) await new Promise(resolve => setTimeout(resolve, 100));
      check(!tabs.hasTab("probe", popup.browserId) && tabs.activeBrowserId("probe") === browserId, "Self-closing popup releases services and restores opener");
    }
    const pending = broker.interact({ action: "wait", locator: { text: "Never appears" } }, target);
    await new Promise(resolve => setTimeout(resolve, 100));
    await broker.control("user", { ...target, actor: "user" });
    check((await pending).code === "BROWSER_CANCELLED", "User takeover cancels an active locator wait");
    check((await broker.interact({ action: "click", locator: { text: "Saved" } }, target)).code === "BROWSER_POLICY_BLOCKED", "Takeover blocks agent mutation");
    await broker.control("agent", { ...target, actor: "user" });
    check((await broker.snapshot(target)).ok, "Guest remains inspectable after cancellation");
    writeFileSync(join(scratch, "result.json"), JSON.stringify({ ok: true, assertions, state: values }, null, 2));
    console.log("BROWSER_CAPABILITY_PROBE_PASS", assertions.length);
  } catch (error) { console.error(error); writeFileSync(join(scratch, "result.json"), JSON.stringify({ ok: false, error: String(error), assertions }, null, 2)); process.exitCode = 1; }
  finally { clearTimeout(deadline); try { host.disposeGuest(); } finally { server.closeAllConnections(); server.close(); app.exit(process.exitCode ?? 0); } }
});
