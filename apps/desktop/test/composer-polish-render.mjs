import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

// Opt-in visual inspection of the real component; no host or agent is started.
const origin = process.env.COMPOSER_INSPECTION_URL ?? "http://127.0.0.1:5184";
const output = resolve(process.env.COMPOSER_INSPECTION_OUTPUT ?? "test-results/composer-polish");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const observations = [];
try {
  for (const width of [1280, 560, 375]) {
    await page.setViewportSize({ width, height: 780 });
    await page.goto(`${origin}/test/fixtures/composer-polish.html`);
    const shell = page.locator(".composer-shell");
    const input = page.locator(".composer-input");
    await shell.waitFor();
    for (const theme of ["dark", "light", "twilight-mountains", "obsidian-horizon", "emerald-afterglow", "alpine-light"]) {
      await page.goto(`${origin}/test/fixtures/composer-polish.html`);
      await shell.waitFor();
      await page.selectOption("#theme", theme);
      await page.locator("#theme").focus();
      await page.waitForTimeout(220);
      const initial = await shell.boundingBox();
      const buttons = await page.locator(".composer-toolbar button").evaluateAll(elements => elements.map(element => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height, label: element.getAttribute("aria-label") };
      }));
      for (const button of buttons) {
        assert.equal(button.height, 32, `${theme}/${width}: ${button.label} height`);
        assert.ok(button.x >= initial.x && button.x + button.width <= initial.x + initial.width + 1, `${theme}/${width}: control outside shell`);
      }
      const groups = await page.locator(".composer-toolbar > div").evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      }));
      for (let index = 0; index < groups.length; index++) {
        for (const other of groups.slice(index + 1)) {
          const group = groups[index];
          assert.ok(group.right <= other.left + 1 || other.right <= group.left + 1 || group.bottom <= other.top + 1 || other.bottom <= group.top + 1, `${theme}/${width}: group collision`);
        }
      }
      await input.focus();
      await page.waitForTimeout(220);
      assert.deepEqual(await shell.boundingBox(), initial, `${theme}/${width}: focus shifted shell`);
      await page.locator(".send-btn").isDisabled().then(disabled => assert.ok(disabled));
      await page.locator("#theme").focus();
      await page.waitForTimeout(220);
      await shell.screenshot({ path: resolve(output, `${theme}-${width}-empty.png`) });
      await input.fill("Check this layout");
      await page.locator(".send-btn:not(:disabled)").waitFor();
      assert.ok(await page.locator(".send-btn").isEnabled());
      await input.fill(Array.from({ length: 10 }, (_, index) => `Line ${index + 1}: check natural draft growth`).join("\n"));
      const multiline = await input.evaluate(element => ({ height: element.clientHeight, scrollHeight: element.scrollHeight, lineHeight: parseFloat(getComputedStyle(element).lineHeight) }));
      assert.ok(multiline.height <= multiline.lineHeight * 7 + 2);
      assert.ok(multiline.scrollHeight > multiline.height);
      await input.fill("");
      await page.locator(".composer-model-thinking-chip").click();
      const menu = page.locator(".composer-model-thinking-menu");
      await menu.waitFor();
      const menuBounds = await menu.boundingBox();
      assert.ok(menuBounds.x >= 0 && menuBounds.x + menuBounds.width <= width + 1, `${theme}/${width}: model menu clipped`);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Permission mode", exact: true }).click();
      await page.locator(".composer-permission-menu").waitFor();
      await page.mouse.click(10, 100);
      assert.ok(await page.locator(".composer-permission-menu").count() === 0);
      observations.push({ width, theme, shellHeight: initial.height, multilineHeight: multiline.height, controls: buttons.length });
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await page.locator(".composer-shell").evaluate(element => getComputedStyle(element, "::after").transitionDuration), "0s");
  await page.evaluate(() => { document.documentElement.dataset.surface = "browser-composer"; window.composerInspection.render(true); });
  assert.ok(await page.locator(".composer-model-thinking-compact").isVisible());
  assert.equal(await page.locator(".composer-model-group-control").evaluate(element => element.getBoundingClientRect().width), 32);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ observations, reducedMotion: "passed", compactModel: "passed", rendererErrors: errors }, null, 2));
} finally {
  await browser.close();
}
