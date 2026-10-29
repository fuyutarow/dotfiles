// Emulates the pinned skills CLI writing directly into global tool-owned directories. The
// caller always sets HOME to a throwaway fixture. Optional find-skills models the measured prompt.
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { parseSkillLock } from "../skills-declaration.ts";

const args = Bun.argv.slice(2);
const home = process.env["HOME"] ?? "";
const command = args[0] ?? "";
const sourceIndex = args.indexOf("add") + 1;
const source = args[sourceIndex] ?? "vendor/repo";
const names = args.flatMap((arg, index) =>
  arg === "--skill" && args[index + 1] !== undefined
    ? [args[index + 1] ?? ""]
    : [],
);
const isLocal = existsSync(source);
const stowaway =
  !isLocal && process.env["FAKE_SKILLS_STOWAWAY"] !== "0"
    ? ["find-skills"]
    : [];
const all = [...names, ...stowaway];
const content = process.env["FAKE_SKILLS_CONTENT"];

const marker = process.env["FAKE_SKILLS_MARKER"];
if (marker !== undefined)
  appendFileSync(
    marker,
    `${home}\t${process.cwd()}\t${command}\t${source}\t${all.join(",")}\n`,
  );
const argsMarker = process.env["FAKE_SKILLS_ARGS_MARKER"];
if (argsMarker !== undefined)
  appendFileSync(argsMarker, `${args.join("\t")}\n`);

const lockPath = resolve(home, ".agents/.skill-lock.json");
const existing = Bun.file(lockPath);
const previousText = (await existing.exists())
  ? readFileSync(lockPath, "utf8")
  : '{"skills":{}}';
const previous = parseSkillLock(previousText).unwrapOr({ skills: {} });

if (command === "remove") {
  const operands = args.slice(1);
  const firstFlag = operands.findIndex((arg) => arg.startsWith("-"));
  const removed = operands.slice(
    0,
    firstFlag < 0 ? operands.length : firstFlag,
  );
  for (const name of removed)
    rmSync(resolve(home, ".agents/skills", name), {
      recursive: true,
      force: true,
    });
  const skills = Object.fromEntries(
    Object.entries(previous.skills).filter(([name]) => !removed.includes(name)),
  );
  writeFileSync(
    lockPath,
    `${JSON.stringify({ ...previous, version: 3, skills }, null, 2)}\n`,
  );
  process.stdout.write(`fake skills: removed ${removed.join(", ")}\n`);
  process.exit(0);
}

const agentIndex = args.indexOf("--agent");
const agentArgs = agentIndex < 0 ? [] : args.slice(agentIndex + 1);
const firstAgentFlag = agentArgs.findIndex((arg) => arg.startsWith("-"));
const agentEnd = firstAgentFlag >= 0 ? firstAgentFlag : agentArgs.length;
const agents =
  agentIndex < 0 ? ["claude-code", "codex"] : agentArgs.slice(0, agentEnd);
let bases: string[];
if (agents.length === 1 && agents[0] === "codex") bases = [".agents/skills"];
else if (agents.length === 1 && agents[0] === "claude-code")
  bases = [".claude/skills"];
else bases = [".agents/skills", ".claude/skills"];

function install(name: string, base: string): void {
  const dir = resolve(home, base, name);
  if (isLocal) {
    cpSync(resolve(source, name), dir, {
      recursive: true,
      dereference: true,
      force: true,
    });
    return;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "SKILL.md"), content ?? `# ${name} (fetched)\n`);
}

for (const [index, name] of all.entries()) {
  for (const base of bases) install(name, base);
  if (
    isLocal &&
    (process.env["FAKE_SKILLS_FAIL_AFTER_ONE"] === "1" ||
      (process.env["FAKE_SKILLS_FAIL_CODEX"] === "1" &&
        agentIndex >= 0 &&
        agents.length === 1 &&
        agents[0] === "codex")) &&
    index === 0
  ) {
    process.stderr.write("fake skills: forced partial install failure\n");
    process.exit(17);
  }
}

const oldSkills = previous.skills;
const newSkills =
  process.env["FAKE_SKILLS_NO_LEDGER"] === "1"
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
