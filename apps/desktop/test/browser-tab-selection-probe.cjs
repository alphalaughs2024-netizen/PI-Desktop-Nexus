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
