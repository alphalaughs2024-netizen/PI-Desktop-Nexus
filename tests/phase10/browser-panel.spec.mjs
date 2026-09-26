import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";
import axePlaywright from "axe-playwright";
const { axe } = axePlaywright;
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFixtureServer } from "./fixture-server.mjs";

const root = process.cwd();
const appRoot = join(root, "apps", "desktop");

async function launchApp() {
  const profile = await mkdtemp(join(tmpdir(), "nexus-phase10-"));
  const app = await electron.launch({
    executablePath: join(appRoot, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "Electron.app/Contents/MacOS/Electron"),
    args: ["."],
    cwd: appRoot,
    env: { ...process.env, PI_DESKTOP_DATA_DIR: profile, NEXUS_PHASE10_TEST: "1", ELECTRON_RENDERER_URL: "" },
  });
  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  return { app, window, profile };
}

test.describe("Phase 10 Browser Work Panel", () => {
  let fixture;
  test.beforeAll(async () => { fixture = await startFixtureServer(); });
  test.afterAll(async () => { await new Promise((resolve) => fixture.server.close(resolve)); });

  test("opens Browser from the command palette and keeps one canonical resource", async () => {
    const { app, window, profile } = await launchApp();
    try {
      await window.getByRole("button", { name: /search|command/i }).first().click().catch(() => {});
      await window.keyboard.press("Control+Shift+P");
      await window.getByRole("textbox").last().fill("Open Browser");
      await expect(window.getByText("Open Browser")).toBeVisible();
      await window.getByText("Open Browser").click();
      await expect(window.getByTestId("work-panel")).toBeVisible();
      await expect(window.locator('[data-browser-readiness]')).toBeVisible();
      await expect(window.locator('[data-work-panel-tab="browser"]')).toHaveCount(1);
    } finally { await app.close(); await rm(profile, { recursive: true, force: true }); }
  });

  test("navigates a deterministic fixture and passes the Browser axe scan", async () => {
    const { app, window, profile } = await launchApp();
    try {
      await window.keyboard.press("Control+J");
      await window.getByRole("button", { name: /Browser/i }).click();
      const address = window.getByRole("textbox", { name: /Browser address/i });
      await address.fill(`${fixture.baseURL}/ready.html`);
      await address.press("Enter");
      await expect(window.getByText("Phase 10 Ready Fixture")).toBeVisible();
      await axe(window, { exclude: [[".browser-guest-surface"]] });
    } finally { await app.close(); await rm(profile, { recursive: true, force: true }); }
  });

  test("captures docked and maximized Browser frames", async () => {
    const { app, window, profile } = await launchApp();
    try {
      await window.keyboard.press("Control+J");
      await window.getByRole("button", { name: /Browser/i }).click();
      await expect(window.locator('[data-work-panel-presentation="docked"]')).toHaveScreenshot("phase10-browser-docked.png");
      await window.getByRole("button", { name: /Maximize Work Panel/i }).click();
      await expect(window.locator('[data-work-panel-presentation="maximized"]')).toHaveScreenshot("phase10-browser-maximized.png");
    } finally { await app.close(); await rm(profile, { recursive: true, force: true }); }
  });
});
