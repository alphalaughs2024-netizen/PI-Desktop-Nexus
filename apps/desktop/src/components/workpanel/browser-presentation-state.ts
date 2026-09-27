export type BrowserPresentationState =
  | "no-page"
  | "starting"
  | "ready"
  | "loading"
  | "unavailable"
  | "policy-blocked"
  | "debugger-unavailable"
  | "closed";

export type BrowserRecoveryState = Extract<BrowserPresentationState, "starting" | "unavailable" | "policy-blocked" | "debugger-unavailable" | "closed">;

export function isBrowserRecoveryState(state: BrowserPresentationState): state is BrowserRecoveryState {
  return state === "starting" || state === "unavailable" || state === "policy-blocked" || state === "debugger-unavailable" || state === "closed";
}

export function isBrowserGuestSurfaceVisible(state: BrowserPresentationState, isNewTab: boolean): boolean {
  return !isNewTab && (state === "ready" || state === "loading");
}
