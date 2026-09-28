import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "../src/components/settings");
const catalogDir = join(root, "specialist-skills");
const catalog = readFileSync(join(catalogDir, "catalog.ts"), "utf8");
const market = readFileSync(join(root, "SpecialistSkillMarket.tsx"), "utf8");
const settings = readFileSync(join(root, "AgentSkillsPage.tsx"), "utf8");

test("every market entry has one self-contained, licensed document", () => {
  const ids = [...catalog.matchAll(/\{ id: "([a-z0-9-]+)", name:/g)].map((match) => match[1]);
  assert.equal(ids.length, 13);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(readFileSync(join(catalogDir, "LICENSE.txt"), "utf8"), /MIT License/);
  const documents = readdirSync(catalogDir).filter((name) => name.endsWith(".md") && name !== "NOTICE.md");
  assert.deepEqual(documents.sort(), ids.map((id) => `${id}.md`).sort());
  for (const id of ids) {
    const body = readFileSync(join(catalogDir, `${id}.md`), "utf8");
    assert.match(body, new RegExp(`^---\\r?\\nname: ${id}\\r?\\n`));
    assert.doesNotMatch(body, /(?:references|scripts|assets)\//);
  }
});

test("catalog entries are installed only through the user skill API", () => {
  assert.match(settings, /<SpecialistSkillMarket installed=\{globalSkills\}/);
  assert.match(market, /await api\.createUserSkill\(\{/);
  assert.match(market, /body: specialistSkillBody\(skill\.document\)/);
  assert.match(market, /level: "global"/);
  assert.match(market, /installedIds\.has\(skill\.id\)/);
  assert.doesNotMatch(catalog, /listBuiltinSkills|listWorkflowPackages/);
});
