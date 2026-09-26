import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const frame = await readFile(new URL("../src/components/workpanel/WorkPanelFrame.tsx", import.meta.url), "utf8");
const panel = await readFile(new URL("../src/components/workpanel/WorkPanel.tsx", import.meta.url), "utf8");
const browser = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");
const guest = await readFile(new URL("../src/components/workpanel/BrowserGuestSurface.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");

test("Phase 2 has a shared shell with dock/maximize/close controls", () => {
  assert.match(frame, /WorkPanelPresentation/);
  assert.match(frame, /Maximize Work Panel/);
  assert.match(frame, /Dock Work Panel/);
  assert.match(frame, /Close Work Panel/);
  assert.match(panel, /WorkPanelFrame/);
  assert.match(panel, /transitionPresentation/);
});

test("Phase 2 keeps Browser in the same resource subtree and coordinates bounds", () => {
  assert.match(panel, /<BrowserCoreTab/);
  assert.match(panel, /presentation=\{presentation\}/);
  assert.match(panel, /transitioning=\{isPresentationTransitioning\}/);
  assert.match(browser, /BrowserGuestSurface/);
  assert.match(guest, /browserCoreSurfaceSet/);
  assert.match(browser, /data-browser-presentation/);
});

test("Phase 2 maximized frame is in-window and reduced-motion safe", () => {
  assert.match(styles, /\.work-panel-frame\.is-maximized/);
  assert.match(styles, /position: fixed/);
  assert.match(styles, /--work-panel-maximized-inset/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.doesNotMatch(frame, /BrowserWindow|WebContentsView/);
});
