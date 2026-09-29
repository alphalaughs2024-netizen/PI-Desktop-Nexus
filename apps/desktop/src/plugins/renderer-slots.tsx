import { Component, createElement, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { pluginToolName, rendererRegistrationError, type RendererRegistration, type RendererSlot } from "@pi-desktop/plugin-sdk";

export type Entry = { id: number; pluginId: string; registration: RendererRegistration; key?: string };
type Snapshot = { entries: Entry[] };

class Registry {
  private snapshot: Snapshot = { entries: [] };
  private listeners = new Set<() => void>();
  private nextId = 0;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private set(entries: Entry[]) { this.snapshot = { entries }; for (const listener of this.listeners) listener(); }
  register(pluginId: string, registration: RendererRegistration, tools: string[]): () => void {
    const error = rendererRegistrationError(pluginId, registration, tools);
    if (error) throw new Error(error);
    const key = registration.slot === "toolCard" ? pluginToolName(pluginId, registration.toolName!) :
      registration.slot === "blockRenderer" ? registration.language!.toLowerCase() :
      registration.slot === "composerTrigger" ? registration.trigger : undefined;
    if (key && this.snapshot.entries.some((entry) => entry.registration.slot === registration.slot && entry.key === key)) {
      throw new Error(`${registration.slot} ${key} is already registered`);
    }
    const entry = { id: ++this.nextId, pluginId, registration, key };
    this.set([...this.snapshot.entries, entry]);
    return () => { if (this.snapshot.entries.includes(entry)) this.set(this.snapshot.entries.filter((item) => item !== entry)); };
  }
  clear(pluginId: string) { this.set(this.snapshot.entries.filter((entry) => entry.pluginId !== pluginId)); }
}
export const rendererSlots = new Registry();
export function useRendererSlots(slot: RendererSlot, position?: "left" | "right", key?: string): Entry[] {
  const snapshot = useSyncExternalStore(rendererSlots.subscribe, rendererSlots.getSnapshot, rendererSlots.getSnapshot);
  return useMemo(() => snapshot.entries.filter((entry) => entry.registration.slot === slot &&
    (!position || (entry.registration.positions ?? ["left", "right"]).includes(position)) &&
    (!key || entry.key === key)), [snapshot, slot, position, key]);
}

export function detectPluginTrigger(value: string, cursor: number, entries: readonly Entry[]) {
  if (cursor < 1 || cursor > value.length) return null;
  let start = cursor - 1;
  while (start > 0 && !/\s/.test(value[start - 1]!)) start--;
  if (start > 0 && !/\s/.test(value[start - 1]!)) return null;
  const token = value.slice(start, cursor);
  const entry = entries.find((candidate) => candidate.registration.trigger === token[0]);
  if (!entry) return null;
  let end = cursor;
  while (end < value.length && !/\s/.test(value[end]!)) end++;
  return { mode: "plugin" as const, query: token.slice(1), tokenStart: start, tokenEnd: end, entry };
}

class SlotBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.warn("Plugin renderer slot failed", error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function RendererSlotMount({ slot, position, lookup, props }: {
  slot: Exclude<RendererSlot, "composerTrigger">; position?: "left" | "right";
  lookup?: string; props: Record<string, unknown>;
}) {
  const entries = useRendererSlots(slot, position, lookup);
  const fallback = slot === "toolCard" ? <div className="tool-row">{String(props.toolName ?? "Tool")}</div> :
    slot === "blockRenderer" ? <pre className="code-block">{String(props.source ?? "")}</pre> : null;
  return <>{entries.map((entry) => <SlotBoundary key={entry.id} fallback={fallback}><div className="nexus-plugin-slot" data-plugin={entry.pluginId}>
    {createElement(entry.registration.component as (props: any) => ReactNode, props)}
  </div></SlotBoundary>)}</>;
}
