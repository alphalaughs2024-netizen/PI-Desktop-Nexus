import { app, BrowserWindow, WebContentsView, ipcMain, type IpcMainInvokeEvent } from "electron";
import { join } from "node:path";
import { IPC, type SpeechTranscriptionProgress } from "@pi-desktop/shared";
import { BROWSER_COMPOSER_ACTIONS, type BrowserComposerSnapshot } from "../../common/browser-composer";

/** The main renderer remains the sole chat controller; this view is an input surface. */
export class BrowserComposerHost {
  private view: WebContentsView | null = null;
  private window: BrowserWindow | null = null;
  private ready: Promise<void> | null = null;
  private snapshot: BrowserComposerSnapshot | null = null;
  private height = 190;
  private blocked = false;
  private lastWindowHeight = 0;
  private nextRequest = 0;
  private resized = () => this.raise();
  private outside = () => {
    if (this.snapshot?.visible && this.view && !this.view.webContents.isDestroyed()) this.view.webContents.send(IPC.event.browserComposer, { kind: "collapse-history" });
  };
  private outsideMouse = (_event: unknown, input: { type: string }) => { if (input.type === "mouseDown") this.outside(); };
  private watchedGuests = new WeakSet<BrowserWindow["webContents"]>();

  watchGuest(contents: BrowserWindow["webContents"]): void {
    if (this.watchedGuests.has(contents)) return;
    this.watchedGuests.add(contents);
    contents.on("focus", this.outside);
    contents.on("before-mouse-event", this.outsideMouse);
  }
  private reloading = (_event: unknown, _url: string, isInPlace: boolean, isMainFrame: boolean) => {
    if (!isMainFrame || isInPlace) return;
    this.view?.setVisible(false);
    if (this.view && !this.view.webContents.isDestroyed()) this.view.webContents.send(IPC.event.browserComposer, { kind: "reset" });
    this.snapshot = null;
    this.rejectPending("Chat renderer reloaded; inspect work before retrying");
  };
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();

  ownsSender(id: number | undefined, activeOnly = false): boolean {
    return Boolean(this.view && !this.view.webContents.isDestroyed() && this.view.webContents.id === id
      && (!activeOnly || (this.snapshot?.visible && !this.blocked)));
  }

  sendSpeechProgress(progress: SpeechTranscriptionProgress): void {
    if (this.view && !this.view.webContents.isDestroyed()) this.view.webContents.send(IPC.event.speechProgress, progress);
  }

  register(getWindow: () => BrowserWindow | null): void {
    const request = async (event: IpcMainInvokeEvent, input: any) => {
      const main = getWindow();
      const isMain = event.sender.id === main?.webContents.id;
      const isOverlay = event.sender.id === this.view?.webContents.id;
      if (!isMain && !isOverlay) throw new Error("Browser composer sender denied");
      if (isMain && input?.kind === "blocked") {
        this.blocked = input.blocked === true;
        if (this.blocked) this.view?.setVisible(false);
        else this.raise();
        return;
      }
      if (isMain && input?.kind === "snapshot") {
        const snapshot = input.snapshot as BrowserComposerSnapshot;
        if (!Number.isSafeInteger(snapshot?.generation) || typeof snapshot.sessionId !== "string" || typeof snapshot.visible !== "boolean") throw new Error("Invalid composer snapshot");
        if (this.snapshot && snapshot.generation < this.snapshot.generation) return;
        const sameOwner = this.snapshot?.generation === snapshot.generation && this.snapshot.sessionId === snapshot.sessionId;
        const retained = { ...snapshot, state: sameOwner ? { ...this.snapshot?.state, ...snapshot.state } : snapshot.state, draft: snapshot.draft ?? (sameOwner ? this.snapshot?.draft : undefined) };
        this.snapshot = retained;
        if (!snapshot.visible) {
          this.view?.setVisible(false);
          if (this.ready) await this.ready;
          this.sendSnapshot();
          return;
        }
        if (!main) return;
        await this.ensureView(main);
        if (this.snapshot !== retained) return;
        this.sendSnapshot({ ...retained, state: snapshot.state });
        this.raise();
        return;
      }
      if (isMain && input?.kind === "result") {
        const pending = this.pending.get(input.id);
        if (pending) {
          this.pending.delete(input.id);
          clearTimeout(pending.timer);
          if (input.error) pending.reject(new Error(String(input.error)));
          else pending.resolve(input.value);
        }
        return;
      }
      if (!isOverlay) throw new Error("Invalid composer request");
      if (input?.kind === "ready") return this.snapshot;
      const snapshot = this.snapshot;
      if (!snapshot?.visible || this.blocked || input?.generation !== snapshot.generation || input?.sessionId !== snapshot.sessionId) throw new Error("Browser composer session expired");
      if (input.kind === "height") {
        if (!Number.isFinite(input.height)) throw new Error("Invalid composer height");
        this.height = Math.max(90, Math.min(900, Math.ceil(input.height)));
        this.raise();
        return;
      }
      if (input.kind === "draft") {
        if (typeof input.draft?.text !== "string" || !Array.isArray(input.draft.fileReferences)) throw new Error("Invalid composer draft");
        snapshot.draft = input.draft;
        main?.webContents.send(IPC.event.browserComposer, input);
        return;
      }
      if (input.kind === "action" && BROWSER_COMPOSER_ACTIONS.includes(input.action) && Array.isArray(input.args)) {
        const id = ++this.nextRequest;
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("Composer action timed out; inspect the chat before retrying")); }, 120000);
          this.pending.set(id, { resolve, reject, timer });
          main?.webContents.send(IPC.event.browserComposer, { ...input, id });
        });
      }
      throw new Error("Invalid composer request");
    };
    ipcMain.handle(IPC.invoke.browserComposer, async (event, input) => {
      try { return { ok: true, data: await request(event, input) }; }
      catch (error) { return { ok: false, error: { code: "UNAVAILABLE", message: error instanceof Error ? error.message : String(error) } }; }
    });
  }

  raise(): void {
    const window = this.window;
    const view = this.view;
    if (!window || window.isDestroyed() || !view || view.webContents.isDestroyed() || !this.snapshot?.visible || this.blocked) return;
    const [width, height] = window.getContentSize();
    if (height !== this.lastWindowHeight) {
      this.lastWindowHeight = height;
      view.webContents.send(IPC.event.browserComposer, { kind: "viewport", height });
    }
    const viewWidth = Math.min(500, Math.max(1, width - 24));
    const viewHeight = Math.min(this.height, Math.max(1, height - 100));
    view.setBounds({ x: Math.max(0, width - viewWidth - 12), y: Math.max(0, height - viewHeight - 12), width: viewWidth, height: viewHeight });
    window.contentView.addChildView(view);
    view.setVisible(true);
  }

  private sendSnapshot(snapshot = this.snapshot): void {
    if (this.view && !this.view.webContents.isDestroyed()) this.view.webContents.send(IPC.event.browserComposer, { kind: "snapshot", snapshot });
  }

  private async ensureView(window: BrowserWindow): Promise<void> {
    if (this.view && !this.view.webContents.isDestroyed()) { await this.ready; return; }
    this.window = window;
    this.view = new WebContentsView({ webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"), sandbox: true, contextIsolation: true,
      nodeIntegration: false, backgroundThrottling: false,
      additionalArguments: [`--pi-desktop-locale=${app.getLocale()}`],
    } });
    this.view.setBackgroundColor("#00000000");
    this.view.setVisible(false);
    this.view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    this.view.webContents.on("will-navigate", event => event.preventDefault());
    this.view.webContents.on("blur", this.outside);
    this.view.webContents.on("render-process-gone", () => {
      this.rejectPending("Browser composer renderer stopped");
      window.webContents.send(IPC.event.browserComposer, { kind: "failed" });
      this.dispose();
    });
    window.on("resize", this.resized);
    window.webContents.on("focus", this.outside);
    window.webContents.on("before-mouse-event", this.outsideMouse);
    window.webContents.on("did-start-navigation", this.reloading);
    window.once("closed", () => this.dispose());
    const rendererUrl = process.env.ELECTRON_RENDERER_URL;
    if (rendererUrl) {
      const url = new URL(rendererUrl); url.searchParams.set("surface", "browser-composer");
      this.ready = this.view.webContents.loadURL(url.toString());
    } else {
      this.ready = this.view.webContents.loadFile(join(__dirname, "../renderer/index.html"), { query: { surface: "browser-composer" } });
    }
    await this.ready;
  }

  private rejectPending(message: string): void {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(message)); }
    this.pending.clear();
  }

  dispose(): void {
    this.rejectPending("Browser composer closed");
    this.window?.removeListener("resize", this.resized);
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.removeListener("did-start-navigation", this.reloading);
      this.window.webContents.removeListener("focus", this.outside);
      this.window.webContents.removeListener("before-mouse-event", this.outsideMouse);
    }
    if (this.view && !this.view.webContents.isDestroyed()) this.view.webContents.close();
    this.view = null; this.window = null; this.ready = null; this.snapshot = null; this.lastWindowHeight = 0;
  }
}
