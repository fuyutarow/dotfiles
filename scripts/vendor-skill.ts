// Install declared third-party Agent Skills into their tools' global skill directories.
// `agents/skills` is reserved for in-house skills; the repo records only source + skill identity.
//
// Four measured CLI hazards remain guarded (skills@1.5.22): without `-g`, the CLI writes into
// cwd; without `--skill`, it installs every source skill; `add` overwrites same-named paths; and
// `-y` accepts the unrequested `find-skills` companion prompt. We always pass explicit names and
// `-g`, run the child from a throwaway cwd, refuse repo-owned names/targets, and remove only new
// lock entries that were not requested.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { cli } from "cleye";
import { fromThrowable } from "neverthrow";
import { z } from "../agents/hooks/zod.ts";
import {
  formatDeclaration,
  homePathRefusals,
  parseDeclaration,
  pathExists,
  resolvesIntoRepository,
  skillCliArgs,
  type ThirdPartySkill,
} from "./skills-declaration.ts";
import {
  readInstalledLock,
  removeNewStowaways,
  runSkillsCli,
  targetSkillNames,
} from "./skills-install.ts";

const USAGE =
  "Usage: bun scripts/vendor-skill.ts <owner/repo> --skill <name> [--skill <name>…] " +
  "[--dry-run] [--dotfiles <path>] [--home <path>]\n";
const SourceName = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u);
const SkillName = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/u);

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

function fail(line: string): void {
  process.stderr.write(`${line}\n`);
}

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    fail(`unknown flag(s): --${flag}\n${USAGE}`);
    process.exit(2);
  }
}

function addRefusals(
  names: string[],
  dotfiles: string,
  home: string,
  declaration: ThirdPartySkill,
): string[] {
  const refusals = homePathRefusals(home, dotfiles, names);
  const declared = new Set(declaration.skills.map((entry) => entry.skill));
  for (const name of names) {
    if (existsSync(resolve(dotfiles, "agents/skills", name)))
      refusals.push(
        `COLLISION: ${name} is owned by agents/skills; third-party skills cannot replace in-house skills`,
      );
    if (declared.has(name))
      refusals.push(
        `DECLARED: ${name} is already in agents/skills.thirdparty.toml; use mise run skills:sync`,
      );
    if (
      !declared.has(name) &&
      [
        resolve(home, ".agents/skills", name),
        resolve(home, ".claude/skills", name),
      ].some((path) => pathExists(path))
    )
      refusals.push(
        `INSTALLED: ${name} already occupies a global skill path; refusing to overwrite an undeclared skill`,
      );
  }
  return refusals;
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "vendor-skill.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: ["[source]"],
      help: {
        description:
          "Install third-party skills from the repo declaration into tool-owned global directories.",
      },
      flags: {
        skill: { type: [String] },
        dryRun: { type: Boolean, default: false },
        dotfiles: { type: String },
        home: { type: String },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );

  const source = parsed._.source;
  const names = parsed.flags.skill.filter((name) => name !== "");
  if (source === undefined || source === "") {
    fail(`missing <owner/repo>\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (parsed._.length > 1) {
    fail(`unexpected positional argument: ${parsed._[1]}\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (!SourceName.safeParse(source).success) {
    fail(`invalid <owner/repo>: ${source}\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (names.length === 0) {
    fail(
      `refusing: --skill is required. Without it, the CLI installs EVERY skill in ${source}.\n${USAGE}`,
    );
    process.exitCode = 2;
    return;
  }
  const invalidNames = names.filter(
    (name) => !SkillName.safeParse(name).success,
  );
  if (invalidNames.length > 0 || new Set(names).size !== names.length) {
    const shownNames =
      invalidNames.length > 0 ? invalidNames.join(", ") : names.join(", ");
    fail(`invalid or duplicate skill name(s): ${shownNames}`);
    process.exitCode = 2;
    return;
  }

  const home = parsed.flags.home ?? process.env["HOME"] ?? homedir();
  const dotfiles =
    parsed.flags.dotfiles ??
    process.env["DOTFILES"] ??
    resolve(import.meta.dir, "..");
  const declarationPath = resolve(dotfiles, "agents/skills.thirdparty.toml");
  const declarationText = fromThrowable((path: string) =>
    readFileSync(path, "utf8"),
  )(declarationPath);
  if (declarationText.isErr()) {
    fail(`FATAL: ${declarationPath}: ${errorText(declarationText.error)}`);
    process.exitCode = 1;
    return;
  }
  const declaration = parseDeclaration(declarationText.value);
  if (declaration.isErr()) {
    fail(`FATAL: ${declaration.error}`);
    process.exitCode = 1;
    return;
  }

  const refusals = addRefusals(names, dotfiles, home, declaration.value);
  if (refusals.length > 0) {
    for (const refusal of refusals) fail(refusal);
    process.exitCode = 3;
    return;
  }

  const argv = skillCliArgs(declaration.value.cli_version, source, names);
  if (resolvesIntoRepository(process.cwd(), dotfiles) && !argv.includes("-g")) {
    fail(
      "Refusing: cwd is inside the repo and global install is not enabled; run mise run skills:migrate",
    );
    process.exitCode = 3;
    return;
  }
  if (parsed.flags.dryRun) {
    print(`[dry-run] would run: ${argv.join(" ")}`);
    for (const name of names)
      print(`[dry-run] would declare and install: ${source} ${name}`);
    return;
  }

  const beforeResult = readInstalledLock(home);
  if (beforeResult === undefined) {
    fail(
      "FATAL: global skills lock is unreadable; refusing to install without safe stowaway detection",
    );
    process.exitCode = 1;
    return;
  }
  const namesBefore = targetSkillNames(home);
  const outcome = await runSkillsCli(
    declaration.value.cli_version,
    source,
    names,
    home,
  );

  const afterResult = readInstalledLock(home);
  if (afterResult === undefined) {
    fail(
      "FATAL: global skills lock is unreadable after install; stowaway cleanup could not be verified",
    );
    process.exitCode = 1;
    return;
  }
  const cleanup = removeNewStowaways(
    home,
    beforeResult,
    afterResult,
    names,
    namesBefore,
  );
  if (cleanup.isErr()) {
    fail(`FATAL: could not remove new unrequested skills: ${cleanup.error}`);
    process.exitCode = 1;
    return;
  }
  for (const name of cleanup.value)
    print(`STOWAWAY: removed new unrequested global skill ${name}`);

  if (outcome.exitCode !== 0 || outcome.timedOut) {
    fail(
      `FATAL: skills CLI ${outcome.timedOut ? "timed out" : `exited ${outcome.exitCode}`}; declaration unchanged`,
    );
    process.exitCode = 1;
    return;
  }

  const installedLock = readInstalledLock(home);
  const missing = names.filter(
    (name) =>
      installedLock === undefined ||
      !Object.hasOwn(installedLock.skills, name) ||
      !existsSync(resolve(home, ".agents/skills", name, "SKILL.md")) ||
      !existsSync(resolve(home, ".claude/skills", name, "SKILL.md")),
  );
  if (missing.length > 0) {
    fail(
      `FATAL: CLI returned success without installing and recording: ${missing.join(", ")}`,
    );
    fail("  agents/skills.thirdparty.toml was not changed");
    process.exitCode = 1;
    return;
  }

  const next = {
    ...declaration.value,
    skills: [
      ...declaration.value.skills,
      ...names.map((skill) => ({ source, skill })),
    ],
  };
  writeFileSync(declarationPath, formatDeclaration(next));
  for (const name of names) print(`installed: ${source} ${name}`);
}

if (import.meta.main) {
  const result = await Promise.try(main).then(
    () => ({ ok: true as const }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  if (!result.ok) {
    fail(
      `FATAL: ${result.error instanceof Error ? result.error.message : String(result.error)}`,
    );
    process.exit(1);
  }
  process.exit(process.exitCode ?? 0);
}
