import { createHash } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import type { BrowserErrorCode } from "@pi-desktop/shared";
import { isAllowedHttpUrl, parseAllowedExternalUrl } from "./safe-open-external";
import { BROWSER_CDP_ALLOWLIST } from "./browser-cdp";

export type BrowserPolicyReason = "capability-disabled" | "plan-mode" | "url-blocked" | "path-outside-root" | "cdp-method-denied" | "invalid-input" | "guest-unavailable";
export type BrowserPolicyDecision = { allowed: true } | { allowed: false; code: BrowserErrorCode; reason: BrowserPolicyReason; message: string };

const fail = (code: BrowserErrorCode, reason: BrowserPolicyReason, message: string): BrowserPolicyDecision => ({ allowed: false, code, reason, message });

export function decideCapability(enabled: boolean): BrowserPolicyDecision {
  return enabled ? { allowed: true } : fail("BROWSER_POLICY_BLOCKED", "capability-disabled", "Browser is disabled by the core capability setting. Re-enable Browser in Settings and retry.");
}

export function decideMode(mode: "plan" | "agent", command: string): BrowserPolicyDecision {
  if (mode === "plan" && ["click", "fill", "type", "keypress", "evaluate", "cdp"].includes(command)) return fail("BROWSER_POLICY_BLOCKED", "plan-mode", "This Browser action is unavailable in Plan mode. Use an inspection action or switch to Agent mode.");
  return { allowed: true };
}

export function normalizeBrowserUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const value = raw.trim();
  if (isAllowedHttpUrl(value)) return new URL(value).toString();
  return null;
}

export function resolveBrowserFile(raw: unknown, root: string | null): string | null {
  if (typeof raw !== "string" || !root) return null;
  const value = raw.trim();
  let candidate: string;
  try {
    if (/^file:/i.test(value)) candidate = decodeURIComponent(new URL(value).pathname);
    else candidate = isAbsolute(value) ? value : resolve(root, value);
    const rootReal = realpathSync(root);
    const targetReal = realpathSync(resolve(candidate));
    if (!(targetReal === rootReal || targetReal.startsWith(rootReal + sep))) return null;
    if (!statSync(targetReal).isFile()) return null;
    return targetReal;
  } catch { return null; }
}

export function decideNavigation(raw: unknown, root: string | null): BrowserPolicyDecision {
  if (normalizeBrowserUrl(raw) || resolveBrowserFile(raw, root)) return { allowed: true };
  return fail("BROWSER_INVALID_INPUT", "url-blocked", "Browser navigation was blocked. Use an HTTP(S) URL or a file inside the workspace.");
}

export function decideExternal(raw: unknown): BrowserPolicyDecision {
  return parseAllowedExternalUrl(raw) ? { allowed: true } : fail("BROWSER_POLICY_BLOCKED", "url-blocked", "That destination cannot be opened externally.");
}

export function decideCdp(method: unknown, params?: unknown): BrowserPolicyDecision {
  if (typeof method !== "string" || !BROWSER_CDP_ALLOWLIST.has(method.trim())) return fail("BROWSER_POLICY_BLOCKED", "cdp-method-denied", "That CDP method is not available through Browser.");
  if (params !== undefined && (!params || typeof params !== "object" || JSON.stringify(params).length > 64 * 1024)) return fail("BROWSER_INVALID_INPUT", "invalid-input", "CDP parameters are invalid or exceed the Browser limit.");
  return { allowed: true };
}

export function safeHash(value: string): string { return createHash("sha256").update(value).digest("hex").slice(0, 16); }
export function bucket(value: number, steps: number[] = [1, 10, 50, 100, 500, 1000, 5000, 10000]): string { const n = Math.max(0, Math.floor(value)); const step = steps.find((candidate) => n <= candidate); return step === undefined ? `${steps.at(-1)}+` : `${step}`; }
