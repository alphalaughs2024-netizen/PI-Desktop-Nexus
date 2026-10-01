const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { resolve, join } = require("node:path");
const { writeFileSync } = require("node:fs");
const { _electron } = require("playwright-core");

// Standalone native regression probe, explicitly supplied with a test profile.
const appRoot = resolve(process.env.NEXUS_BROWSER_PROBE_APP_ROOT || join(__dirname, ".."));
if (!process.env.NEXUS_BROWSER_PROBE_PROFILE || !process.env.PI_DESKTOP_HOST_BIN) {
  throw new Error("Set NEXUS_BROWSER_PROBE_PROFILE and PI_DESKTOP_HOST_BIN to test resources");
}

(async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end('<!doctype html><title>Tab regression website</title><h1>Retained website</h1><label>Draft <input id="draft"></label><a href="/popup" target="_blank">Popup</a>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  let app;
  let deadline;
  try {
    app = await _electron.launch({
      executablePath: process.env.NEXUS_BROWSER_PROBE_ELECTRON || require("electron"),
      args: [appRoot],
      env: { ...process.env, PI_DESKTOP_DATA_DIR: process.env.NEXUS_BROWSER_PROBE_PROFILE, NEXUS_AGENT_ENGINE: "codex", PI_DESKTOP_DEV: "1" },
      timeout: 30000,
    });
    await app.evaluate(({ dialog }) => {
      globalThis.__browserProbeFailures = [];
      dialog.showErrorBox = (title, content) => globalThis.__browserProbeFailures.push({ title, content });
    });
    deadline = setTimeout(() => { console.error("Browser tab probe exceeded 90 seconds"); void app.evaluate(({ app }) => app.exit(1)); }, 90000);
    let page;
    for (let i = 0; i < 150; i++) {
      page = app.windows().find(window => /renderer\/index\.html/.test(window.url()) && !window.url().includes("surface="));
      if (page) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(page, "main window appears");
    const errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    await page.waitForFunction(() => !!window.__PI_DESKTOP__ && !!window.piDesktop);
    const sessionId = await page.evaluate(async () => {
      const response = await window.piDesktop.invoke(window.piDesktop.channels.invoke.sessionList);
      const sessions = response.data.sessions;
      const session = sessions.find(session => session.title === "hey") ?? sessions[0];
      if (!session) throw new Error("The test profile needs a chat");
      await window.__PI_DESKTOP__.selectSession(session.id);
      window.__PI_CAPTURE__ = 1;
      await window.__PI_DESKTOP__.openWorkPanelArtifact("browser");
      return session.id;
    });
    const address = page.getByRole("textbox", { name: "Browser address" });
    await address.fill(url);
    await address.press("Enter");
    await page.waitForFunction(() => document.querySelector(".browser-core-view")?.dataset.browserReadiness === "ready");
    const initial = await page.evaluate(async sessionId => {
      const result = await window.piDesktop.invoke(window.piDesktop.channels.invoke.browserTabs, { sessionId });
      const state = result.data;
      window.__tabProbe = { changes: [], last: state.activeBrowserId };
      window.__tabProbe.observer = new MutationObserver(() => {
        const selected = document.querySelector('[data-browser-tab][aria-selected="true"]')?.dataset.browserTab;
        if (selected && selected !== window.__tabProbe.last) {
          window.__tabProbe.last = selected;
          window.__tabProbe.changes.push(selected);
        }
      });
      window.__tabProbe.observer.observe(document.querySelector(".browser-core-view"), { subtree: true, attributes: true, childList: true });
      return state;
    }, sessionId);
    const websiteId = initial.activeBrowserId;
    const guestId = await app.evaluate(async ({ webContents }, url) => {
      const guest = webContents.getAllWebContents().find(wc => wc.getURL() === url);
      assertExists(guest);
      await guest.executeJavaScript('document.getElementById("draft").value="keep this draft"');
      return guest.id;
      function assertExists(value) { if (!value) throw new Error("Website guest missing"); }
    }, url);

    if (process.env.NEXUS_BROWSER_PROBE_FULL_VIEW === "1") {
      await page.locator('.composer-input[contenteditable="true"]').fill("Draft before Full view");
      await page.getByRole("button", { name: "Enter full view", exact: true }).click();
      await page.waitForFunction(() => document.querySelector(".app-shell")?.classList.contains("browser-full-view"));
      let composer;
      for (let i = 0; i < 100; i++) {
        composer = app.context().pages().find(p => p.url().includes("surface=browser-composer"));
        if (composer) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.ok(composer, "Native composer renderer appears");
      composer.on("pageerror", error => errors.push(String(error)));
      const input = composer.locator('.composer-input[contenteditable="true"]');
      await input.waitFor();
      assert.equal(await input.innerText(), "Draft before Full view", "Main draft reaches the native composer");
      await input.fill("Draft edited over the page");
      await new Promise(resolve => setTimeout(resolve, 150));
      const baseHeight = await composer.evaluate(() => innerHeight);
      await composer.locator(".composer-model-thinking-chip").click();
      await composer.locator('.composer-menu-entry').first().click();
      await composer.waitForFunction(base => innerHeight > base + 60, baseHeight);
      const modelMenu = await composer.locator(".composer-model-menu").boundingBox();
      const composerViewport = await composer.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      assert.ok(modelMenu.x >= 0 && modelMenu.y >= 0 && modelMenu.x + modelMenu.width <= composerViewport.width && modelMenu.y + modelMenu.height <= composerViewport.height, "Model menu fits native input bounds");
      await composer.locator(".composer-model-thinking-chip").click();
      await composer.waitForFunction(base => innerHeight === base, baseHeight);
      const themes = await Promise.all([page, composer].map(surface => surface.evaluate(() => ({
        theme: document.documentElement.dataset.theme,
        scenicTheme: document.documentElement.dataset.scenicTheme,
        text: getComputedStyle(document.documentElement).getPropertyValue("--ds-text-primary"),
      }))));
      assert.deepEqual(themes[1], themes[0], "Native composer retains main theme tokens");
      const tabGeometry = await page.locator(`[data-browser-tab="${websiteId}"]`).boundingBox();
      assert.ok(tabGeometry.width > 100 && tabGeometry.height > 20 && tabGeometry.y >= 0 && tabGeometry.y < 44, "Selected tab occupies the visible top band");
      console.log("FULL_VIEW_TAB_GEOMETRY", tabGeometry);
      assert.equal(await page.locator(".work-panel-header").evaluate(element => getComputedStyle(element).backdropFilter), "none", "Browser controls cannot blur over the tab band");
      const speechBoundary = await composer.evaluate(() => window.piDesktop.invoke(window.piDesktop.channels.invoke.speechTranscribe, null, "probe"));
      assert.equal(speechBoundary.error?.message, "Invalid speech recording", "Native composer reaches the speech service through its trusted identity");
      if (process.env.NEXUS_BROWSER_PROBE_SCREENSHOT) await page.locator(".browser-tab-strip").screenshot({ path: process.env.NEXUS_BROWSER_PROBE_SCREENSHOT.replace(/\.png$/, "-tabs.png") });
      const overlay = await app.evaluate(async ({ BrowserWindow, webContents }, guestId) => {
        const window = BrowserWindow.getAllWindows().find(w => /renderer\/index\.html/.test(w.webContents.getURL()) && !w.webContents.getURL().includes("surface="));
        const composer = window.contentView.children.find(view => view.webContents?.getURL().includes("surface=browser-composer"));
        const guest = window.contentView.children.find(view => view.webContents?.id === guestId);
        const capture = await composer.webContents.capturePage();
        const colors = new Set();
        const pixels = capture.toBitmap();
        for (let i = 0; i < pixels.length; i += 16) colors.add(pixels.readUInt32LE(i));
        return { guestBounds: guest?.getBounds(), composerBounds: composer.getBounds(), topmost: window.contentView.children.at(-1) === composer, colors: colors.size, png: capture.toPNG().toString("base64") };
      }, guestId);
      assert.equal(overlay.topmost, true, "Composer is above the page");
      assert.ok(overlay.guestBounds.width > 1000, "Page spans the app");
      assert.ok(overlay.composerBounds.y >= overlay.guestBounds.y && overlay.composerBounds.y < overlay.guestBounds.y + overlay.guestBounds.height, "Composer floats over native page bounds");
      assert.ok(overlay.colors > 20, "Native composer is nonblank");
      if (process.env.NEXUS_BROWSER_PROBE_SCREENSHOT) {
        writeFileSync(process.env.NEXUS_BROWSER_PROBE_SCREENSHOT.replace(/\.png$/, "-composer.png"), Buffer.from(overlay.png, "base64"));
        await page.screenshot({ path: process.env.NEXUS_BROWSER_PROBE_SCREENSHOT.replace(/\.png$/, "-full-view.png") });
      }
      await page.getByRole("button", { name: "New Browser tab", exact: true }).click();
      await page.locator(`[data-browser-tab="${websiteId}"]`).click();
      await new Promise(resolve => setTimeout(resolve, 200));
      assert.equal(await app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows().find(w => /renderer\/index\.html/.test(w.webContents.getURL()) && !w.webContents.getURL().includes("surface="));
        return window.contentView.children.at(-1)?.webContents?.getURL().includes("surface=browser-composer");
      }), true, "Tab reattachment retains composer child order");
      await input.press("Control+Shift+F");
      await page.waitForFunction(() => !document.querySelector(".app-shell")?.classList.contains("browser-full-view"));
      assert.equal(await page.locator('.composer-input[contenteditable="true"]').innerText(), "Draft edited over the page", "Native draft returns to Chat");
      await page.getByRole("button", { name: "Enter full view", exact: true }).click();
      const guestPage = app.context().pages().find(p => p.url() === url);
      assert.ok(guestPage, "Native webpage remains inspectable");
      await guestPage.locator("#draft").press("Control+Shift+F");
      await page.waitForFunction(() => !document.querySelector(".app-shell")?.classList.contains("browser-full-view"));
      await page.locator(`[data-browser-tab="${websiteId}"]`).click({ button: "right" });
      const menuBounds = await page.getByRole("menu", { name: /Actions for/ }).boundingBox();
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      assert.ok(menuBounds.x >= 0 && menuBounds.y >= 0 && menuBounds.x + menuBounds.width <= viewport.width && menuBounds.y + menuBounds.height <= viewport.height, "Tab menu is viewport-contained");
      await page.keyboard.press("Escape");
      // Restore the one-tab starting state for the selection regression below.
      const tabs = await page.evaluate(async sessionId => (await window.piDesktop.invoke(window.piDesktop.channels.invoke.browserTabs, { sessionId })).data, sessionId);
      for (const tab of tabs.tabs) if (tab.browserId !== websiteId) await page.evaluate(async ({ sessionId, browserId }) => window.piDesktop.invoke(window.piDesktop.channels.invoke.browserTabClose, { sessionId, browserId }), { sessionId, browserId: tab.browserId });
      await page.waitForFunction(() => document.querySelectorAll("[data-browser-tab]").length === 1);
      await page.evaluate(() => { window.__tabProbe.changes = []; });
      console.log("BROWSER_FULL_VIEW_PASS", JSON.stringify({ draftHandoff: true, nativeOverlap: true, topmostAcrossTabs: true, menuInViewport: true, modelMenuExpansion: true, themeMatch: true, pageShortcut: true, colors: overlay.colors }));
    }

    await page.getByRole("button", { name: "New Browser tab", exact: true }).click();
    await page.waitForFunction(websiteId => document.querySelector('[data-browser-tab][aria-selected="true"]')?.dataset.browserTab !== websiteId, websiteId);
    await new Promise(resolve => setTimeout(resolve, 1500));
    const blank = await page.evaluate(() => ({
      id: window.__tabProbe.last,
      changes: window.__tabProbe.changes.length,
      address: document.querySelector(".browser-toolbar-address input").value,
      tabs: document.querySelectorAll("[data-browser-tab]").length,
    }));
    assert.equal(blank.changes, 1, "New tab has one stable selection");
    assert.equal(blank.address, "", "New tab stays blank");
    assert.equal(blank.tabs, 2);
    console.log("NEW_TAB_PASS", { selectionChanges: blank.changes });

    const eventChannel = await page.evaluate(() => window.piDesktop.channels.event.browserTabs);
    await app.evaluate(({ BrowserWindow }, { eventChannel, initial }) => {
      const window = BrowserWindow.getAllWindows().find(w => /renderer\/index\.html/.test(w.webContents.getURL()) && !w.webContents.getURL().includes("surface="));
      window.webContents.send(eventChannel, initial);
    }, { eventChannel, initial });
    for (const visible of [true, false]) {
      await page.evaluate(async ({ sessionId, browserId, visible }) => {
        await window.piDesktop.invoke(window.piDesktop.channels.invoke.browserCoreSurfaceSet, { sessionId, browserId, visible, bounds: { x: 0, y: 0, width: 500, height: 400 } });
      }, { sessionId, browserId: websiteId, visible });
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(await page.evaluate(() => window.__tabProbe.changes.length), 1, "Stale snapshot and geometry cannot restore the website");

    for (let i = 0; i < 12; i++) {
      const id = i % 2 === 0 ? websiteId : blank.id;
      await page.locator(`[data-browser-tab="${id}"]`).click();
      await page.waitForFunction(id => document.querySelector('[data-browser-tab][aria-selected="true"]')?.dataset.browserTab === id, id);
    }
    await new Promise(resolve => setTimeout(resolve, 750));
    const rapidChanges = await page.evaluate(() => window.__tabProbe.changes);
    assert.equal(rapidChanges.length, 13, `Rapid switching produces only explicit selections: ${JSON.stringify(rapidChanges)}`);
    console.log("RAPID_SWITCH_PASS", { explicitSwitches: 12 });
    await page.locator(`[data-browser-tab="${websiteId}"]`).click();
    assert.equal(await app.evaluate(async ({ webContents }, id) => webContents.fromId(id).executeJavaScript('document.getElementById("draft").value'), guestId), "keep this draft", "Original page contents survive switching");

    await page.locator(`[data-browser-tab="${websiteId}"]`).click({ button: "right" });
    // Menu dispatch isolates tab lifecycle from native menu hit-testing.
    await page.getByRole("menuitem", { name: "Duplicate tab", exact: true }).dispatchEvent("click");
    await page.waitForFunction(({ websiteId, blankId }) => {
      const selected = document.querySelector('[data-browser-tab][aria-selected="true"]');
      return selected && selected.dataset.browserTab !== websiteId && selected.dataset.browserTab !== blankId && selected.textContent.includes("Tab regression website");
    }, { websiteId, blankId: blank.id });
    await new Promise(resolve => setTimeout(resolve, 500));
    const duplicateId = await page.evaluate(() => window.__tabProbe.last);
    const duplicate = page.locator(`[data-browser-tab="${duplicateId}"]`);
    await duplicate.getByRole("button", { name: "Close Tab regression website" }).click();
    await page.waitForFunction(() => document.querySelectorAll("[data-browser-tab]").length === 2);
    await page.locator(`[data-browser-tab="${websiteId}"]`).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Close other tabs", exact: true }).dispatchEvent("click");
    await page.waitForFunction(() => document.querySelectorAll("[data-browser-tab]").length === 1);
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(await page.evaluate(() => window.__tabProbe.last), websiteId);

    await app.evaluate(async ({ webContents }, id) => webContents.fromId(id).executeJavaScript('document.querySelector("a").click()'), guestId);
    await page.waitForFunction(websiteId => document.querySelectorAll("[data-browser-tab]").length === 2 && document.querySelector('[data-browser-tab][aria-selected="true"]')?.dataset.browserTab !== websiteId, websiteId);
    const popupId = await page.evaluate(() => window.__tabProbe.last);
    await page.locator(`[data-browser-tab="${popupId}"]`).getByRole("button").click();
    await page.waitForFunction(websiteId => document.querySelectorAll("[data-browser-tab]").length === 1 && document.querySelector('[data-browser-tab][aria-selected="true"]')?.dataset.browserTab === websiteId, websiteId);
    await page.waitForFunction(() => document.querySelector(".browser-core-view")?.dataset.browserReadiness === "ready");
    await new Promise(resolve => setTimeout(resolve, 500));
    const nativeSurface = await app.evaluate(async ({ BrowserWindow, webContents }, id) => {
      const window = BrowserWindow.getAllWindows().find(w => /renderer\/index\.html/.test(w.webContents.getURL()) && !w.webContents.getURL().includes("surface="));
      const child = window.contentView.children.find(view => view.webContents?.id === id);
      const image = await webContents.fromId(id).capturePage();
      const pixels = image.toBitmap();
      const colors = new Set();
      for (let i = 0; i < pixels.length; i += 16) colors.add(pixels.readUInt32LE(i));
      return { attached: !!child, bounds: child?.getBounds(), colors: colors.size, guestPng: image.toPNG().toString("base64"), windowPng: (await window.capturePage()).toPNG().toString("base64") };
    }, guestId);
    assert.equal(nativeSurface.attached, true, "Retained website is attached to the main window");
    assert.ok(nativeSurface.bounds.width > 0 && nativeSurface.bounds.height > 0);
    assert.ok(nativeSurface.colors > 20, "Native website capture is nonblank");
    assert.deepEqual(errors, [], "No renderer exceptions");
    assert.deepEqual(await app.evaluate(() => globalThis.__browserProbeFailures), [], "No native error dialogs");
    if (process.env.NEXUS_BROWSER_PROBE_SCREENSHOT) {
      writeFileSync(process.env.NEXUS_BROWSER_PROBE_SCREENSHOT, Buffer.from(nativeSurface.windowPng, "base64"));
      writeFileSync(process.env.NEXUS_BROWSER_PROBE_SCREENSHOT.replace(/\.png$/, "-guest.png"), Buffer.from(nativeSurface.guestPng, "base64"));
    }
    console.log("BROWSER_TAB_PROBE_PASS", JSON.stringify({ newTabSelections: blank.changes, rapidSelections: 12, staleUpdatesIgnored: true, draftPreserved: true, duplicateAndClose: true, nativePopupSelection: true, errors }));
  } finally {
    clearTimeout(deadline);
    if (app) {
      await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await app.close().catch(() => {});
    }
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
