#!/usr/bin/env node

import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktopRoot = resolve(repoRoot, "apps", "desktop");

// A failed electron-vite build must not leave a mixed Main/preload/renderer
// tree that can be mistaken for a complete build by the boot probe.
rmSync(resolve(desktopRoot, "out"), { recursive: true, force: true });
