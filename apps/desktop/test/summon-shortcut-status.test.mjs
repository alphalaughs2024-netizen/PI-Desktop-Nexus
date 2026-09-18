import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const shortcut = await import("../electron/main/summon-shortcut.ts");
const [protocolSource, typesSource, mainSource, apiSource, sectionSource] =
  await Promise.all([
    readFile(new URL("../../../packages/shared/src/protocol.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../packages/shared/src/types.ts", import.meta.url), "utf8"),
    readFile(new URL("../electron/main/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/settings/KeyboardShortcutsSection.tsx", import.meta.url), "utf8"),
  ]);

test("summon shortcut status distinguishes disabled, registered, and unavailable", () => {
  assert.deepEqual(shortcut.emptySummonShortcutStatus(), {
    binding: null,
    accelerator: null,
    registered: false,
  });
  assert.equal(
    shortcut.sameSummonShortcutStatus(
      { binding: "Mod+Shift+W", accelerator: "CommandOrControl+Shift+W", registered: true },
      { binding: "Mod+Shift+W", accelerator: "CommandOrControl+Shift+W", registered: true },
    ),
    true,
  );
  assert.equal(
    shortcut.sameSummonShortcutStatus(
      { binding: "Mod+Shift+W", accelerator: "CommandOrControl+Shift+W", registered: true },
      { binding: "Mod+Shift+W", accelerator: "CommandOrControl+Shift+W", registered: false, errorCode: "SHORTCUT_CONFLICT" },
    ),
    false,
  );
});

test("summon shortcut collision diagnostics de-duplicate by accelerator and platform", () => {
  const first = shortcut.summonShortcutFailureKey("Control+Shift+W", "win32");
  assert.equal(shortcut.shouldReportSummonShortcutFailure(null, first), true);
  assert.equal(shortcut.shouldReportSummonShortcutFailure(first, first), false);
  assert.equal(
    shortcut.shouldReportSummonShortcutFailure(
      first,
      shortcut.summonShortcutFailureKey("CommandOrControl+Shift+W", "win32"),
    ),
    true,
  );
});

test("summon shortcut registration state is exposed through IPC and Settings recovery copy", () => {
  assert.match(protocolSource, /summonShortcutGetStatus:/);
  assert.match(protocolSource, /summonShortcutStatus:/);
  assert.match(typesSource, /export type SummonShortcutStatus = \{/);
  assert.match(mainSource, /IPC\.invoke\.summonShortcutGetStatus/);
  assert.match(mainSource, /IPC\.event\.summonShortcutStatus/);
  assert.match(mainSource, /SHORTCUT_CONFLICT/);
  assert.match(mainSource, /shouldReportSummonShortcutFailure/);
  assert.match(apiSource, /getSummonShortcutStatus:/);
  assert.match(apiSource, /onSummonShortcutStatus:/);
  assert.match(sectionSource, /onSummonShortcutStatus/);
  assert.match(sectionSource, /shortcutUnavailable/);
});
