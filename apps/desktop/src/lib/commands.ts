import i18n from "i18next";
import { api } from "./api";
import { useAppStore } from "../stores/app-store";
import { trustedExtensionCommandName, type Mode } from "@pi-desktop/shared";
import { CORE_BROWSER_TAB } from "./work-panel-tabs";

/**
 * First-party command execution shared by the command palette and the
 * composer "/" dispatch (D123). Builtin ids run app actions locally; other
 * ids round-trip to the plugin runtime via commandPalette/execute.
 */
export async function runPaletteCommand(commandId: string): Promise<void> {
  const store = useAppStore.getState();
  switch (commandId) {
    case "builtin.session.new":
      await store.newSession();
      break;
    case "builtin.agent.compact":
      await store.compactContext();
      break;
    case "builtin.mode.agent":
    case "builtin.mode.plan":
    case "builtin.mode.goal": {
      const mode: Mode = commandId.endsWith("plan")
        ? "plan"
        : commandId.endsWith("goal")
          ? "goal"
          : "agent";
      const activeSession = store.activeSessionId
        ? store.sessions.find((session) => session.id === store.activeSessionId)
        : undefined;
      if (activeSession) {
        await store.configureActiveSession({
          mode,
          providerId: activeSession.providerId,
          modelId: activeSession.modelId,
          thinkingLevel: activeSession.thinkingLevel,
        });
      } else if (store.settings) {
        // Keep the command useful from the empty home, where no session has
        // been created yet. The next session will inherit this default.
        const next = { ...store.settings, defaultMode: mode };
        await api.setSettings(next);
        useAppStore.setState({ settings: next });
      }
      break;
    }
    case "builtin.browser.open": {
      const current = useAppStore.getState();
      if (!current.activeSessionId) {
        const projectPath = current.activeProjectPath ?? current.workspace?.path;
        if (!projectPath) throw new Error(i18n.t("panel.browser.projectRequired"));
        await current.newSession({ projectPath });
      }
      const state = useAppStore.getState();
      const existing = state.workPanelTabs.some((tab) => tab.id === CORE_BROWSER_TAB.id);
      if (existing) state.activateWorkPanelTab(CORE_BROWSER_TAB.id);
      else state.openWorkPanelTab(CORE_BROWSER_TAB);
      break;
    }
    default: {
      // Trusted extension commands run inside the active session's sidecar
      // (spec 16 §8); without a session there is nothing to run them in.
      const extensionCommand = trustedExtensionCommandName(commandId);
      if (extensionCommand !== undefined) {
        await runExtensionCommand(extensionCommand, "");
        return;
      }
      await api.executeCommand(commandId);
    }
  }
}

export async function runExtensionCommand(name: string, args: string): Promise<void> {
  const store = useAppStore.getState();
  if (!store.activeSessionId) {
    throw new Error(i18n.t("plugins.agentExtension.commandNeedsSession"));
  }
  await api.runExtensionCommand({ sessionId: store.activeSessionId, name, args });
}
