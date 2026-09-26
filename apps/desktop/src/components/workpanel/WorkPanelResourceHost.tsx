import type { ComponentType, ReactNode } from "react";
import { createElement } from "react";
import { BrowserCoreTab } from "./BrowserCoreTab";
import { FilesTab } from "./FilesTab";
import { ReviewTab } from "./ReviewTab";
import { ContextVaultTab } from "./ContextVaultTab";
import { PromptInspectorTab } from "./PromptInspectorTab";
import { PluginViewTab } from "./PluginViewTab";
import type { WorkPanelPresentation } from "../../lib/work-panel-presentation";
import type { WorkPanelTab } from "../../lib/work-panel-tabs";
import { parsePluginViewRef } from "../../lib/work-panel-tabs";
import type { PluginViewMeta } from "@pi-desktop/shared";

export type WorkPanelResourceProps = {
  presentation: WorkPanelPresentation;
  sessionId?: string;
  active: boolean;
  blocked: boolean;
  tab: WorkPanelTab;
  resourceId: string;
};

export type WorkPanelResourceContext = {
  pluginViews: PluginViewMeta[];
  activeSessionId?: string;
};

export type WorkPanelResourceDefinition = {
  kind: WorkPanelTab["kind"];
  lifecycle: "renderer" | "native-guest";
  supportsMaximized: boolean;
  render: (props: WorkPanelResourceProps, context: WorkPanelResourceContext) => ReactNode;
};

const renderer = (Component: ComponentType<any>) => (props: WorkPanelResourceProps) => createElement(Component, props);

export const WORK_PANEL_RESOURCE_REGISTRY: ReadonlyMap<WorkPanelTab["kind"], WorkPanelResourceDefinition> = new Map<WorkPanelTab["kind"], WorkPanelResourceDefinition>([
  ["browser", { kind: "browser", lifecycle: "native-guest", supportsMaximized: true, render: (props) => <BrowserCoreTab sessionId={props.sessionId} location={props.tab.location} presentation={props.presentation} transitioning={props.blocked} blocked={props.blocked || !props.active} /> }],
  ["file", { kind: "file", lifecycle: "renderer", supportsMaximized: true, render: renderer(FilesTab) }],
  ["review", { kind: "review", lifecycle: "renderer", supportsMaximized: true, render: renderer(ReviewTab) }],
  ["contextVault", { kind: "contextVault", lifecycle: "renderer", supportsMaximized: true, render: renderer(ContextVaultTab) }],
  ["promptInspector", { kind: "promptInspector", lifecycle: "renderer", supportsMaximized: true, render: renderer(PromptInspectorTab) }],
  ["plugin", { kind: "plugin", lifecycle: "native-guest", supportsMaximized: true, render: (props, context) => { const ref = parsePluginViewRef(props.tab.resource); return ref ? <PluginViewTab pluginId={ref.pluginId} viewId={ref.viewId} title={props.tab.resource ?? "Plugin"} sessionId={props.sessionId} location={props.tab.location} blocked={props.blocked || !props.active} /> : null; } }],
]);

export function WorkPanelResourceHost({ tabs, activeTabId, presentation, sessionId, blocked, pluginViews }: { tabs: WorkPanelTab[]; activeTabId: string | null; presentation: WorkPanelPresentation; sessionId?: string; blocked: boolean; pluginViews: PluginViewMeta[] }) {
  return <div className="work-panel-resource-host">{tabs.map((tab) => {
    const definition = WORK_PANEL_RESOURCE_REGISTRY.get(tab.kind);
    if (!definition) return null;
    const active = tab.id === activeTabId;
    return <div key={tab.id} id={`work-panel-surface-${tab.id}`} className={`work-panel-tabpane${active ? "" : " is-hidden"}`} role="tabpanel" aria-hidden={!active} {...(!active ? { inert: true } : {})} data-work-panel-resource={tab.kind} data-work-panel-active={active}>
      {definition.render({ presentation, sessionId, active, blocked, tab, resourceId: tab.id }, { pluginViews, activeSessionId: sessionId })}
    </div>;
  })}</div>;
}
