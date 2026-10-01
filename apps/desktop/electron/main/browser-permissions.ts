import type { Session, WebContents } from "electron";

type Details = { requestingUrl?: string; isMainFrame?: boolean; mediaTypes?: string[]; mediaType?: string };
const registries = new WeakMap<Session, Map<number, BrowserSitePermissions>>();
const permitted = new Set(["media", "notifications", "geolocation", "geolocation-approximate"]);
const site = (url: string) => { try { const value = new URL(url); return ["http:", "https:"].includes(value.protocol) ? value.origin : undefined; } catch { return undefined; } };

export function installBrowserPermissionHandlers(session: Session) {
  let registry = registries.get(session);
  if (!registry) {
    registry = new Map(); registries.set(session, registry);
    const owned = registry;
    session.setPermissionCheckHandler((source, permission, origin, details) => source && !source.isDestroyed() ? owned.get(source.id)?.check(permission, origin, details) ?? false : false);
    session.setPermissionRequestHandler((source, permission, callback, details) => {
      if (!source || source.isDestroyed()) { callback(false); return; }
      const manager = owned.get(source.id);
      if (!manager) { callback(false); return; }
      void manager.request(permission, details).then(callback, () => callback(false));
    });
  }
  return registry;
}

/** Permission checks reuse only explicit grants for this live document. */
export class BrowserSitePermissions {
  private readonly registry: Map<number, BrowserSitePermissions>;
  private readonly contentsId: number;
  private generation = 0;
  private grants = new Set<string>();
  private pending = new AbortController();
  private readonly navigation = (_event: unknown, _url: string, inPlace: boolean, main: boolean) => { if (main && !inPlace) this.revoke(); };
  constructor(private readonly wc: WebContents, private readonly approve: (origin: string, capability: string, signal: AbortSignal) => Promise<boolean>, private readonly enabled: () => boolean = () => true) {
    const registry = installBrowserPermissionHandlers(wc.session);
    this.registry = registry; this.contentsId = wc.id;
    registry.set(wc.id, this);
    wc.on("did-start-navigation", this.navigation);
  }
  check(permission: string, origin: string, details: Details): boolean {
    if (!this.enabled() || this.wc.isDestroyed() || !permitted.has(permission) || details.isMainFrame === false || !site(origin) || site(origin) !== site(this.wc.getURL())) return false;
    return this.grants.has(permission === "media" ? `media:${details.mediaType ?? "unknown"}` : permission);
  }
  async request(permission: string, details: Details): Promise<boolean> {
    if (this.wc.isDestroyed()) return false;
    const origin = site(details.requestingUrl ?? this.wc.getURL());
    if (!this.enabled() || this.wc.isDestroyed() || !permitted.has(permission) || details.isMainFrame === false || !origin || origin !== site(this.wc.getURL())) return false;
    const media = details.mediaTypes ?? [];
    if (permission === "media" && (!media.length || media.some(type => !["audio", "video"].includes(type)))) return false;
    const generation = this.generation;
    const signal = this.pending.signal;
    const label = permission === "media" ? media.map(type => type === "audio" ? "microphone" : "camera").join(" and ") : permission.startsWith("geolocation") ? "location" : "notifications";
    const allowed = await this.approve(origin, label, signal);
    if (!allowed || signal.aborted || generation !== this.generation || this.wc.isDestroyed() || origin !== site(this.wc.getURL()) || !this.enabled()) return false;
    if (permission === "media") for (const type of media) this.grants.add(`media:${type}`);
    else this.grants.add(permission);
    return true;
  }
  revoke() { this.generation++; this.grants.clear(); this.pending.abort(); this.pending = new AbortController(); }
  dispose() { this.revoke(); this.registry.delete(this.contentsId); this.wc.off("did-start-navigation", this.navigation); }
}
