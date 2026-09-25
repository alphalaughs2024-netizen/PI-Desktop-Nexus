import type { BrowserErrorCode } from "@pi-desktop/shared";
import { bucket, safeHash } from "./browser-policy";

export type BrowserTelemetryLogger = (event: string, fields: Record<string, unknown>) => void;

export class BrowserTelemetry {
  constructor(private readonly log: BrowserTelemetryLogger) {}
  requestStarted(command: string, requestId: string, browserId: string, sessionId: string, mode: string): void { this.log("browser.request.started", { command, request: safeHash(requestId), browser: safeHash(browserId), session: safeHash(sessionId), mode }); }
  requestFinished(event: "browser.request.completed" | "browser.request.failed" | "browser.request.timeout" | "browser.request.possibly_applied", command: string, requestId: string, elapsedMs: number, code?: BrowserErrorCode, flags?: { retryable?: boolean; possiblyApplied?: boolean }): void { this.log(event, { command, request: safeHash(requestId), elapsed: bucket(elapsedMs), ...(code ? { code } : {}), ...(flags ?? {}) }); }
  policy(allowed: boolean, reason: string, command: string): void { this.log(allowed ? "browser.policy.allowed" : "browser.policy.blocked", { command, reason }); }
  guest(state: string, reason: string): void { this.log(`browser.guest.${state}`, { reason }); }
  snapshot(nodeCount: number, bytes: number, unchanged: boolean, truncation?: unknown): void { this.log("browser.snapshot", { nodes: bucket(nodeCount), bytes: bucket(bytes), unchanged, truncation: typeof truncation === "object" && truncation ? Object.keys(truncation as object) : [] }); }
  payload(kind: "browser.screenshot" | "browser.console", bytes: number, truncated = false): void { this.log(kind, { bytes: bucket(bytes), truncated }); }
}
