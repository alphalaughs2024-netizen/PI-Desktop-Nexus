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
  for (const width of process.env.COMPOSER_INSPECTION_CONTEXT_ONLY ? [] : [1280, 560, 375]) {
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
      assert.match(await page.locator(".composer-configuration-chip").innerText(), /Agent\s*·\s*Ask/);
      assert.equal(buttons.length, 6);
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
      const actions = page.getByRole("button", { name: "Add and actions", exact: true });
      await actions.focus();
      await page.keyboard.press("ArrowDown");
      const actionsMenu = page.getByRole("menu", { name: "Add and actions", exact: true });
      await actionsMenu.waitFor();
      assert.ok(await page.getByRole("menuitem", { name: "Enhance prompt", exact: true }).isDisabled());
      const actionsBounds = await actionsMenu.boundingBox();
      assert.ok(actionsBounds.x >= 0 && actionsBounds.x + actionsBounds.width <= width + 1, `${theme}/${width}: actions menu clipped`);
      await page.getByRole("menuitem", { name: "Add files", exact: true }).click();
      await page.waitForFunction(() => window.composerInspection.pickerCalls() === 1);
      await actions.click();
      await page.keyboard.press("Escape");
      assert.ok(await actions.evaluate(element => element === document.activeElement));
      await input.fill("Organize this prompt");
      await actions.click();
      await page.getByRole("menuitem", { name: "Enhance prompt", exact: true }).click();
      await page.locator('.composer-actions-trigger[aria-busy="true"]').waitFor();
      await page.evaluate(() => window.composerInspection.finishEnhancement());
      await page.waitForFunction(() => document.querySelector(".composer-input").textContent === "Improved: Organize this prompt");
      await actions.click();
      assert.ok(await page.getByRole("menuitem", { name: "Add files", exact: true }).evaluate(element => document.activeElement === element));
      await page.keyboard.press("End");
      assert.ok(await page.getByRole("menuitem", { name: "Undo enhancement", exact: true }).evaluate(element => document.activeElement === element));
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => document.querySelector(".composer-input").textContent === "Organize this prompt");
      await input.fill("");
      await page.locator(".composer-configuration-chip").click();
      await page.locator(".composer-permission-menu").waitFor();
      const configurationBounds = await page.locator(".composer-permission-menu").boundingBox();
      assert.ok(configurationBounds.x >= 0 && configurationBounds.x + configurationBounds.width <= width + 1);
      await page.mouse.click(10, 100);
      assert.ok(await page.locator(".composer-permission-menu").count() === 0);
      for (const mode of ["Plan", "Goal", "Agent"]) {
        await page.locator(".composer-configuration-chip").click();
        await page.getByRole("menuitemradio", { name: mode, exact: true }).click();
        assert.match(await page.locator(".composer-configuration-chip").innerText(), new RegExp(mode));
        if (mode === "Goal") {
          await page.locator(".composer-configuration-chip").click();
          assert.ok(await page.locator('.composer-configuration-menu [role="group"]').nth(1).getByRole("menuitemradio").evaluateAll(items => items.every(item => item.disabled)));
          await page.keyboard.press("Escape");
        }
      }
      await page.locator(".composer-configuration-chip").click();
      await page.getByRole("menuitemradio", { name: "Full access", exact: true }).click();
      const confirmation = page.locator(".composer-full-access-overlay");
      await confirmation.waitFor();
      assert.ok(await confirmation.evaluate(element => element.parentElement === document.body));
      await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.match(await page.locator(".composer-configuration-chip").innerText(), /Ask/);
      observations.push({ width, theme, shellHeight: initial.height, multilineHeight: multiline.height, controls: buttons.length });
    }
  }
  await page.goto(`${origin}/test/fixtures/composer-polish.html`);
  await page.locator(".composer-shell").waitFor();
  const ring = page.locator(".context-inspector-trigger");
  assert.match(await ring.getAttribute("aria-label"), /20% context used/);
  const progress = page.locator(".context-inspector-ring-progress");
  const offset = Number(await progress.getAttribute("stroke-dashoffset"));
  const circumference = Number(await progress.getAttribute("stroke-dasharray"));
  assert.ok(Math.abs(offset / circumference - (1 - 25200 / 128000)) < 0.001);
  await page.evaluate(() => window.composerInspection.render(false, false));
  await page.waitForFunction(() => document.querySelector(".context-inspector-trigger")?.getAttribute("aria-label") === "Context usage not reported yet");
  await ring.click();
  assert.ok(await page.getByRole("dialog", { name: "Context", exact: true }).getByText("Context usage not reported yet").isVisible());
  await page.keyboard.press("Escape");
  assert.equal(await progress.getAttribute("stroke-dashoffset"), await progress.getAttribute("stroke-dasharray"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await page.locator(".composer-shell").evaluate(element => getComputedStyle(element, "::after").transitionDuration), "0s");
  await page.evaluate(() => { document.documentElement.dataset.surface = "browser-composer"; window.composerInspection.render(true); });
  assert.ok(await page.locator(".composer-model-thinking-compact").isVisible());
  assert.equal(await page.locator(".composer-model-thinking-compact").evaluate(element => element.getBoundingClientRect().width), 32);
  assert.equal(await page.locator(".composer-model-group-control .context-inspector").count(), 1);
  for (const policy of ["ask", "accept-edits", "auto", "full-access"]) {
    await page.evaluate(policy => window.composerInspection.store.setState(state => ({ sessions: state.sessions.map(session => ({ ...session, mode: "agent", permissionMode: policy })) })), policy);
    await page.waitForTimeout(50);
    const controls = await page.locator(".composer-toolbar button").evaluateAll(elements => elements.map(element => {
      const { left, right, top, bottom } = element.getBoundingClientRect();
      return { left, right, top, bottom };
    }));
    for (let index = 0; index < controls.length; index++) {
      for (const other of controls.slice(index + 1)) {
        const control = controls[index];
        assert.ok(control.right <= other.left + 1 || other.right <= control.left + 1 || control.bottom <= other.top + 1 || other.bottom <= control.top + 1, `${policy}: narrow control collision`);
      }
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ observations, reducedMotion: "passed", compactModel: "passed", rendererErrors: errors }, null, 2));
} finally {
  await browser.close();
}
