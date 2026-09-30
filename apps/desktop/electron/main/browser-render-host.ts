import { BrowserWindow } from "electron";
import type { BrowserPane } from "./browser-view";

/** Provides a native compositor for detached guests without showing a window. */
export class BrowserRenderHost {
  private window: BrowserWindow | null = null;
  private ready: Promise<void> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;

  run<T>(pane: BrowserPane, work: () => Promise<T>): Promise<T> {
    const execute = async () => {
      if (this.disposed) throw Object.assign(new Error("Browser render host is closed"), { code: "UNAVAILABLE" });
      if (pane.surfaceStatus().attachment === "attached") return work();
      if (!this.window || this.window.isDestroyed()) {
        this.window = new BrowserWindow({
          show: false, width: 1280, height: 800,
          webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
        });
        this.window.setSkipTaskbar(true);
        this.ready = this.window.loadURL("about:blank");
      }
      await this.ready;
      return pane.withRenderHost(this.window, work);
    };
    const result = this.queue.then(execute, execute);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  dispose(): void {
    this.disposed = true;
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
    this.ready = null;
  }
}
