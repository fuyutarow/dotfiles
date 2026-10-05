#!/usr/bin/env bun
// Fixture for vendor-skill.test.ts — emulates `skills add <source> -g … --skill <name>…` as
// measured (vendor-skill.ts header): each named skill lands in $HOME/.agents/skills/<name>/ with
// a ledger entry in $HOME/.agents/.skill-lock.json, plus the uninvited `find-skills` companion
// (note 4). It writes only under $HOME, which the caller sets to its throwaway directory.
// FAKE_SKILLS_NO_LEDGER=1 -> the skills arrive without ledger entries.
import { mkdirSync, writeFileSync } from "node:fs";

const args = Bun.argv.slice(2);
const home = process.env.HOME ?? "";
const names = args.flatMap((a, i) =>
  a === "--skill" && args[i + 1] !== undefined ? [args[i + 1] ?? ""] : [],
);
const all = [...names, "find-skills"];
for (const n of all) {
  mkdirSync(`${home}/.agents/skills/${n}`, { recursive: true });
  writeFileSync(`${home}/.agents/skills/${n}/SKILL.md`, `# ${n} (fetched)\n`);
}
const skills =
  process.env.FAKE_SKILLS_NO_LEDGER === "1"
    ? {}
    : Object.fromEntries(all.map((n) => [n, { source: args[1] }]));
writeFileSync(
  `${home}/.agents/.skill-lock.json`,
  JSON.stringify({ version: 3, skills }),
);
process.stdout.write(`fake skills: added ${all.join(", ")}\n`);
