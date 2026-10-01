import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const core = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");
const toolbar = await readFile(new URL("../src/components/workpanel/BrowserToolbar.tsx", import.meta.url), "utf8");
const tabs = await readFile(new URL("../src/components/workpanel/BrowserTabStrip.tsx", import.meta.url), "utf8");

test("Native Browser menus retain the page; only covering inspectors and global overlays detach it", () => {
  assert.match(core, /blocked=\{!active \|\| blocked \|\| \(diagnosticsOpen && !inspectorBesidePage\)\}/);
  assert.match(core, /onMenuOpenChange=\{setToolbarMenuOpen\}/);
  assert.match(core, /onContextMenuOpenChange=\{setTabMenuOpen\}/);
  assert.match(toolbar, /onMenuOpenChange\?\.\(menuOpen\)/);
  assert.match(tabs, /onContextMenuOpenChange\?\.\(Boolean\(contextMenu\)\)/);
});
