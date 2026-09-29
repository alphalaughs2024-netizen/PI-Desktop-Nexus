export type RendererSlot = "userAction" | "assistantAction" | "entryExtra" |
  "toolCard" | "blockRenderer" | "composerControl" | "composerTrigger";
export type RendererPosition = "left" | "right";
export type RendererRegistration = {
  slot: RendererSlot;
  component?: (props: any) => unknown;
  positions?: RendererPosition[];
  toolName?: string;
  language?: string;
  trigger?: string;
  items?: (query: string) => Array<{ label: string; insert: string }> | Promise<Array<{ label: string; insert: string }>>;
};
export type RendererApi = {
  plugin: { id: string; version: string };
  slots: { register(registration: RendererRegistration): () => void };
  dispatch(action: "composer.insertText", payload: { text: string }): Promise<void>;
  dispatch(action: "plugin.command", payload: { id: string }): Promise<void>;
};

export function rendererRegistrationError(pluginId: string, registration: RendererRegistration, ownTools: readonly string[]): string | undefined {
  if (!registration || !["userAction", "assistantAction", "entryExtra", "toolCard", "blockRenderer", "composerControl", "composerTrigger"].includes(registration.slot)) return "unknown slot";
  if (registration.slot === "composerTrigger") {
    if (!registration.trigger || !/^[!#$%&*+?~]$/.test(registration.trigger) || typeof registration.items !== "function") return "invalid composer trigger";
  } else if (typeof registration.component !== "function") return "slot component required";
  if (registration.positions && (registration.positions.length === 0 || registration.positions.some((side) => side !== "left" && side !== "right"))) return "invalid position";
  if (registration.slot === "toolCard" && (!registration.toolName || !ownTools.includes(registration.toolName))) return "tool card must belong to this plugin";
  if (registration.slot === "blockRenderer" && (!registration.language || !registration.language.toLowerCase().startsWith(`${pluginId}:`) || !/^[a-z0-9._:-]+$/i.test(registration.language))) return "code tag must use this plugin's namespace";
  return undefined;
}
