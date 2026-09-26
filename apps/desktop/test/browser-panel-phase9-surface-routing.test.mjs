import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [guest, host, main] = await Promise.all([
  readFile(new URL("../src/components/workpanel/BrowserGuestSurface.tsx", import.meta.url), "utf8"),
  readFile(new URL("../electron/main/browser-host.ts", import.meta.url), "utf8"),
  readFile(new URL("../electron/main/index.ts", import.meta.url), "utf8"),
]);

test("core guest surface is the only renderer bounds owner", () => {
  assert.match(guest, /browserCoreSurfaceSet/);
  assert.match(guest, /visible: false/);
  assert.doesNotMatch(guest, /BrowserHost|BrowserCdp|WebContents|ipcRenderer/);
  assert.match(host, /setCoreSurface/);
  assert.match(main, /browserHost\.setCoreSurface/);
});
