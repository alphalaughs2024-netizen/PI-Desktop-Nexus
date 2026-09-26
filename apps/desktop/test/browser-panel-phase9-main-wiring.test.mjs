import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("../electron/main/index.ts", import.meta.url), "utf8");
const broker = await readFile(new URL("../electron/main/browser-broker.ts", import.meta.url), "utf8");

test("toolbar actions dispatch through BrowserBroker", () => {
  const navigate = main.slice(main.indexOf('IPC.invoke.browserNavigate'), main.indexOf('IPC.invoke.browserAction'));
  const action = main.slice(main.indexOf('IPC.invoke.browserAction'), main.indexOf('IPC.invoke.browserSetBounds'));
  const screenshot = main.slice(main.indexOf('IPC.invoke.browserScreenshot'), main.indexOf('IPC.invoke.browserGetState'));
  assert.match(navigate, /browserBroker\.navigate/);
  assert.match(action, /browserBroker\.action/);
  assert.match(screenshot, /browserBroker\.screenshot/);
  assert.match(broker, /decideMode|decideNavigation/);
});

test("surface routing validates finite visible dimensions and rejects background retargeting", () => {
  const surface = main.slice(main.indexOf('IPC.invoke.browserCoreSurfaceSet'), main.indexOf('IPC.invoke.pluginLauncherToggle'));
  assert.match(surface, /Number\.isFinite/);
  assert.match(surface, /bounds\.width === 0/);
  assert.match(surface, /input\.sessionId !== visibleBrowserSessionId/);
});
