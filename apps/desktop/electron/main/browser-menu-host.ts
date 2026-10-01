import { app, BrowserWindow, WebContentsView, ipcMain, type IpcMainInvokeEvent } from "electron";
import { join } from "node:path";
import { IPC } from "@pi-desktop/shared";
import { BROWSER_MENU_ICONS, type BrowserMenuSnapshot } from "../../common/browser-menu";

/** Menus are trusted UI views above the retained website; actions stay in the main renderer. */
export class BrowserMenuHost {
  private view: WebContentsView | null = null;
  private window: BrowserWindow | null = null;
  private ready: Promise<void> | null = null;
  private snapshot: BrowserMenuSnapshot | null = null;
  private revision = 0;
  private dismiss = () => this.close(false);
  private closed = () => this.dispose();
  private watchedGuests = new WeakSet<BrowserWindow["webContents"]>();
  watchGuest(contents: BrowserWindow["webContents"]): void {
    if (this.watchedGuests.has(contents)) return;
    this.watchedGuests.add(contents);
    contents.on("focus", this.dismiss);
    contents.on("before-mouse-event", (_event, input) => { if (input.type === "mouseDown") this.dismiss(); });
  }
  private reloading = (_event: unknown, _url: string, inPlace: boolean, mainFrame: boolean) => {
    if (!mainFrame || inPlace) return;
    this.close(false);
    if (this.view && !this.view.webContents.isDestroyed()) this.view.webContents.send(IPC.event.browserMenu, { kind: "reset" });
    this.revision = 0;
  };

  register(getWindow: () => BrowserWindow | null): void {
    ipcMain.handle(IPC.invoke.browserMenu, async (event: IpcMainInvokeEvent, input: any) => {
      try {
        const main = getWindow();
        const isMain = event.sender.id === main?.webContents.id;
        const isMenu = event.sender.id === this.view?.webContents.id;
        if (!isMain && !isMenu) throw new Error("Browser menu sender denied");
        if (isMain && input?.kind === "show") {
          const next = input.snapshot as BrowserMenuSnapshot;
          if (!Number.isSafeInteger(next?.id) || next.id < 1 || typeof next.sessionId !== "string"
            || typeof next.title !== "string" || next.title.length > 256
            || !Number.isFinite(next.anchor?.left) || !Number.isFinite(next.anchor?.top)
            || !Array.isArray(next.items) || next.items.length < 1 || next.items.length > 12
            || next.items.some(item => !item || typeof item.id !== "string" || !item.id || item.id.length > 64 || typeof item.label !== "string" || item.label.length > 256 || !BROWSER_MENU_ICONS.includes(item.icon))
            || new Set(next.items.map(item => item.id)).size !== next.items.length) throw new Error("Invalid browser menu");
          if (next.id <= this.revision || !main) return { ok: true };
          this.close(false);
          this.revision = next.id;
          this.snapshot = next;
          try { await this.ensureView(main); }
          catch (error) { this.dispose(); throw error; }
          if (this.snapshot !== next) return { ok: true };
          this.view!.webContents.send(IPC.event.browserMenu, { kind: "snapshot", snapshot: next });
          this.raise();
          this.view!.webContents.focus();
          return { ok: true };
        }
        if (isMain && input?.kind === "close") {
          if (input.id === this.snapshot?.id) this.close(false, false);
          return { ok: true };
        }
        if (!isMenu) throw new Error("Invalid browser menu request");
        if (input?.kind === "ready") return { ok: true, data: this.snapshot };
        const current = this.snapshot;
        if (!current || input?.id !== current.id || input.sessionId !== current.sessionId) throw new Error("Browser menu expired");
        if (input.kind === "dismiss") { this.close(input.restoreFocus === true); return { ok: true }; }
        if (input.kind !== "action" || !current.items.some(item => item.id === input.itemId && !item.disabled)) throw new Error("Browser menu action denied");
        this.close(false, false);
        main?.webContents.focus();
        main?.webContents.send(IPC.event.browserMenu, { kind: "action", id: current.id, itemId: input.itemId });
        return { ok: true };
      } catch (error) {
        if (event.sender.id === getWindow()?.webContents.id && input?.kind === "show") this.close(false);
        return { ok: false, error: { code: "UNAVAILABLE", message: error instanceof Error ? error.message : String(error) } };
      }
    });
  }

  raise(): void {
    const { window, view, snapshot } = this;
    if (!window || window.isDestroyed() || !view || view.webContents.isDestroyed() || !snapshot) return;
    const [width, height] = window.getContentSize();
    const menuWidth = Math.min(280, Math.max(1, width - 16));
    const menuHeight = Math.min(height - 16, 16 + snapshot.items.length * 36 + snapshot.items.filter(item => item.separatorBefore).length * 9);
    view.setBounds({ x: Math.round(Math.max(8, Math.min(snapshot.anchor.left, width - menuWidth - 8))), y: Math.round(Math.max(8, Math.min(snapshot.anchor.top, height - menuHeight - 8))), width: menuWidth, height: Math.max(1, menuHeight) });
    if (window.contentView.children.at(-1) !== view) window.contentView.addChildView(view);
    view.setVisible(true);
  }

  private close(restoreFocus: boolean, notify = true): void {
    const current = this.snapshot;
    this.snapshot = null;
    if (this.view && !this.view.webContents.isDestroyed()) this.view.setVisible(false);
    if (current && notify && this.window && !this.window.isDestroyed()) {
      if (restoreFocus) this.window.webContents.focus();
      this.window.webContents.send(IPC.event.browserMenu, { kind: "closed", id: current.id, restoreFocus });
    }
  }

  private async ensureView(window: BrowserWindow): Promise<void> {
    if (this.view && !this.view.webContents.isDestroyed()) { await this.ready; return; }
    this.window = window;
    const view = new WebContentsView({ webPreferences: { preload: join(__dirname, "../preload/index.cjs"), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, additionalArguments: [`--pi-desktop-locale=${app.getLocale()}`] } });
    this.view = view;
    view.setBackgroundColor("#00000000");
    view.setVisible(false);
    view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    view.webContents.on("will-navigate", event => event.preventDefault());
    view.webContents.on("blur", this.dismiss);
    view.webContents.on("render-process-gone", () => { this.close(false); this.dispose(); });
    window.on("resize", this.dismiss);
    window.on("blur", this.dismiss);
    window.webContents.on("did-start-navigation", this.reloading);
    window.once("closed", this.closed);
    const rendererUrl = process.env.ELECTRON_RENDERER_URL;
    if (rendererUrl) {
      const url = new URL(rendererUrl); url.searchParams.set("surface", "browser-menu");
      this.ready = view.webContents.loadURL(url.toString());
    } else this.ready = view.webContents.loadFile(join(__dirname, "../renderer/index.html"), { query: { surface: "browser-menu" } });
    await this.ready;
  }

  dispose(): void {
    this.close(false);
    this.window?.removeListener("resize", this.dismiss);
    this.window?.removeListener("blur", this.dismiss);
    this.window?.removeListener("closed", this.closed);
    if (this.window && !this.window.isDestroyed()) this.window.webContents.removeListener("did-start-navigation", this.reloading);
    if (this.view && !this.view.webContents.isDestroyed()) this.view.webContents.close();
    this.view = null; this.window = null; this.ready = null;
  }
}
