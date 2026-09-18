import type { SummonShortcutStatus } from "@pi-desktop/shared";

export type { SummonShortcutStatus } from "@pi-desktop/shared";

export function emptySummonShortcutStatus(): SummonShortcutStatus {
  return { binding: null, accelerator: null, registered: false };
}

export function sameSummonShortcutStatus(
  left: SummonShortcutStatus,
  right: SummonShortcutStatus,
): boolean {
  return (
    left.binding === right.binding &&
    left.accelerator === right.accelerator &&
    left.registered === right.registered &&
    left.errorCode === right.errorCode
  );
}

export function summonShortcutFailureKey(
  accelerator: string,
  platform: NodeJS.Platform,
): string {
  return `${platform}\u0000${accelerator}`;
}

export function shouldReportSummonShortcutFailure(
  previousKey: string | null,
  nextKey: string,
): boolean {
  return previousKey !== nextKey;
}
