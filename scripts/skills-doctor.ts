import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { jsonOf, z } from "../agents/hooks/zod.ts";
import {
  inHouseLayoutRefusals,
  skillLayoutRefusal,
  readDeclaration,
  skillFiles,
  thirdPartySkillFiles,
} from "./skills-declaration.ts";

const InstalledPluginsSchema = z.looseObject({
  plugins: z.record(z.string(), z.array(z.looseObject({ scope: z.string() }))),
});
const SettingsSchema = z.record(z.string(), z.unknown());
const SkillName = /^[a-z0-9][a-z0-9-]{0,63}$/u;

function repoFindings(dotfiles: string): { count: number; findings: string[] } {
  const skillRoot = resolve(dotfiles, "agents/skills");
  const findings = inHouseLayoutRefusals(skillRoot);
  const entries = readdirSync(skillRoot, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && !entry.name.startsWith("."),
  );
  for (const entry of entries) {
    const skillPath = resolve(skillRoot, entry.name, "SKILL.md");
    if (!SkillName.test(entry.name))
      findings.push(`${entry.name}: directory name is invalid`);
    if (!existsSync(skillPath)) {
      findings.push(`${entry.name}: SKILL.md is missing`);
      continue;
    }
    const text = readFileSync(skillPath, "utf8");
    const name = /^name:\s*["']?([^\s"']+)["']?\s*$/mu.exec(text)?.[1];
    if (name !== entry.name)
      findings.push(
        `${entry.name}: frontmatter name does not match the directory`,
      );
  }

  const declaration = readDeclaration(dotfiles);
  if (declaration.isErr()) {
    findings.push(`DECLARATION: ${declaration.error}`);
  } else {
    for (const { path, skill } of thirdPartySkillFiles(
      skillFiles(skillRoot),
      declaration.value,
    ))
      findings.push(
        `THIRD-PARTY: ${path} has declared vendor provenance for "${skill}"`,
      );
  }

  for (const path of [
    ".claude-plugin/marketplace.json",
    "agents/skills/.claude-plugin/plugin.json",
  ])
    if (existsSync(resolve(dotfiles, path)))
      findings.push(`${path}: retired Claude plugin manifest remains`);

  return { count: entries.length, findings };
}

function copyFinding(
  home: string,
  root: string,
  name: string,
  expected: string,
): string | undefined {
  const target = resolve(home, root, name);
  const state = lstatSync(target, { throwIfNoEntry: false });
  if (state === undefined) return `${root}/${name} is missing`;
  if (state.isSymbolicLink()) return `${root}/${name} is a symlink`;
  if (!state.isDirectory()) return `${root}/${name} is not a directory`;
  const installedSkill = resolve(target, "SKILL.md");
  const invalid = skillLayoutRefusal(target);
  if (invalid !== undefined) return invalid;
  if (!existsSync(installedSkill))
    return `${root}/${name}/SKILL.md is missing or stale`;
  return readFileSync(installedSkill, "utf8") === expected
    ? undefined
    : `${root}/${name}/SKILL.md is missing or stale`;
}

function pluginSettingsFindings(dotfiles: string, home: string): string[] {
  const paths = [
    resolve(home, ".claude/settings.json"),
    resolve(home, ".claude/settings.local.json"),
    resolve(dotfiles, ".claude/settings.json"),
    resolve(dotfiles, ".claude/settings.local.json"),
  ];
  const findings: string[] = [];
  for (const path of paths) {
    if (!existsSync(path)) continue;
    const settings = jsonOf(SettingsSchema).safeParse(
      readFileSync(path, "utf8"),
    );
    if (!settings.success) {
      findings.push(`${path}: could not check retired plugin settings`);
      continue;
    }
    const value = settings.data;
    const enabledPlugins = value["enabledPlugins"];
    const marketplaces = value["extraKnownMarketplaces"];
    if (
      enabledPlugins !== null &&
      typeof enabledPlugins === "object" &&
      Object.hasOwn(enabledPlugins, "dotfiles@dotfiles")
    )
      findings.push(`${path}: dotfiles@dotfiles plugin setting remains`);
    if (
      marketplaces !== null &&
      typeof marketplaces === "object" &&
      Object.hasOwn(marketplaces, "dotfiles")
    )
      findings.push(`${path}: dotfiles marketplace setting remains`);
  }
  return findings;
}

function machineFindings(dotfiles: string, home: string): string[] {
  const files = skillFiles(resolve(dotfiles, "agents/skills"));
  const findings = files.flatMap((file) => {
    const name = basename(resolve(file.path, ".."));
    return [".claude/skills", ".agents/skills"].flatMap((root) => {
      const finding = copyFinding(home, root, name, file.content);
      return finding === undefined ? [] : [finding];
    });
  });
  findings.push(...pluginSettingsFindings(dotfiles, home));

  const installedPath = resolve(home, ".claude/plugins/installed_plugins.json");
  if (existsSync(installedPath)) {
    const installed = jsonOf(InstalledPluginsSchema).safeParse(
      readFileSync(installedPath, "utf8"),
    );
    if (!installed.success) {
      findings.push(`${installedPath}: could not inspect installed plugins`);
    } else if (Object.hasOwn(installed.data.plugins, "dotfiles@dotfiles")) {
      findings.push("Claude plugin dotfiles@dotfiles is still installed");
    }
  }
  return findings;
}

function main(): void {
  const dotfiles = process.env["DOTFILES"] ?? resolve(import.meta.dir, "..");
  const machineMode = process.env["SKILLS_DOCTOR_MACHINE"] === "1";
  const findings = machineMode
    ? machineFindings(dotfiles, process.env["HOME"] ?? homedir())
    : repoFindings(dotfiles).findings;

  for (const finding of findings)
    process.stdout.write(`❌ ${finding}; run mise run skills:sync\n`);
  if (findings.length > 0) {
    process.stdout.write(`SKILLS-WIRING FAIL: ${findings.length} problem(s)\n`);
    process.exitCode = 1;
    return;
  }
  if (machineMode) {
    process.stdout.write(
      "✅ SKILLS-WIRING PASS: in-house Claude and Codex copies match; dotfiles plugin absent\n",
    );
  } else {
    const { count } = repoFindings(dotfiles);
    process.stdout.write(
      `✅ SKILLS-WIRING PASS: ${count} in-house skill directories are valid; no plugin manifest or third-party skill is present\n`,
    );
  }
}

process.on("uncaughtException", (error) => {
  process.stderr.write(
    `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});

main();
process.exit(process.exitCode ?? 0);
