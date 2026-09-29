import * as React from "react";
import { useEffect, useState } from "react";
import { isActiveInProject, type PluginSummary } from "@pi-desktop/shared";
import type { RendererApi } from "@pi-desktop/plugin-sdk";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { rendererSlots } from "./renderer-slots";

type Module = { onLoad?: (api: RendererApi, react: typeof React) => void | Promise<void>; onUnload?: () => void | Promise<void> };
type Source = { pluginId: string; version: string; source: string; actions: string[]; tools: string[] };

async function loadModule(source: Source): Promise<Module> {
  // The production CSP disallows eval. Blob modules require the explicit
  // renderer.extension grant and execute with host-realm privileges.
  const url = URL.createObjectURL(new Blob([source.source], { type: "text/javascript" }));
  try {
    return await import(/* @vite-ignore */ url) as Module;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function startModule(source: Source): () => void {
  let alive = true;
  const disposers = new Set<() => void>();
  let module: Module | undefined;
  const start = async () => {
    module = await loadModule(source);
    if (!alive) return;
    if (typeof module.onLoad !== "function") throw new Error("renderer entry must export onLoad");
    const rendererApi: RendererApi = {
      plugin: { id: source.pluginId, version: source.version },
      slots: { register: (registration) => {
        if (!alive) throw new Error("plugin unloaded");
        const dispose = rendererSlots.register(source.pluginId, registration, source.tools);
        disposers.add(dispose);
        return () => { disposers.delete(dispose); dispose(); };
      } },
      dispatch: (async (action: string, payload: { text?: string; id?: string }) => {
        if (!alive) throw new Error("plugin unloaded");
        if (!source.actions.includes(action)) throw new Error("renderer action was not declared");
        if (action === "composer.insertText") {
          const text = payload.text;
          if (typeof text !== "string" || new TextEncoder().encode(text).byteLength > 32 * 1024) throw new Error("invalid composer text");
          window.dispatchEvent(new CustomEvent("nexus:composer-insert", { detail: { text } }));
        } else if (action === "plugin.command") {
          if (typeof payload.id !== "string") throw new Error("command id required");
          await api.pluginRendererCommand(source.pluginId, payload.id);
        } else throw new Error("unknown renderer action");
      }) as RendererApi["dispatch"],
    };
    await module.onLoad(rendererApi, React);
  };
  void start().catch((error) => {
    for (const dispose of disposers) dispose();
    if (alive) rendererSlots.clear(source.pluginId);
    console.warn("Plugin renderer failed", source.pluginId, error);
  });
  return () => {
    alive = false;
    for (const dispose of disposers) dispose();
    rendererSlots.clear(source.pluginId);
    if (module) void Promise.resolve(module.onUnload?.()).catch((error) => console.warn("Plugin renderer unload failed", source.pluginId, error));
  };
}

export function PluginRendererHost(): null {
  const plugins = useAppStore((state) => state.plugins as PluginSummary[]);
  const projectPath = useAppStore((state) => state.workspace?.path ?? null);
  const [revision, setRevision] = useState(0);
  useEffect(() => api.onPluginChanged(() => setRevision((value) => value + 1)), []);
  useEffect(() => {
    let active = true;
    const disposers: Array<() => void> = [];
    void api.pluginRendererCatalog().then(({ modules }) => {
      if (!active) return;
      const eligible = new Set(plugins.filter((plugin) => isActiveInProject(plugin, projectPath)).map((plugin) => plugin.id));
      for (const source of modules) if (eligible.has(source.pluginId)) disposers.push(startModule(source));
    }, (error) => console.warn("Plugin renderer catalog unavailable", error));
    return () => { active = false; for (const dispose of disposers) dispose(); };
  }, [plugins, projectPath, revision]);
  return null;
}
