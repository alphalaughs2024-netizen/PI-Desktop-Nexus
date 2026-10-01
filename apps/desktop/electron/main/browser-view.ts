import { shell, WebContentsView, type BrowserWindow } from "electron";
import { statSync, watch, type FSWatcher } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { BrowserState } from "@pi-desktop/shared";
import { isAllowedHttpUrl, parseAllowedExternalUrl } from "./safe-open-external";

/**
 * Work panel embedded preview browser (D100, ADR 0019).
 *
 * A single WebContentsView owned by the main process, attached to the main
 * window and positioned from renderer-measured bounds. The renderer is the
 * visibility authority: it hides the view whenever the browser tab is not
 * the active panel surface or a blocking overlay opens (the view always
 * composites above renderer content).
 *
 * Besides http(s) URLs, the pane renders HTML files inside the workspace
 * (agent-generated pages) with live reload: the loaded file's directory is
 * watched so edits to the page or its sibling assets refresh the preview.
 */

const PARTITION = "persist:work-browser";
const LIVE_RELOAD_DEBOUNCE_MS = 250;
const SURFACE_CAPTURE_TIMEOUT_MS = 5_000;
const SURFACE_CAPTURE_ATTEMPTS = 3;
const SURFACE_CAPTURE_RETRY_MS = 100;

export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed === "about:blank") return trimmed;
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isWithinRoot(path: string, root: string): boolean {
  const resolvedRoot = resolve(root);
  return path === resolvedRoot || path.startsWith(resolvedRoot + sep);
}

/**
 * Resolve user input to a previewable file inside the workspace: a file://
 * URL, an absolute path, or a workspace-relative path (./demo/index.html,
 * index.html). Returns null unless the target exists as a file within the
 * root — inputs like "localhost:3000/a.html" then fall through to URL
 * handling instead of a broken file load.
 */
export function resolveLocalFile(raw: string, root: string | null): string | null {
  const trimmed = raw.trim();
  if (!trimmed || !root) return null;
  let candidate: string | null = null;
  if (/^file:/i.test(trimmed)) {
    try {
      candidate = fileURLToPath(trimmed);
    } catch {
      return null;
    }
  } else if (isAbsolute(trimmed)) {
    candidate = trimmed;
  } else if (/^\.{1,2}\//.test(trimmed) || /\.[a-zA-Z0-9]+$/.test(trimmed)) {
    candidate = resolve(root, trimmed);
  }
  if (!candidate) return null;
  const resolved = resolve(candidate);
  if (!isWithinRoot(resolved, root)) return null;
  try {
    if (!statSync(resolved).isFile()) return null;
  } catch {
    return null;
  }
  return resolved;
}

export class BrowserPane {
  private view: WebContentsView | null = null;
  private window: BrowserWindow | null = null;
  private renderWindow: BrowserWindow | null = null;
  private visible = false;
  private bounds = { x: 0, y: 0, width: 0, height: 0 };
  private onState: (state: BrowserState) => void;
  private fileRoot: string | null = null;
  private watcher: FSWatcher | null = null;
  private watchedDir: string | null = null;
  private reloadTimer: NodeJS.Timeout | null = null;
  private attached = false;
  private generation = 0;
  private painted: "unknown" | "painted" | "blank" = "unknown";
  private captured: "unknown" | "nonempty" | "empty" = "unknown";
  private childOrder: "topmost" | "not-topmost" | "unknown" = "unknown";
  private surfaceVerification: Promise<void> | null = null;
  private surfaceEpoch = 0;
  private surfaceAttempts = 0;
  private surfaceRetry: NodeJS.Timeout | null = null;
  private mainFrameFinished = false;

  constructor(onState: (state: BrowserState) => void) {
    this.onState = onState;
  }

  setWindow(window: BrowserWindow | null): void {
    if (this.window === window) return;
    this.detach();
    this.window = window;
    if (this.window && this.visible && this.view) this.attach();
  }

  surfaceStatus() { return { attachment: this.attached ? "attached" as const : "detached" as const, visibility: this.visible ? "visible" as const : "hidden" as const, paint: this.painted, capture: this.captured, childOrder: this.childOrder, generation: this.generation }; }
  async probeSurface() {
    const wc = this.view?.webContents;
    if (!wc || wc.isDestroyed() || !this.attached || !this.visible || this.bounds.width < 1 || this.bounds.height < 1) return { status: "unavailable" as const, width: 0, height: 0, byteLength: 0 };
    const epoch = this.surfaceEpoch;
    try {
      const image = await wc.capturePage();
      const size = image.getSize();
      const byteLength = image.toPNG().byteLength;
      const status = size.width > 0 && size.height > 0 && byteLength > 0 ? "nonempty" as const : "empty" as const;
      if (epoch === this.surfaceEpoch && this.attached && this.visible) this.captured = status;
      return { status, width: size.width, height: size.height, byteLength };
    } catch { return { status: "unavailable" as const, width: 0, height: 0, byteLength: 0 }; }
  }

  private invalidateSurface(): void {
    this.surfaceEpoch += 1;
    this.painted = "unknown";
    this.captured = "unknown";
    this.surfaceAttempts = 0;
    if (this.surfaceRetry) clearTimeout(this.surfaceRetry);
    this.surfaceRetry = null;
  }

  retrySurface(): void {
    this.invalidateSurface();
    this.verifySurface();
  }

  getState(): BrowserState | null {
    const wc = this.view?.webContents;
    if (!wc || wc.isDestroyed()) return null;
    return {
      url: wc.getURL(),
      title: wc.getTitle(),
      isLoading: wc.isLoading(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
    };
  }

  getWebContents() {
    const wc = this.view?.webContents;
    if (!wc || wc.isDestroyed()) return null;
    return wc;
  }

  navigate(raw: string, fileRoot: string | null = null): BrowserState | null {
    if (fileRoot) this.fileRoot = fileRoot;
    const localPath = resolveLocalFile(raw, this.fileRoot);
    if (localPath) {
      const view = this.ensureView();
      this.watchDirForReload(dirname(localPath));
      void view.webContents.loadURL(pathToFileURL(localPath).toString()).catch(() => {
        // Navigation failures surface through did-fail-load → state push.
      });
      if (this.visible) this.attach();
      return this.getState();
    }
    const url = normalizeUrl(raw);
    if (!url) return this.getState();
    this.clearLiveReload();
    const view = this.ensureView();
    void view.webContents.loadURL(url).catch(() => {
      // Navigation failures surface through did-fail-load → state push.
    });
    if (this.visible) this.attach();
    return this.getState();
  }

  async navigateAndWait(
    raw: string,
    fileRoot: string | null = null,
    timeoutMs = 15_000,
  ): Promise<BrowserState | null> {
    if (fileRoot) this.fileRoot = fileRoot;
    const localPath = resolveLocalFile(raw, this.fileRoot);
    const target = localPath
      ? pathToFileURL(localPath).toString()
      : normalizeUrl(raw);
    if (!target) throw Object.assign(new Error("Invalid Browser navigation target"), { code: "BROWSER_INVALID_INPUT" });
    if (localPath) this.watchDirForReload(dirname(localPath));
    else this.clearLiveReload();
    const view = this.ensureView();
    if (this.visible) this.attach();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        view.webContents.loadURL(target),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(Object.assign(new Error("Browser navigation timed out"), { code: "TIMEOUT" }));
            if (!view.webContents.isDestroyed()) view.webContents.stop();
          }, Math.max(1, timeoutMs));
        }),
      ]);
      const state = this.getState();
      if (!state?.url) throw Object.assign(new Error("Browser guest is not available"), { code: "UNAVAILABLE" });
      return state;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  action(action: "back" | "forward" | "reload" | "stop"): void {
    const wc = this.view?.webContents;
    if (!wc || wc.isDestroyed()) return;
    if (action === "back" && wc.navigationHistory.canGoBack()) {
      wc.navigationHistory.goBack();
    } else if (action === "forward" && wc.navigationHistory.canGoForward()) {
      wc.navigationHistory.goForward();
    } else if (action === "reload") {
      wc.reload();
    } else if (action === "stop") {
      wc.stop();
    }
  }

  setBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    const safe = {
      x: Math.max(0, Math.round(Number(bounds.x) || 0)),
      y: Math.max(0, Math.round(Number(bounds.y) || 0)),
      width: Math.max(0, Math.round(Number(bounds.width) || 0)),
      height: Math.max(0, Math.round(Number(bounds.height) || 0)),
    };
    const resized = this.bounds.width !== safe.width || this.bounds.height !== safe.height;
    this.bounds = safe;
    if (resized) this.invalidateSurface();
    if (this.view && this.visible) {
      if (safe.width < 1 || safe.height < 1) this.detach();
      else this.attach();
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (!this.view) return;
    if (visible) this.attach();
    else this.detach();
  }

  openExternal(): void {
    const url = this.view?.webContents.getURL();
    if (!url) return;
    const allowed = parseAllowedExternalUrl(url);
    if (allowed) {
      void shell.openExternal(allowed);
      return;
    }
    if (this.isAllowedFileUrl(url)) {
      try {
        void shell.openPath(fileURLToPath(url));
      } catch {
        // Invalid file URL — leave the preview in place.
      }
    }
  }

  dispose(): void {
    this.invalidateSurface();
    this.clearLiveReload();
    this.detachRenderHost();
    this.detach();
    if (this.view) {
      this.view.webContents.close();
      this.view = null;
      this.generation += 1;
    }
    this.attached = false;
    this.painted = "unknown";
    this.captured = "unknown";
    this.childOrder = "unknown";
  }

  async withRenderHost<T>(window: BrowserWindow, work: () => Promise<T>): Promise<T> {
    const view = this.view;
    if (!view || view.webContents.isDestroyed()) throw Object.assign(new Error("browser guest is not available"), { code: "UNAVAILABLE" });
    if (this.attached) return work();
    this.renderWindow = window;
    window.contentView.addChildView(view);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(Object.assign(new Error("Browser page operation timed out"), { code: "TIMEOUT" })), 15_000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      this.detachRenderHost();
    }
  }

  private detachRenderHost(): void {
    const window = this.renderWindow;
    if (window && !window.isDestroyed() && this.view && window.contentView.children.includes(this.view)) window.contentView.removeChildView(this.view);
    this.renderWindow = null;
  }

  private attach(): void {
    this.detachRenderHost();
    if (!this.window || this.window.isDestroyed() || !this.view || this.bounds.width < 1 || this.bounds.height < 1) return;
    const children = this.window.contentView.children;
    // The guest hole sits on top of plugin chrome. Re-adding a plugin view
    // after this pane is attached would cover the guest unless we keep it last.
    if (children.includes(this.view) && children[children.length - 1] !== this.view) {
      this.invalidateSurface();
      this.window.contentView.removeChildView(this.view);
    }
    if (!this.window.contentView.children.includes(this.view)) {
      this.invalidateSurface();
      this.window.contentView.addChildView(this.view);
    }
    this.view.setBounds(this.bounds);
    this.attached = true;
    this.childOrder = this.window.contentView.children.at(-1) === this.view ? "topmost" : "not-topmost";
    this.verifySurface();
  }

  private verifySurface(pageFinished = false): void {
    if (pageFinished) this.mainFrameFinished = true;
    const wc = this.view?.webContents;
    if (!wc || wc.isDestroyed() || !this.attached || !this.visible || this.bounds.width < 1 || this.bounds.height < 1 || (!this.mainFrameFinished && wc.isLoading()) || this.surfaceVerification || this.surfaceRetry || this.painted !== "unknown") return;
    const generation = this.generation;
    const epoch = this.surfaceEpoch;
    this.surfaceAttempts += 1;
    let timeout: NodeJS.Timeout | undefined;
    const capture = Promise.race([
      this.probeSurface(),
      new Promise<Awaited<ReturnType<BrowserPane["probeSurface"]>>>((resolve) => {
        timeout = setTimeout(() => resolve({ status: "unavailable", width: 0, height: 0, byteLength: 0 }), SURFACE_CAPTURE_TIMEOUT_MS);
      }),
    ]);
    this.surfaceVerification = capture.then((result) => {
      if (generation !== this.generation || epoch !== this.surfaceEpoch || wc.isDestroyed() || !this.attached) return;
      // First attachment can precede Chromium's first usable compositor frame.
      // Retry verification only; never replay navigation or page interactions.
      if (result.status !== "nonempty" && this.surfaceAttempts < SURFACE_CAPTURE_ATTEMPTS) {
        this.surfaceRetry = setTimeout(() => { this.surfaceRetry = null; if (epoch === this.surfaceEpoch) this.verifySurface(); }, SURFACE_CAPTURE_RETRY_MS);
        return;
      }
      this.painted = result.status === "nonempty" ? "painted" : "blank";
      const state = this.getState();
      if (state) this.onState(state);
    }).catch(() => {
      if (generation !== this.generation || epoch !== this.surfaceEpoch || !this.attached) return;
      this.painted = "blank";
      const state = this.getState();
      if (state) this.onState(state);
    }).finally(() => {
      if (timeout) clearTimeout(timeout);
      this.surfaceVerification = null;
      if (epoch !== this.surfaceEpoch) this.verifySurface();
    });
  }

  private detach(): void {
    if (this.attached) this.invalidateSurface();
    if (!this.window || this.window.isDestroyed() || !this.view) return;
    const children = this.window.contentView.children;
    if (children.includes(this.view)) {
      this.window.contentView.removeChildView(this.view);
    }
    this.attached = false;
    this.childOrder = "unknown";
  }

  /** Watch the previewed file's directory so page + asset edits re-render. */
  private watchDirForReload(dir: string): void {
    if (this.watcher && this.watchedDir === dir) return;
    this.clearLiveReload();
    try {
      this.watcher = watch(dir, { persistent: false }, () => this.scheduleReload());
      this.watchedDir = dir;
    } catch {
      this.watcher = null;
      this.watchedDir = null;
    }
  }

  private scheduleReload(): void {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null;
      const wc = this.view?.webContents;
      if (wc && !wc.isDestroyed() && wc.getURL().startsWith("file:")) {
        wc.reloadIgnoringCache();
      }
    }, LIVE_RELOAD_DEBOUNCE_MS);
  }

  private clearLiveReload(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
    this.watcher?.close();
    this.watcher = null;
    this.watchedDir = null;
  }

  private isAllowedFileUrl(url: string): boolean {
    if (!this.fileRoot) return false;
    try {
      return isWithinRoot(resolve(fileURLToPath(url)), this.fileRoot);
    } catch {
      return false;
    }
  }

  private ensureView(): WebContentsView {
    if (this.view && !this.view.webContents.isDestroyed()) return this.view;
    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        partition: PARTITION,
        backgroundThrottling: false,
      },
    });
    // Detached agent tabs need a real viewport before GUI geometry arrives.
    view.setBounds({ x: 0, y: 0, width: 1280, height: 800 });
    const wc = view.webContents;
    wc.setWindowOpenHandler(({ url }) => {
      const allowed = parseAllowedExternalUrl(url);
      if (allowed) queueMicrotask(() => { if (!wc.isDestroyed()) void wc.loadURL(allowed).catch(() => undefined); });
      return { action: "deny" };
    });
    wc.session.setPermissionRequestHandler((_wc, _permission, callback) => {
      callback(false);
    });
    wc.on("will-navigate", (event, url) => {
      if (url === "about:blank" || isAllowedHttpUrl(url)) return;
      // Relative links inside a previewed page may point at sibling files;
      // anything escaping the workspace root stays blocked.
      if (/^file:/i.test(url) && this.isAllowedFileUrl(url)) return;
      event.preventDefault();
    });
    wc.on("did-navigate", (_event, url) => {
      if (!/^file:/i.test(url)) return;
      try {
        this.watchDirForReload(dirname(fileURLToPath(url)));
      } catch {
        // Non-path file URL — keep the previous watcher.
      }
    });
    const push = () => {
      const state = this.getState();
      if (state) this.onState(state);
    };
    wc.on("did-start-loading", () => {
      this.mainFrameFinished = false;
      this.invalidateSurface();
      push();
    });
    wc.on("did-stop-loading", () => { this.verifySurface(); push(); });
    wc.on("did-navigate", push);
    wc.on("did-navigate-in-page", push);
    wc.on("page-title-updated", push);
    wc.on("did-fail-load", push);
    wc.on("did-finish-load", () => { this.verifySurface(true); push(); });
    wc.on("render-process-gone", push);
    wc.on("destroyed", () => { this.attached = false; this.painted = "blank"; this.generation += 1; push(); });
    this.view = view;
    return view;
  }
}
