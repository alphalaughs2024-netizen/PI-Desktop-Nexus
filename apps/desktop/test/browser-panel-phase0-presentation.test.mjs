import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = async (path) => readFile(new URL(path, import.meta.url), "utf8");
const tabs = await read("../src/lib/work-panel-tabs.ts");
const componentSpec = await read("../../../docs/spec/04-ux/08-component-spec.md");
const uiIa = await read("../../../docs/spec/04-ux/01-ui-ia.md");
const interaction = await read("../../../docs/spec/04-ux/09-interaction-patterns.md");
const adr = await read("../../../docs/adr/0235-docked-and-maximized-work-panel-presentation.md");
const protocol = await read("../../../packages/shared/src/protocol.ts");

test("Phase 0 freezes a shared shell presentation contract", () => {
  assert.match(tabs, /WorkPanelPresentation = "docked" | "maximized"/);
  assert.match(tabs, /WorkPanelResourceProps/);
  assert.match(adr, /renderer-owned secondary workspace/);
  assert.match(adr, /does not alter native window geometry/);
  assert.match(adr, /does not create a second\nWebContentsView/);
});

test("Phase 0 keeps Browser identity independent from presentation", () => {
  assert.match(tabs, /CORE_BROWSER_TAB/);
  assert.match(tabs, /resource: "core:\/\/browser"/);
  assert.match(adr, /same Work Panel tab\/resource/);
  assert.match(adr, /same Work Panel tab\/resource/);
});

test("Phase 0 synchronizes UX and interaction contracts", () => {
  assert.match(componentSpec, /Work Panel presentation/);
  assert.match(uiIa, /Work Panel presentation contract/);
  assert.match(interaction, /Work Panel dock\/maximize contract/);
  assert.match(componentSpec, /conversation remains/);
});

test("Phase 0 preserves typed IPC boundary direction", () => {
  assert.match(protocol, /browserCoreSurfaceSet/);
  assert.match(adr, /React never imports\nElectron/);
  assert.match(adr, /BrowserBroker/);
});
