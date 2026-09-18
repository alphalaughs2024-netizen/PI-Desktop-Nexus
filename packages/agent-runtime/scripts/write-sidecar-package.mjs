import { mkdir, writeFile } from "node:fs/promises";

await mkdir(new URL("../dist-bundle/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../dist-bundle/package.json", import.meta.url),
  `${JSON.stringify({ type: "module" })}\n`,
  "utf8",
);
