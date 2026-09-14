export const THEME_CSS_MAX_BYTES = 256 * 1024;

export type ThemeCssResult = { ok: true; css: string } | { ok: false; error: string };

/**
 * Decode CSS escape sequences (`\69` hex with an optional trailing space, and
 * `\c` single-character escapes) so `@\69mport` and `\75rl(` read as the
 * keywords they resolve to in the browser. Escapes inside comments and
 * strings are decoded too; that only makes the check stricter.
 */
export function decodeCssEscapes(css: string): string {
  return css.replace(/\\(?:([0-9a-fA-F]{1,6})[ \t\r\n\f]?|([^\r\n\f0-9a-fA-F]))/g, (match, hex, char) => {
    if (typeof hex === "string") {
      const codePoint = Number.parseInt(hex, 16);
      if (codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      return "\ufffd";
      }
      return String.fromCodePoint(codePoint);
    }
    return typeof char === "string" ? char : match;
  });
}

type CssScanState = "code" | "comment" | "string" | "url";

export function maskNonCodeCss(css: string): string {
  const out: string[] = [];
  let state: CssScanState = "code";
  let quote = "";
  let index = 0;
  while (index < css.length) {
    const ch = css.charAt(index);
    if (state === "comment") {
      if (ch === "*" && css.charAt(index + 1) === "/") {
        out.push("  "); index += 2; state = "code"; continue;
      }
      out.push(" "); index += 1; continue;
    }
    if (state === "string") {
      if (ch === "\\" && index + 1 < css.length) { out.push("  "); index += 2; continue; }
      out.push(" "); index += 1;
      if (ch === quote) { quote = ""; state = "code"; }
      continue;
    }
    if (state === "url") {
      if (quote) {
        out.push(ch);
        if (ch === "\\" && index + 1 < css.length) { out.push(css.charAt(index + 1)); index += 2; continue; }
        if (ch === quote) quote = "";
        index += 1; continue;
      }
      out.push(ch); index += 1;
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === ")") state = "code";
      continue;
    }
    if (ch === "/" && css.charAt(index + 1) === "*") { out.push("  "); index += 2; state = "comment"; continue; }
    if (ch === '"' || ch === "'") { quote = ch; out.push(" "); index += 1; state = "string"; continue; }
    if ((ch === "u" || ch === "U") && css.slice(index, index + 4).toLowerCase() === "url(") {
      out.push(css.slice(index, index + 4)); index += 4; state = "url"; continue;
    }
    out.push(ch); index += 1;
  }
  return out.join("");
}

function findThemeCssViolation(css: string): string | undefined {
  if (/@import\b/i.test(css)) {
    return "theme css must not use @import";
  }
  if (/<\/?\s*style/i.test(css) || /<!--/.test(css)) {
    return "theme css must not contain markup";
  }
  if (/javascript\s*:/i.test(css) || /expression\s*\(/i.test(css)) {
    return "theme css must not contain script expressions";
  }
  let wellFormedUrls = 0;
  for (const match of css.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi)) {
    wellFormedUrls += 1;
    const target = match[2].trim();
    if (!/^data:/i.test(target)) {
      return `theme css may only reference data: urls (found "${target}")`;
    }
  }
  // A `url(` the regex above could not parse (unterminated, nested quotes) is a
  // reference we cannot reason about, so refuse the whole sheet.
  if ((css.match(/url\(/gi) ?? []).length !== wellFormedUrls) {
    return "theme css contains a malformed url() reference";
  }
  return undefined;
}

/**
 * Validate CSS contributed by a plugin before it is injected into the shell.
 *
 * The renderer applies the text verbatim, so the checks here are the whole
 * boundary: no remote loads, no stylesheet chaining, no tag break-out, and a
 * hard size cap. Every check runs on the raw text and on a copy with CSS
 * escapes decoded, because the browser decodes `@\69mport` before parsing.
 */
export function sanitizeThemeCss(raw: string, maxBytes = THEME_CSS_MAX_BYTES): ThemeCssResult {
  const css = raw.replace(/^﻿/, "");
  const bytes = new TextEncoder().encode(css).length;
  if (bytes > maxBytes) {
    return { ok: false, error: `theme css exceeds ${maxBytes} bytes (${bytes})` };
  }
  if (!css.trim()) {
    return { ok: false, error: "theme css is empty" };
  }
  const decoded = decodeCssEscapes(css);
  const violation =
    findThemeCssViolation(maskNonCodeCss(css)) ??
    (decoded !== css ? findThemeCssViolation(maskNonCodeCss(decoded)) : undefined);
  if (violation) return { ok: false, error: violation };
  return { ok: true, css: css.trim() };
}
