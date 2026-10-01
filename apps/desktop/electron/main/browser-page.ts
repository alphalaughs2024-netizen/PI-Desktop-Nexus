import type { DownloadItem, WebContents } from "electron";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MAX_DOWNLOAD = 32 * 1024 * 1024;
const MAX_ASSET = 8 * 1024 * 1024;
export type BrowserDownload = { id: string; filename: string; path: string; state: string; receivedBytes: number; totalBytes: number; url: string; createdAt: number };

/** All saved page artifacts belong to the calling chat's scratch directory. */
export class BrowserPageServices {
  private readonly session: WebContents["session"];
  private readonly downloads = new Map<string, { record: BrowserDownload; item: DownloadItem }>();
  private readonly listener = (_event: unknown, item: DownloadItem, source: WebContents) => {
    if (source?.id !== this.wc.id) return;
    if (item.getTotalBytes() > MAX_DOWNLOAD) { item.cancel(); return; }
    const id = randomUUID();
    const filename = item.getFilename().replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 120) || "download";
    mkdirSync(this.scratch, { recursive: true });
    const path = join(this.scratch, `${id}-${filename}`);
    item.setSavePath(path);
    const record: BrowserDownload = { id, filename, path, state: "progressing", receivedBytes: 0, totalBytes: item.getTotalBytes(), url: item.getURL(), createdAt: Date.now() };
    this.downloads.set(id, { record, item });
    item.on("updated", (_event, state) => {
      record.receivedBytes = item.getReceivedBytes(); record.totalBytes = item.getTotalBytes(); record.state = item.isPaused() ? "paused" : state;
      if (record.receivedBytes > MAX_DOWNLOAD || record.totalBytes > MAX_DOWNLOAD) { record.state = "size-limit"; item.cancel(); }
    });
    item.once("done", (_event, state) => { if (record.state !== "size-limit") record.state = state; record.receivedBytes = item.getReceivedBytes(); });
    while (this.downloads.size > 100) {
      const finished = [...this.downloads].find(([, value]) => ["completed", "cancelled", "interrupted", "size-limit"].includes(value.record.state));
      if (!finished) { item.cancel(); break; }
      this.downloads.delete(finished[0]);
    }
  };
  constructor(private readonly wc: WebContents, private readonly scratch: string) { this.session = wc.session; this.session.on("will-download", this.listener); }
  downloadAction(operation = "list", id?: string) {
    if (operation !== "list") {
      const entry = id ? this.downloads.get(id) : undefined;
      if (!entry) throw new Error("Unknown download in this tab");
      if (operation === "cancel") entry.item.cancel();
      else if (operation === "pause") entry.item.pause();
      else if (operation === "resume" && entry.item.canResume()) entry.item.resume();
      else throw new Error("Download operation is unavailable");
    }
    return { downloads: [...this.downloads.values()].map(value => ({ ...value.record })), maxBytes: MAX_DOWNLOAD };
  }
  private save(data: Uint8Array | string, extension: string) {
    mkdirSync(this.scratch, { recursive: true });
    const path = join(this.scratch, `browser-artifact-${randomUUID()}.${extension}`);
    writeFileSync(path, data);
    return path;
  }
  async page(operation: string, input: { url?: string; format?: string }, signal?: AbortSignal) {
    const documentUrl = this.wc.getURL();
    let changed = false;
    const onNavigation = () => { changed = true; };
    this.wc.on("did-start-navigation", onNavigation);
    const check = () => { signal?.throwIfAborted(); if (changed || this.wc.isDestroyed() || this.wc.getURL() !== documentUrl) throw Object.assign(new Error("Document changed while preparing the page artifact"), { code: "BROWSER_STALE_REF" }); };
    try {
    check();
    if (operation === "content") {
      return this.wc.executeJavaScript(`({url:location.href,title:document.title,text:(document.body?.innerText??'').slice(0,98304),truncated:(document.body?.innerText?.length??0)>98304,links:Array.from(document.querySelectorAll('a[href]')).slice(0,250).map(a=>({text:a.textContent.trim().slice(0,200),url:a.href}))})`);
    }
    if (operation === "assets") {
      return this.wc.executeJavaScript(`({url:location.href,assets:Array.from(document.querySelectorAll('img[src],script[src],link[href],video[src],audio[src],source[src]')).slice(0,250).map(e=>({type:e.tagName.toLowerCase(),url:e.currentSrc||e.src||e.href,name:(e.alt||e.title||'').slice(0,200),width:e.naturalWidth||e.videoWidth||undefined,height:e.naturalHeight||e.videoHeight||undefined}))})`);
    }
    if (operation === "save_asset") {
      const inventory = await this.page("assets", {}) as { assets: Array<{ url: string }> };
      if (!input.url || !inventory.assets.some(asset => asset.url === input.url)) throw new Error("Select an exact URL from this document's asset inventory");
      const url = new URL(input.url);
      if (!["http:", "https:", "data:"].includes(url.protocol)) throw new Error("This asset scheme cannot be exported");
      const response = await this.wc.session.fetch(url.href, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) });
      if (!response.ok || Number(response.headers.get("content-length")) > MAX_ASSET) throw new Error("Asset unavailable or exceeds 8 MiB");
      const chunks: Uint8Array[] = []; let size = 0;
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Asset returned no body");
      try {
        while (true) { check(); const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_ASSET) throw new Error("Asset exceeds 8 MiB"); chunks.push(value); }
      } finally { await reader.cancel(); }
      const mimeType = response.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
      const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg", "text/css": "css", "application/javascript": "js" } as Record<string, string>)[mimeType] || "bin";
      check();
      const path = this.save(Buffer.concat(chunks), extension);
      return { path, mimeType, byteLength: size, sourceUrl: url.href };
    }
    if (operation === "export") {
      if (input.format === "pdf") {
        const bytes = await this.wc.printToPDF({ printBackground: true });
        check();
        if (bytes.byteLength > MAX_DOWNLOAD) throw new Error("PDF exceeds 32 MiB");
        return { path: this.save(bytes, "pdf"), mimeType: "application/pdf", byteLength: bytes.byteLength };
      }
      const html = input.format === "html";
      const content = await this.wc.executeJavaScript(html ? "document.documentElement.outerHTML" : "document.body?.innerText ?? ''") as string;
      check();
      const truncated = Buffer.byteLength(content) > 1024 * 1024;
      const bytes = Buffer.from(content).subarray(0, 1024 * 1024);
      return { path: this.save(bytes, html ? "html" : "txt"), byteLength: bytes.byteLength, truncated };
    }
    throw new Error("Unknown page operation");
    } finally { this.wc.off("did-start-navigation", onNavigation); }
  }
  async annotations(operation: "start" | "read" | "clear") {
    const source = operation === "start" ? `(() => {
      if(globalThis.__nexusAnnotations) return {active:true};
      const entries=[]; const marks=[];
      const handler=event=>{event.preventDefault();event.stopImmediatePropagation();const e=event.target;if(!(e instanceof Element))return;const r=e.getBoundingClientRect();const mark=document.createElement('div');mark.textContent=String(entries.length+1);mark.style.cssText='position:fixed;z-index:2147483647;pointer-events:none;background:#245fcd;color:white;border:2px solid white;border-radius:4px;padding:2px 5px;font:12px sans-serif';mark.style.left=Math.max(0,r.x)+'px';mark.style.top=Math.max(0,r.y)+'px';document.documentElement.append(mark);marks.push(mark);entries.push({text:(e.textContent||e.getAttribute('aria-label')||'').trim().slice(0,300),tag:e.tagName.toLowerCase(),id:e.id,rect:{x:r.x,y:r.y,width:r.width,height:r.height}});if(entries.length>=20)document.removeEventListener('click',handler,true);};
      document.addEventListener('click',handler,true);globalThis.__nexusAnnotations={entries,stop:()=>{document.removeEventListener('click',handler,true);marks.forEach(e=>e.remove());delete globalThis.__nexusAnnotations;}};return {active:true};
    })()` : operation === "read" ? "({url:location.href,annotations:globalThis.__nexusAnnotations?.entries??[]})" : "(globalThis.__nexusAnnotations?.stop(),{active:false})";
    const results = await this.wc.executeJavaScriptInIsolatedWorld(991, [{ code: source }]);
    return results;
  }
  async styles(operation: "apply" | "clear", selector?: string, properties?: Record<string, string>) {
    if (operation === "clear") return this.wc.executeJavaScriptInIsolatedWorld(991, [{ code: "(document.getElementById('__nexus_style_preview')?.remove(),{cleared:true})" }]);
    if (typeof selector !== "string" || !selector || selector.length > 500 || /[{}\x00-\x1f]/.test(selector)) throw Object.assign(new Error("Invalid preview selector"), { code: "BROWSER_INVALID_INPUT" });
    if (!properties || typeof properties !== "object" || Array.isArray(properties)) throw Object.assign(new Error("Invalid preview properties"), { code: "BROWSER_INVALID_INPUT" });
    const entries = Object.entries(properties ?? {});
    if (!entries.length || entries.length > 30 || entries.some(([key, value]) => !/^(color|background-color|font-size|font-weight|line-height|padding(-[a-z]+)?|margin(-[a-z]+)?|border(-[a-z]+)?|width|height|max-width|min-width|display|gap|opacity|align-items|justify-content)$/.test(key) || typeof value !== "string" || value.length > 100 || /[{};]|url\(|@import/i.test(value))) throw Object.assign(new Error("Unsupported style preview property or value"), { code: "BROWSER_INVALID_INPUT" });
    const css = `${selector}{${entries.map(([key, value]) => `${key}:${value} !important`).join(";")}}`;
    return this.wc.executeJavaScriptInIsolatedWorld(991, [{ code: `(() => {let style=document.getElementById('__nexus_style_preview');if(!style){style=document.createElement('style');style.id='__nexus_style_preview';document.documentElement.append(style)}style.textContent=${JSON.stringify(css)};return {applied:true,temporary:true}})()` }]);
  }
  async webmcp(operation: "list" | "call", name?: string, args?: unknown) {
    if (operation === "list") return this.wc.executeJavaScript(`(async()=>{const api=navigator.modelContextTesting;if(!api?.listTools)return {supported:false,tools:[]};return {supported:true,url:location.href,tools:(await api.listTools()).slice(0,100)}})()`);
    if (!name || name.length > 128 || JSON.stringify(args ?? {}).length > 32 * 1024) throw new Error("Invalid WebMCP request");
    return this.wc.executeJavaScript(`(async()=>{const api=navigator.modelContextTesting;if(!api?.executeTool)throw new Error('WebMCP unavailable in this document');const tools=await api.listTools();if(!tools.some(t=>t.name===${JSON.stringify(name)}))throw new Error('Tool unavailable in this document');return await api.executeTool(${JSON.stringify(name)},${JSON.stringify(JSON.stringify(args ?? {}))})})()`);
  }
  dispose() { this.session.off("will-download", this.listener); for (const { record, item } of this.downloads.values()) if (["progressing", "paused"].includes(record.state)) item.cancel(); }
}
