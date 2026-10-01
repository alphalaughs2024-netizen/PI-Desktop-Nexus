// Opt-in renderer probe against a running development app; no model requests.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: process.env.NEXUS_PROBE_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage();
await page.goto(`${process.env.NEXUS_PROBE_URL ?? "http://localhost:5173"}/test/fixtures/turn-progress.html`);
await page.waitForFunction(() => !!window.__phase3Store);
const output = resolve(process.env.NEXUS_PROBE_OUTPUT ?? ".cache/phase3");
await mkdir(output, { recursive: true });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const originalViewport = page.viewportSize();
try {
  await page.evaluate(async () => {
    const useAppStore = window.__phase3Store;
    window.__phase3Probe = { store: useAppStore, saved: useAppStore.getState() };
    const at = Date.now() - 15000;
    const sessionId = "phase3-visual-probe";
    const execution = { id: "probe-turn", runId: "probe-run", startedAt: at, phase: "waiting-model", progressPhase: "waiting-model",
      timeline: [{ phase: "preparing", startedAt: at, completedAt: at + 1000 }, { phase: "tool", startedAt: at + 1000, completedAt: at + 10000 }, { phase: "waiting-model", startedAt: at + 10000 }] };
    const row = (id, role, content, extra = {}) => ({ id, role, content, createdAt: new Date(at + 1000).toISOString(), status: "complete", turnId: "probe-turn", ...extra });
    const messages = [row("probe-user", "user", "Check the page and report what you find."),
      row("probe-intro", "assistant", "I checked the layout and command output."),
      row("probe-tool", "tool", "All checks passed. Exit code: 0", { toolName: "exec_command", toolCallId: "probe-tool", toolArgs: { command: "node --check app.js" }, toolStatus: "success", toolDurationMs: 9000 }),
      row("probe-steer", "user", "Check the narrow layout too.", { steering: true }),
      row("probe-final", "assistant", "The narrow layout also fits. I am waiting for the next model update."),
      row("probe-summary", "assistant", "", { execution })];
    useAppStore.setState({ page: "chat", activeSessionId: sessionId, selectingSessionId: undefined, messages, retainedTranscripts: { [sessionId]: messages },
      sessions: [{ id: sessionId, title: "Phase 3 renderer probe", mode: "agent", messageCount: messages.length, createdAt: new Date(at).toISOString(), updatedAt: new Date().toISOString() }],
      isRunning: true, runningSessions: { [sessionId]: true }, activeTurnIds: { [sessionId]: "probe-turn" }, pendingPermissions: {}, pendingAsks: {}, pendingPlans: {} });
  });
  await page.locator(".turn-progress").waitFor();
  assert.equal(await page.locator(".turn-progress").count(), 1);
  assert.match(await page.locator(".turn-progress").innerText(), /Waiting for model/);
  await page.locator(".turn-progress > button").click();
  assert.equal(await page.locator(".turn-progress > button").getAttribute("aria-expanded"), "true");
  assert.equal(await page.locator(".turn-timeline .tool-row").count() > 0 || await page.locator(".turn-timeline").innerText().then(text => text.includes("node")), true);
  for (const width of [1280, 430]) {
    await page.setViewportSize({ width, height: 860 });
    await page.screenshot({ path: resolve(output, `progress-${width}.png`) });
    const bounds = await page.locator(".turn-progress").evaluate(element => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, viewport: innerWidth, overflow: element.scrollWidth - element.clientWidth };
    });
    assert.ok(bounds.left >= 0 && bounds.right <= bounds.viewport && bounds.overflow <= 1, JSON.stringify(bounds));
  }
  await page.evaluate(() => {
    const { store } = window.__phase3Probe;
    store.setState(state => ({ messages: state.messages.map(message => message.execution ? { ...message, execution: { ...message.execution, outcome: "completed", phase: "terminal", completedAt: message.execution.startedAt + 21000 } } : message), isRunning: false, runningSessions: {} }));
  });
  assert.match(await page.locator(".turn-progress").innerText(), /Completed/);
  const fixedTime = await page.locator(".turn-progress-time").innerText();
  await page.waitForTimeout(1100);
  assert.equal(await page.locator(".turn-progress-time").innerText(), fixedTime);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await page.screenshot({ path: resolve(output, "progress-light-reduced.png") });
  assert.equal(await page.locator(".turn-progress > button").isVisible(), true);

  await page.setViewportSize({ width: 1280, height: 860 });
  await page.evaluate(() => {
    const { store } = window.__phase3Probe;
    store.setState(state => ({ messages: state.messages.map(message => message.id === "probe-final"
      ? { ...message, status: "streaming", content: Array.from({ length: 80 }, (_, i) => `Paragraph ${i + 1}: checking the generated output.\n\n`).join("") }
      : message.execution ? { ...message, execution: { ...message.execution, outcome: undefined, completedAt: undefined, progressPhase: "answering", phase: "running" } } : message),
      isRunning: true, runningSessions: { "phase3-visual-probe": true } }));
  });
  await page.waitForFunction(() => document.querySelector(".thread-scroll").scrollHeight > 2500);
  await page.locator(".thread-scroll").hover();
  await page.mouse.wheel(0, -900);
  await page.waitForTimeout(250);
  const readingTop = await page.locator(".thread-scroll").evaluate(element => element.scrollTop);
  await page.evaluate(async () => {
    const { store } = window.__phase3Probe;
    for (let i = 0; i < 12; i++) {
      store.setState(state => ({ messages: state.messages.map(message => message.id === "probe-final"
        ? { ...message, content: message.content + `Stream update ${i + 1}.\n\n` } : message) }));
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  });
  await page.waitForTimeout(250);
  const afterStreamTop = await page.locator(".thread-scroll").evaluate(element => element.scrollTop);
  assert.ok(Math.abs(readingTop - afterStreamTop) <= 2, JSON.stringify({ readingTop, afterStreamTop }));
  assert.equal(await page.locator(".turn-progress").count(), 1);
  await page.evaluate(() => {
    const { store } = window.__phase3Probe;
    store.setState(state => ({ messages: state.messages.map(message => message.id === "probe-final"
      ? { ...message, status: "complete", content: message.content + "FINAL-FLUSH-MARKER" }
      : message.execution ? { ...message, execution: { ...message.execution, outcome: "completed", phase: "terminal", completedAt: message.execution.startedAt + 21000 } } : message),
      isRunning: false, runningSessions: {} }));
  });
  await page.waitForFunction(() => document.querySelector(".assistant-turn-fragment:last-of-type")?.textContent.includes("FINAL-FLUSH-MARKER") || document.querySelector(".thread-content")?.textContent.includes("FINAL-FLUSH-MARKER"));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ statusRows: 1, totalTime: fixedTime, widths: [1280, 430], lightReducedMotion: true, scrollPreserved: true, finalTextFlushed: true, pageErrors: errors, output }));
} finally {
  await page.evaluate(() => {
    const probe = window.__phase3Probe;
    if (probe) { probe.store.setState(probe.saved); delete window.__phase3Probe; }
  });
  if (originalViewport) await page.setViewportSize(originalViewport);
  else await page.context().newCDPSession(page).then(session => session.send("Emulation.clearDeviceMetricsOverride"));
  await browser.close();
}
