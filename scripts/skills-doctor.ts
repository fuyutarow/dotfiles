import { lstat, readFile, readdir } from "node:fs/promises";
import { fromAsyncThrowable } from "neverthrow";
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

async function repoFindings(
  dotfiles: string,
): Promise<{ count: number; findings: string[] }> {
  const skillRoot = resolve(dotfiles, "agents/skills");
  const findings = await inHouseLayoutRefusals(skillRoot);
  const entries = (await readdir(skillRoot, { withFileTypes: true })).filter(
    (entry) => entry.isDirectory() && !entry.name.startsWith("."),
  );
  for (const entry of entries) {
    const skillPath = resolve(skillRoot, entry.name, "SKILL.md");
    if (!SkillName.test(entry.name))
      findings.push(`${entry.name}: directory name is invalid`);
    const contents = await fromAsyncThrowable(() =>
      readFile(skillPath, "utf8"),
    )();
    if (contents.isErr()) {
      findings.push(`${entry.name}: SKILL.md is missing`);
      continue;
    }
    const text = contents.value;
    const name = /^name:\s*["']?([^\s"']+)["']?\s*$/mu.exec(text)?.[1];
    if (name !== entry.name)
      findings.push(
        `${entry.name}: frontmatter name does not match the directory`,
      );
  }

  const declaration = await readDeclaration(dotfiles);
  if (declaration.isErr()) {
    findings.push(`DECLARATION: ${declaration.error}`);
  } else {
    for (const { path, skill } of thirdPartySkillFiles(
      await skillFiles(skillRoot),
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
    if (await Bun.file(resolve(dotfiles, path)).exists())
      findings.push(`${path}: retired Claude plugin manifest remains`);

  return { count: entries.length, findings };
}

async function copyFinding(
  home: string,
  root: string,
  name: string,
  expected: string,
): Promise<string | undefined> {
  const target = resolve(home, root, name);
  const result = await fromAsyncThrowable(() => lstat(target))();
  if (result.isErr()) return `${root}/${name} is missing`;
  const state = result.value;
  if (state.isSymbolicLink()) return `${root}/${name} is a symlink`;
  if (!state.isDirectory()) return `${root}/${name} is not a directory`;
  const installedSkill = resolve(target, "SKILL.md");
  const invalid = await skillLayoutRefusal(target);
  if (invalid !== undefined) return invalid;
  const contents = await fromAsyncThrowable(() =>
    readFile(installedSkill, "utf8"),
  )();
  if (contents.isErr()) {
    return `${root}/${name}/SKILL.md is missing or stale`;
  }
  const installed = contents.value;
  return installed === expected
    ? undefined
    : `${root}/${name}/SKILL.md is missing or stale`;
}

async function pluginSettingsFindings(
  dotfiles: string,
  home: string,
): Promise<string[]> {
  const paths = [
    resolve(home, ".claude/settings.json"),
    resolve(home, ".claude/settings.local.json"),
    resolve(dotfiles, ".claude/settings.json"),
    resolve(dotfiles, ".claude/settings.local.json"),
  ];
  const findings: string[] = [];
  for (const path of paths) {
    const contents = await fromAsyncThrowable(() => readFile(path, "utf8"))();
    if (contents.isErr()) continue;
    const text = contents.value;
    const settings = jsonOf(SettingsSchema).safeParse(text);
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

async function machineFindings(
  dotfiles: string,
  home: string,
): Promise<string[]> {
  const files = await skillFiles(resolve(dotfiles, "agents/skills"));
  const groups = await Promise.all(
    files.map(async (file) => {
      const name = basename(resolve(file.path, ".."));
      return Promise.all(
        [".claude/skills", ".agents/skills"].map(async (root) => {
          const finding = await copyFinding(home, root, name, file.content);
          return finding === undefined ? [] : [finding];
        }),
      );
    }),
  );
  const findings = groups.flat(2);
  findings.push(...(await pluginSettingsFindings(dotfiles, home)));

  const installedPath = resolve(home, ".claude/plugins/installed_plugins.json");
  const installedText = await fromAsyncThrowable(() =>
    readFile(installedPath, "utf8"),
  )();
  if (installedText.isOk()) {
    const installed = jsonOf(InstalledPluginsSchema).safeParse(
      installedText.value,
    );
    if (!installed.success) {
      findings.push(`${installedPath}: could not inspect installed plugins`);
    } else if (Object.hasOwn(installed.data.plugins, "dotfiles@dotfiles")) {
      findings.push("Claude plugin dotfiles@dotfiles is still installed");
    }
  }
  return findings;
}

async function main(): Promise<void> {
  const dotfiles = process.env["DOTFILES"] ?? resolve(import.meta.dir, "..");
  const machineMode = process.env["SKILLS_DOCTOR_MACHINE"] === "1";
  const findings = machineMode
    ? await machineFindings(dotfiles, process.env["HOME"] ?? homedir())
    : (await repoFindings(dotfiles)).findings;

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
    const { count } = await repoFindings(dotfiles);
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

await main();
process.exit(process.exitCode ?? 0);
