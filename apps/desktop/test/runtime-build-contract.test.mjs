import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const desktopPackageUrl = new URL("../package.json", import.meta.url);
const dependencyPackages = [
  "@pi-desktop/shared",
  "@pi-desktop/i18n",
  "@pi-desktop/plugin-sdk",
  "@pi-desktop/plugin-devkit",
  "@pi-desktop/agent-runtime",
  "@pi-desktop/agent-host",
];
const depsScript = "pnpm run build:deps";

const readScripts = async () => {
  const pkg = JSON.parse(await readFile(desktopPackageUrl, "utf8"));
  return pkg.scripts ?? {};
};

test("build:deps rebuilds every workspace dependency consumed by Electron", async () => {
  const scripts = await readScripts();

  const buildDeps = scripts["build:deps"] ?? "";
  for (const packageName of dependencyPackages) {
    assert.match(
      buildDeps,
      new RegExp(`--filter ${packageName}`),
      `build:deps must rebuild ${packageName} for Electron`,
    );
  }
});

test("build:deps remains rooted when pnpm runs the desktop lifecycle from the workspace root", async () => {
  const scripts = await readScripts();

  assert.match(
    scripts["build:deps"] ?? "",
    /pnpm -C \.\.\/\.\. --filter @pi-desktop\/shared/,
    "build:deps must return pnpm to the workspace root before selecting dependencies",
  );
  assert.match(
    scripts["build:deps"] ?? "",
    /--fail-if-no-match/,
    "build:deps must fail rather than silently skip dependencies",
  );
});

test("desktop dev builds all workspace dependencies before Electron starts", async () => {
  const scripts = await readScripts();
  const predev = scripts.predev ?? "";
  const hostBuild = "cargo build --manifest-path ../../Cargo.toml -p host-core";

  assert.ok(predev.includes(depsScript), "predev must rebuild workspace dependencies");
  assert.ok(predev.includes(hostBuild), "predev must continue building host-core");
  assert.ok(
    predev.indexOf(depsScript) < predev.indexOf(hostBuild),
    "workspace dependency builds must complete before the desktop boot sequence continues",
  );
});

test("packaging scripts rebuild workspace dependencies before bundling", async () => {
  const scripts = await readScripts();
  const rendererBuild = "electron-vite build";

  for (const name of ["pack", "dist", "dist:mac", "dist:win", "dist:linux"]) {
    const script = scripts[name] ?? "";

    assert.ok(
      script.includes(depsScript),
      `${name} must rebuild workspace dependencies so packaging never consumes a stale dist/`,
    );
    assert.ok(
      script.indexOf(depsScript) < script.indexOf(rendererBuild),
      `${name} must rebuild workspace dependencies before ${rendererBuild}`,
    );
  }
});

// tsc -p exits 0 without emitting when a tsbuildinfo claims the project is
// up to date, even if dist/ is gone. Keeping the marker inside dist means
// losing the output also loses the marker, so the next build really rebuilds.
test("workspace packages keep their tsbuildinfo inside the output directory", async () => {
  const packages = ["shared", "i18n", "plugin-sdk", "plugin-devkit", "agent-runtime"];

  for (const name of packages) {
    const configUrl = new URL(`../../../packages/${name}/tsconfig.json`, import.meta.url);
    const config = JSON.parse(await readFile(configUrl, "utf8"));
    const { outDir, tsBuildInfoFile, composite } = config.compilerOptions ?? {};

    assert.equal(outDir, "dist", `${name} must emit into dist`);
    assert.ok(composite, `${name} is expected to stay a composite project`);
    assert.equal(
      tsBuildInfoFile,
      "dist/tsconfig.tsbuildinfo",
      `${name} must store tsbuildinfo inside dist so a removed dist forces a real rebuild`,
    );

    const pkgUrl = new URL(`../../../packages/${name}/package.json`, import.meta.url);
    const pkg = JSON.parse(await readFile(pkgUrl, "utf8"));
    assert.match(
      pkg.scripts?.clean ?? "",
      /rmSync\('dist'/,
      `${name} clean must remove dist (which now carries the tsbuildinfo)`,
    );
  }
});
