// Emulates the pinned skills CLI writing directly into global tool-owned directories. The
// caller always sets HOME to a throwaway fixture. Optional find-skills models the measured prompt.
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { parseSkillLock } from "../skills-declaration.ts";

const args = Bun.argv.slice(2);
const home = process.env.HOME ?? "";
const sourceIndex = args.indexOf("add") + 1;
const source = args[sourceIndex] ?? "vendor/repo";
const names = args.flatMap((arg, index) =>
  arg === "--skill" && args[index + 1] !== undefined
    ? [args[index + 1] ?? ""]
    : [],
);
const stowaway =
  process.env.FAKE_SKILLS_STOWAWAY === "0" ? [] : ["find-skills"];
const all = [...names, ...stowaway];
const content = process.env.FAKE_SKILLS_CONTENT;

const marker = process.env.FAKE_SKILLS_MARKER;
if (marker !== undefined)
  appendFileSync(marker, `${home}\t${process.cwd()}\t${all.join(",")}\n`);

for (const name of all) {
  for (const base of [".agents/skills", ".claude/skills"]) {
    const dir = resolve(home, base, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, "SKILL.md"), content ?? `# ${name} (fetched)\n`);
  }
}

const lockPath = resolve(home, ".agents/.skill-lock.json");
const existing = Bun.file(lockPath);
const previousText = (await existing.exists())
  ? readFileSync(lockPath, "utf8")
  : '{"skills":{}}';
const previous = parseSkillLock(previousText).unwrapOr({ skills: {} });
const oldSkills = previous.skills;
const newSkills =
  process.env.FAKE_SKILLS_NO_LEDGER === "1"
    ? oldSkills
    : {
        ...oldSkills,
        ...Object.fromEntries(all.map((name) => [name, { source }])),
      };
writeFileSync(
  lockPath,
  `${JSON.stringify({ ...previous, version: 3, skills: newSkills }, null, 2)}\n`,
);
process.stdout.write(`fake skills: installed ${all.join(", ")}\n`);
