import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/phase10",
  timeout: 45_000,
  expect: { timeout: 10_000, toHaveScreenshot: { animations: "disabled", caret: "hide", scale: "css" } },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  use: { trace: "retain-on-failure", video: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: undefined,
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{-projectName}{ext}",
});
