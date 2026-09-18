import { UPDATE_CHECK_TIMEOUT_CODE } from "./update-timeout";

export type UpdateFailureClass =
  | "feed-unavailable"
  | "network"
  | "configuration"
  | "timeout";

export function classifyUpdateFailure(
  error: unknown,
  timedOut = false,
): UpdateFailureClass {
  if (
    timedOut ||
    (error as { code?: unknown } | null)?.code === UPDATE_CHECK_TIMEOUT_CODE
  ) {
    return "timeout";
  }
  const text =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (/latest|feed|release|404|406|not found|no published/.test(text)) {
    return "feed-unavailable";
  }
  if (/config|publish|provider|repository|owner|repo/.test(text)) {
    return "configuration";
  }
  return "network";
}

export function automaticFailureKey(
  failureClass: UpdateFailureClass,
  currentVersion: string,
): string {
  return `${failureClass}\u0000${currentVersion}`;
}

export function shouldReportAutomaticFailure(
  previousKey: string | null,
  nextKey: string,
): boolean {
  return previousKey !== nextKey;
}
