import { registerHooks, createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve("vite"));
const { transformSync } = viteRequire("esbuild");

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "electron") return { url: "nexus-test:electron", shortCircuit: true };
    if (specifier.startsWith(".") && context.parentURL && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (candidate.protocol === "file:" && existsSync(fileURLToPath(candidate))) return next(candidate.href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === "nexus-test:electron") return { format: "module", source: "export class BrowserWindow { constructor() { throw new Error('Native windows require the Electron integration probe'); } }", shortCircuit: true };
    if (url.endsWith(".ts") && url.startsWith("file:")) return { format: "module", source: transformSync(readFileSync(fileURLToPath(url), "utf8"), { loader: "ts", format: "esm", target: "node22" }).code, shortCircuit: true };
    return next(url, context);
  },
});
