// `mise run lint:skills-wiring` checks in-house skill links, third-party provenance boundaries,
// and that global skill paths no longer write through into a repository.

import { existsSync, lstatSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { cli } from "cleye";
import { fromThrowable } from "neverthrow";
import {
  homeRepoLinkedSkillTargets,
  readDeclaration,
  skillFiles,
  thirdPartySkillFiles,
} from "./skills-declaration.ts";

const USAGE =
  "Usage: bun scripts/skills-doctor.ts [--dotfiles <path>] [--home <path>]\n";

type Finding = { level: "FAIL" | "SKIP"; line: string };

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

let prototypeFlagSeen = false;
function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") prototypeFlagSeen = true;
}

function isDir(path: string): boolean {
  return fromThrowable((value: string) => statSync(value))(path)
    .map((stat) => stat.isDirectory())
    .unwrapOr(false);
}

function isRealPath(path: string): boolean {
  return fromThrowable((value: string) => lstatSync(value))(path)
    .map((stat) => !stat.isSymbolicLink())
    .unwrapOr(false);
}

function listSkillNames(skillsDir: string): string[] {
  return fromThrowable((path: string) => readdirSync(path))(skillsDir)
    .map((names) =>
      names
        .filter((name) => !name.startsWith("."))
        .filter((name) => isDir(join(skillsDir, name)))
        .toSorted(),
    )
    .unwrapOr([]);
}

function checkShadowing(home: string, dotfiles: string): Finding[] {
  const claudeSkills = resolve(home, ".claude/skills");
  if (!isDir(claudeSkills))
    return [
      {
        level: "SKIP",
        line: `SHADOW: ${claudeSkills} absent — nothing linked yet`,
      },
    ];
  const findings: Finding[] = [];
  for (const name of listSkillNames(resolve(dotfiles, "agents/skills"))) {
    const destination = join(claudeSkills, name);
    if (!isRealPath(destination)) continue;
    findings.push({
      level: "FAIL",
      line:
        `SHADOW: ${destination} is a real path, so agents/skills/${name} is never read. ` +
        `Run: rip ${destination} && mise run link:skills`,
    });
  }
  return findings;
}

function checkGlobalTargets(home: string, dotfiles: string): Finding[] {
  const universalRoot = resolve(home, ".agents/skills");
  const declaration = readDeclaration(dotfiles);
  if (declaration.isErr())
    return [{ level: "FAIL", line: `DECLARATION: ${declaration.error}` }];
  const names = declaration.value.skills.map((entry) => entry.skill);
  const unsafe = homeRepoLinkedSkillTargets(home, dotfiles, names);
  const findings: Finding[] = unsafe.map((path) => ({
    level: "FAIL",
    line: `Refusing: ${path} resolves into a repository; run mise run skills:migrate`,
  }));
  if (!existsSync(universalRoot))
    findings.push({
      level: "SKIP",
      line: `WIRING: ${universalRoot} absent — no Codex global skills installed`,
    });
  return findings;
}

function checkRepoProvenance(dotfiles: string): Finding[] {
  const declaration = readDeclaration(dotfiles);
  if (declaration.isErr())
    return [{ level: "FAIL", line: `DECLARATION: ${declaration.error}` }];
  return thirdPartySkillFiles(
    skillFiles(resolve(dotfiles, "agents/skills")),
    declaration.value,
  ).map(({ path, skill }) => ({
    level: "FAIL",
    line: `THIRD-PARTY: ${path} has declared vendor provenance for "${skill}"; remove it from agents/skills`,
  }));
}

function main(): void {
  const parsed = cli(
    {
      name: "skills-doctor.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "Fail when third-party skill bytes reappear in the repo or global paths write through into a repository.",
      },
      flags: {
        dotfiles: { type: String },
        home: { type: String },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (prototypeFlagSeen) {
    process.stderr.write(`unknown flag(s): --__proto__\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (parsed.flags.dotfiles === "" || parsed.flags.home === "") {
    process.stderr.write(
      `--dotfiles and --home require non-empty values\n${USAGE}`,
    );
    process.exitCode = 2;
    return;
  }
  if (parsed._.length > 0) {
    process.stderr.write(
      `unexpected positional argument: ${parsed._[0]}\n${USAGE}`,
    );
    process.exitCode = 2;
    return;
  }

  const home = parsed.flags.home ?? process.env.HOME ?? homedir();
  const dotfiles =
    parsed.flags.dotfiles ??
    process.env.DOTFILES ??
    resolve(import.meta.dir, "..");
  const findings = [
    ...checkRepoProvenance(dotfiles),
    ...checkShadowing(home, dotfiles),
    ...checkGlobalTargets(home, dotfiles),
  ];
  for (const finding of findings)
    print(`${finding.level === "FAIL" ? "❌" : "⏭"} ${finding.line}`);

  const failures = findings.filter(
    (finding) => finding.level === "FAIL",
  ).length;
  if (failures > 0) {
    print(`SKILLS-WIRING FAIL: ${failures} problem(s)`);
    process.exitCode = 1;
    return;
  }
  print(
    "✅ SKILLS-WIRING PASS: in-house skills only, tool-owned global targets",
  );
}

process.on("uncaughtException", (error) => {
  process.stderr.write(
    `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});

main();
process.exit(process.exitCode ?? 0);
