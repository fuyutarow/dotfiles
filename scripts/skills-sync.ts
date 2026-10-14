// Reconcile Claude's local plugin, Codex's in-house copies, and declared third-party skills.
// Fresh upstream copies land in a throwaway HOME; only missing or changed vendor copies are installed.

import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { cli } from "cleye";
import { err, fromThrowable, ok } from "neverthrow";
import { jsonOf, z } from "../agents/hooks/zod.ts";
import {
  homePathRefusals,
  parseDeclaration,
  skillCliArgs,
} from "./skills-declaration.ts";
import {
  readInstalledLock,
  removeNewStowaways,
  runSkillsCli,
  runPinnedSkillsCommand,
  targetSkillNames,
} from "./skills-install.ts";
import { readDotfilesPlugin } from "./skills-plugin.ts";
import { removeRepoSkillSymlinks } from "./skills-links.ts";

const USAGE =
  "Usage: bun scripts/skills-sync.ts [--dry-run] [--in-house-only] [--dotfiles <path>] [--home <path>]\n";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

function fail(line: string): void {
  process.stderr.write(`${line}\n`);
}

const InHouseStateSchema = z.strictObject({
  version: z.literal(1),
  skills: z.record(z.string(), z.string()),
});

type InHouseState = z.infer<typeof InHouseStateSchema>;

const MarketplaceListSchema = z.array(
  z.object({
    name: z.string(),
    source: z.string(),
    path: z.string().optional(),
  }),
);
const PluginListSchema = z.array(
  z.object({ id: z.string(), scope: z.string(), enabled: z.boolean() }),
);
const SkillSourceSchema = z.object({ source: z.string() });

type CommandResult = { code: number; out: string; err: string };

function runClaude(args: string[], home: string, cwd: string): CommandResult {
  const result = fromThrowable(() =>
    Bun.spawnSync(["claude", ...args], {
      cwd,
      env: { ...process.env, HOME: home },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    }),
  )();
  if (result.isErr())
    return {
      code: 127,
      out: "",
      err: errorText(result.error),
    };
  return {
    code: result.value.exitCode ?? 1,
    out: result.value.stdout.toString(),
    err: result.value.stderr.toString(),
  };
}

function jsonLastLine<T>(
  result: CommandResult,
  schema: z.ZodType<T>,
  label: string,
) {
  if (result.code !== 0) {
    const detail = result.err.trim();
    return err(
      `${label} exited ${result.code}: ${detail.length > 0 ? detail : result.out.trim()}`,
    );
  }
  const line = result.out.trim().split(/\r?\n/u).at(-1) ?? "";
  const checked = jsonOf(schema).safeParse(line);
  if (!checked.success)
    return err(`${label} returned invalid JSON: ${checked.error.message}`);
  return ok(checked.data);
}

function loadInHouseState(home: string) {
  const path = resolve(home, ".agents/.dotfiles-skills.json");
  if (!existsSync(path)) {
    const empty: InHouseState = { version: 1, skills: {} };
    return ok(empty);
  }
  const raw = fromThrowable((value: string) => readFileSync(value, "utf8"))(
    path,
  );
  if (raw.isErr()) return err(`cannot read ${path}: ${errorText(raw.error)}`);
  const checked = jsonOf(InHouseStateSchema).safeParse(raw.value);
  return checked.success
    ? ok(checked.data)
    : err(`invalid ${path}: ${checked.error.message}`);
}

function writeInHouseState(
  home: string,
  state: InHouseState,
): string | undefined {
  const directory = resolve(home, ".agents");
  const path = resolve(directory, ".dotfiles-skills.json");
  const temporary = `${path}.${randomUUID()}.tmp`;
  const written = fromThrowable(() => {
    mkdirSync(directory, { recursive: true });
    writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, {
      flag: "wx",
    });
    renameSync(temporary, path);
  })();
  if (written.isOk()) return undefined;
  rmSync(temporary, { force: true });
  return errorText(written.error);
}

function isWithin(root: string, path: string): boolean {
  const rel = relative(root, path);
  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  );
}

function codexInHouseNamesFromLock(home: string, dotfiles: string): string[] {
  const lock = readInstalledLock(home);
  if (lock === undefined) return [];
  const sourceRoot = resolve(dotfiles, "agents/skills");
  return Object.entries(lock.skills)
    .filter(([, value]) => {
      const metadata = SkillSourceSchema.safeParse(value);
      if (!metadata.success) return false;
      const source = metadata.data.source;
      return isAbsolute(source) && isWithin(sourceRoot, resolve(source));
    })
    .map(([name]) => name);
}

function verifyPluginInstallation(
  pluginId: string,
  home: string,
  root: string,
): string | undefined {
  const installed = jsonLastLine(
    runClaude(["plugin", "list", "--json"], home, root),
    PluginListSchema,
    "claude plugin list",
  );
  if (installed.isErr()) return installed.error;
  const plugin = installed.value.find(
    (entry) => entry.id === pluginId && entry.scope === "user" && entry.enabled,
  );
  return plugin === undefined
    ? `Claude Code did not report ${pluginId} enabled at user scope`
    : undefined;
}

function syncClaudePlugin(
  home: string,
  root: string,
  marketplaceName: string,
  pluginName: string,
  dryRun: boolean,
): string | undefined {
  const pluginId = `${pluginName}@${marketplaceName}`;
  if (dryRun) {
    print(
      `[dry-run] would run claude plugin marketplace add ${root} --json if marketplace ${marketplaceName} is missing`,
    );
    print(
      `[dry-run] would install or enable Claude plugin ${pluginId} at user scope if needed`,
    );
    return undefined;
  }

  const marketplaces = jsonLastLine(
    runClaude(["plugin", "marketplace", "list", "--json"], home, root),
    MarketplaceListSchema,
    "claude plugin marketplace list",
  );
  if (marketplaces.isErr()) return marketplaces.error;
  const sameName = marketplaces.value.filter(
    (entry) => entry.name === marketplaceName,
  );
  if (
    sameName.some(
      (entry) =>
        entry.source !== "directory" ||
        entry.path === undefined ||
        resolve(entry.path) !== resolve(root),
    )
  )
    return `Claude marketplace ${marketplaceName} is already registered from a different source`;
  const samePath = marketplaces.value.find(
    (entry) =>
      entry.source === "directory" &&
      entry.path !== undefined &&
      resolve(entry.path) === resolve(root),
  );
  if (samePath !== undefined && samePath.name !== marketplaceName)
    return `dotfiles marketplace path is already registered as ${samePath.name}`;
  if (sameName.length === 0) {
    const added = jsonLastLine(
      runClaude(["plugin", "marketplace", "add", root, "--json"], home, root),
      z.object({ outcome: z.string(), message: z.string() }),
      "claude plugin marketplace add",
    );
    if (added.isErr()) return added.error;
    if (added.value.outcome !== "ok")
      return `claude plugin marketplace add failed: ${added.value.message}`;
  }

  const plugins = jsonLastLine(
    runClaude(["plugin", "list", "--json"], home, root),
    PluginListSchema,
    "claude plugin list",
  );
  if (plugins.isErr()) return plugins.error;
  const userPlugin = plugins.value.find(
    (entry) => entry.id === pluginId && entry.scope === "user",
  );
  if (userPlugin === undefined) {
    const installed = jsonLastLine(
      runClaude(
        ["plugin", "install", pluginId, "--scope", "user", "-y", "--json"],
        home,
        root,
      ),
      z.object({ outcome: z.string(), message: z.string() }),
      "claude plugin install",
    );
    if (installed.isErr()) return installed.error;
    if (installed.value.outcome !== "ok")
      return `claude plugin install failed: ${installed.value.message}`;
  } else if (!userPlugin.enabled) {
    const enabled = jsonLastLine(
      runClaude(
        ["plugin", "enable", pluginId, "--scope", "user", "--json"],
        home,
        root,
      ),
      z.object({ outcome: z.string(), message: z.string() }),
      "claude plugin enable",
    );
    if (enabled.isErr()) return enabled.error;
    if (enabled.value.outcome !== "ok")
      return `claude plugin enable failed: ${enabled.value.message}`;
  }

  return verifyPluginInstallation(pluginId, home, root);
}

async function syncInHouseCodex(
  home: string,
  root: string,
  names: readonly string[],
  thirdPartyNames: readonly string[],
  cliVersion: string,
  dryRun: boolean,
): Promise<string | undefined> {
  const loaded = loadInHouseState(home);
  if (loaded.isErr()) return loaded.error;
  const previous = new Set([
    ...Object.keys(loaded.value.skills),
    ...codexInHouseNamesFromLock(home, root),
  ]);
  const digests = new Map(
    names.map((name) => [
      name,
      treeDigest(resolve(root, "agents/skills", name)),
    ]),
  );
  if ([...digests.values()].some((digest) => digest === undefined))
    return "could not read a complete in-house skill tree";
  const install = names.filter((name) => {
    const target = resolve(home, ".agents/skills", name);
    const state = fromThrowable((path: string) => lstatSync(path))(target);
    return (
      loaded.value.skills[name] !== digests.get(name) ||
      state.isErr() ||
      state.value.isSymbolicLink() ||
      !state.value.isDirectory() ||
      !existsSync(resolve(target, "SKILL.md"))
    );
  });
  const thirdParty = new Set(thirdPartyNames);
  const stale = [...previous].filter(
    (name) => !names.includes(name) && !thirdParty.has(name),
  );
  if (dryRun) {
    const installs = new Set(install);
    const source = resolve(root, "agents/skills");
    for (const name of names.toSorted())
      print(
        installs.has(name)
          ? `[dry-run] would copy-install Codex skill ${name}: bunx --bun --yes skills@${cliVersion} add ${source} --skill ${name} -g --agent codex --copy -y`
          : `[dry-run] would keep current Codex copy ${name}`,
      );
    for (const name of stale.toSorted())
      print(
        `[dry-run] would remove stale Codex skill ${name}: bunx --bun --yes skills@${cliVersion} remove ${name} -g --agent codex -y`,
      );
    return undefined;
  }

  if (install.length > 0) {
    const installed = await runPinnedSkillsCommand(
      cliVersion,
      [
        "add",
        resolve(root, "agents/skills"),
        ...install.toSorted().flatMap((name) => ["--skill", name]),
        "-g",
        "--agent",
        "codex",
        "--copy",
        "-y",
      ],
      home,
      root,
    );
    if (installed.timedOut || installed.exitCode !== 0)
      return `skills add for Codex ${installed.timedOut ? "timed out" : `exited ${installed.exitCode}`}`;
    const missing = install.filter((name) => {
      const target = resolve(home, ".agents/skills", name);
      const state = fromThrowable((path: string) => lstatSync(path))(target);
      return (
        state.isErr() ||
        state.value.isSymbolicLink() ||
        !state.value.isDirectory() ||
        !existsSync(resolve(target, "SKILL.md"))
      );
    });
    if (missing.length > 0)
      return `skills CLI returned success without copy-installing: ${missing.join(", ")}`;
  }

  if (stale.length > 0) {
    const removed = await runPinnedSkillsCommand(
      cliVersion,
      ["remove", ...stale.toSorted(), "-g", "--agent", "codex", "-y"],
      home,
      root,
    );
    if (removed.timedOut || removed.exitCode !== 0)
      return `skills remove for stale Codex skills ${removed.timedOut ? "timed out" : `exited ${removed.exitCode}`}`;
  }

  const nextState: InHouseState = {
    version: 1,
    skills: Object.fromEntries(
      names.map((name) => [name, digests.get(name) ?? ""]),
    ),
  };
  const writeError = writeInHouseState(home, nextState);
  return writeError === undefined
    ? undefined
    : `could not record Codex skill state: ${writeError}`;
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

function treeDigest(root: string): string | undefined {
  const exists = fromThrowable((path: string) => lstatSync(path))(root);
  if (exists.isErr() || !exists.value.isDirectory()) return undefined;
  const result = fromThrowable(() => {
    const hash = createHash("sha256");
    const visit = (directory: string, prefix: string): void => {
      const entries = readdirSync(directory, { withFileTypes: true }).toSorted(
        (left, right) => left.name.localeCompare(right.name),
      );
      for (const entry of entries) {
        const fullPath = join(directory, entry.name);
        const relPath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
        const info = lstatSync(fullPath);
        if (info.isSymbolicLink()) {
          hash.update(`link\0${relPath}\0${readlinkSync(fullPath)}\0`);
        } else if (info.isDirectory()) {
          hash.update(`dir\0${relPath}\0`);
          visit(fullPath, relPath);
        } else {
          hash.update(`file\0${relPath}\0`);
          hash.update(readFileSync(fullPath));
          hash.update("\0");
        }
      }
    };
    visit(root, "");
    return hash.digest("hex");
  })();
  return result.unwrapOr(undefined);
}

function main(): Promise<void> {
  const parsed = cli(
    {
      name: "skills-sync.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "Install the dotfiles Claude plugin and Codex skill copies, then reconcile declared third-party skills.",
      },
      flags: {
        dryRun: { type: Boolean, default: false },
        inHouseOnly: { type: Boolean, default: false },
        dotfiles: { type: String },
        home: { type: String },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );

  if (parsed._.length > 0) {
    fail(`unexpected positional argument: ${parsed._[0]}\n${USAGE}`);
    process.exitCode = 2;
    return Promise.resolve();
  }
  const home = parsed.flags.home ?? process.env.HOME ?? homedir();
  const dotfiles =
    parsed.flags.dotfiles ??
    process.env.DOTFILES ??
    resolve(import.meta.dir, "..");
  const declarationPath = resolve(dotfiles, "agents/skills.thirdparty.toml");
  const text = fromThrowable((path: string) => readFileSync(path, "utf8"))(
    declarationPath,
  );
  if (text.isErr()) {
    fail(`FATAL: ${declarationPath}: ${errorText(text.error)}`);
    process.exitCode = 1;
    return Promise.resolve();
  }
  const declaration = parseDeclaration(text.value);
  if (declaration.isErr()) {
    fail(`FATAL: ${declaration.error}`);
    process.exitCode = 1;
    return Promise.resolve();
  }

  const names = declaration.value.skills.map((entry) => entry.skill);
  const plugin = readDotfilesPlugin(dotfiles);
  if (plugin.isErr()) {
    fail(`FATAL: ${plugin.error}`);
    process.exitCode = 1;
    return Promise.resolve();
  }
  const inHouseNames = new Set(plugin.value.skillNames);
  const overlap = names.filter((name) => inHouseNames.has(name));
  if (overlap.length > 0) {
    fail(
      `FATAL: third-party names overlap in-house skills: ${overlap.join(", ")}`,
    );
    process.exitCode = 1;
    return Promise.resolve();
  }

  const links = removeRepoSkillSymlinks(home, dotfiles, parsed.flags.dryRun);
  for (const path of links.removed)
    print(`removed repo-owned skill symlink: ${path}`);
  if (parsed.flags.dryRun)
    for (const path of links.paths)
      print(`[dry-run] would remove repo-owned skill symlink: ${path}`);
  if (links.errors.length > 0) {
    for (const error of links.errors)
      fail(`FATAL: cannot clean skill symlink: ${error}`);
    process.exitCode = 1;
    return Promise.resolve();
  }

  const refusals = parsed.flags.dryRun
    ? []
    : homePathRefusals(home, dotfiles, [...names, ...plugin.value.skillNames]);
  for (const refusal of refusals) fail(refusal);
  if (refusals.length > 0) {
    process.exitCode = 3;
    return Promise.resolve();
  }

  if (parsed.flags.dryRun) {
    const plan = async (): Promise<void> => {
      const pluginError = syncClaudePlugin(
        home,
        dotfiles,
        plugin.value.marketplaceName,
        plugin.value.pluginName,
        true,
      );
      if (pluginError !== undefined) {
        fail(`FATAL: ${pluginError}`);
        process.exitCode = 1;
        return;
      }
      const codexError = await syncInHouseCodex(
        home,
        dotfiles,
        plugin.value.skillNames,
        names,
        declaration.value.cli_version,
        true,
      );
      if (codexError !== undefined) {
        fail(`FATAL: ${codexError}`);
        process.exitCode = 1;
        return;
      }

      if (parsed.flags.inHouseOnly) return;
      const bySource = Map.groupBy(
        declaration.value.skills,
        (entry) => entry.source,
      );
      if (bySource.size === 0) {
        print("[dry-run] would reconcile third-party skills: none declared");
        return;
      }
      for (const [source, entries] of bySource) {
        const requested = entries.map((entry) => entry.skill).toSorted();
        print(
          `[dry-run] would compare and reconcile third-party skills from ${source}: ${requested.join(", ")}`,
        );
      }
    };
    return plan();
  }

  const run = async (): Promise<void> => {
    const pluginError = syncClaudePlugin(
      home,
      dotfiles,
      plugin.value.marketplaceName,
      plugin.value.pluginName,
      parsed.flags.dryRun,
    );
    if (pluginError !== undefined) {
      fail(`FATAL: ${pluginError}`);
      process.exitCode = 1;
      return;
    }
    const codexError = await syncInHouseCodex(
      home,
      dotfiles,
      plugin.value.skillNames,
      names,
      declaration.value.cli_version,
      parsed.flags.dryRun,
    );
    if (codexError !== undefined) {
      fail(`FATAL: ${codexError}`);
      process.exitCode = 1;
      return;
    }

    if (parsed.flags.inHouseOnly) {
      print("in-house Claude plugin and Codex copies are in sync");
      return;
    }

    const initialLock = readInstalledLock(home);
    if (initialLock === undefined) {
      fail("FATAL: global skills lock is unreadable; refusing to sync");
      process.exitCode = 1;
      return;
    }
    const bySource = Map.groupBy(
      declaration.value.skills,
      (entry) => entry.source,
    );
    for (const [source, entries] of bySource) {
      const stageHome = mkdtempSync(join(tmpdir(), "skills-sync-home-"));
      using _stage = {
        [Symbol.dispose]: () => {
          rmSync(stageHome, { recursive: true, force: true });
        },
      };
      const requested = entries.map((entry) => entry.skill);
      const fetched = await runSkillsCli(
        declaration.value.cli_version,
        source,
        requested,
        stageHome,
      );
      if (fetched.exitCode !== 0 || fetched.timedOut) {
        fail(
          `FATAL: upstream comparison for ${source} ${fetched.timedOut ? "timed out" : `exited ${fetched.exitCode}`}`,
        );
        process.exitCode = 1;
        return;
      }

      const stale = entries.filter((entry) => {
        const upstream = treeDigest(
          resolve(stageHome, ".agents/skills", entry.skill),
        );
        return [
          resolve(home, ".agents/skills", entry.skill),
          resolve(home, ".claude/skills", entry.skill),
        ].some(
          (target) => upstream === undefined || treeDigest(target) !== upstream,
        );
      });
      if (stale.length === 0) {
        print(`up to date: ${source} (${requested.length} skill(s))`);
        continue;
      }

      const staleNames = stale.map((entry) => entry.skill);
      if (parsed.flags.dryRun) {
        print(
          `[dry-run] would run: ${skillCliArgs(declaration.value.cli_version, source, staleNames).join(" ")}`,
        );
        continue;
      }

      const before = readInstalledLock(home);
      if (before === undefined) {
        fail("FATAL: global skills lock became unreadable before install");
        process.exitCode = 1;
        return;
      }
      const namesBefore = targetSkillNames(home);
      const installed = await runSkillsCli(
        declaration.value.cli_version,
        source,
        staleNames,
        home,
      );
      const after = readInstalledLock(home);
      if (after === undefined) {
        fail(
          "FATAL: global skills lock is unreadable after install; stowaway cleanup could not be verified",
        );
        process.exitCode = 1;
        return;
      }
      const cleanup = removeNewStowaways(
        home,
        before,
        after,
        staleNames,
        namesBefore,
      );
      if (cleanup.isErr()) {
        fail(
          `FATAL: could not remove new unrequested skills: ${cleanup.error}`,
        );
        process.exitCode = 1;
        return;
      }
      for (const name of cleanup.value)
        print(`STOWAWAY: removed new unrequested global skill ${name}`);
      if (installed.exitCode !== 0 || installed.timedOut) {
        fail(
          `FATAL: skills CLI ${installed.timedOut ? "timed out" : `exited ${installed.exitCode}`}`,
        );
        process.exitCode = 1;
        return;
      }

      const finalLock = readInstalledLock(home);
      const missing = staleNames.filter(
        (name) =>
          finalLock === undefined ||
          !Object.hasOwn(finalLock.skills, name) ||
          !existsSync(resolve(home, ".agents/skills", name, "SKILL.md")) ||
          !existsSync(resolve(home, ".claude/skills", name, "SKILL.md")),
      );
      if (missing.length > 0) {
        fail(
          `FATAL: CLI returned success without installing and recording: ${missing.join(", ")}`,
        );
        process.exitCode = 1;
        return;
      }
      print(`synced: ${source} (${staleNames.join(", ")})`);
    }

    const finalLock = readInstalledLock(home);
    if (finalLock === undefined) {
      fail("FATAL: global skills lock is unreadable after sync");
      process.exitCode = 1;
      return;
    }
    const declared = new Set(names);
    const extras = Object.keys(finalLock.skills)
      .filter((name) => !declared.has(name) && !inHouseNames.has(name))
      .toSorted();
    for (const name of extras)
      print(`UNDECLARED: installed third-party skill ${name} (left untouched)`);
    if (extras.length === 0)
      print("declared third-party skill set matches the global lock");
  };
  return run();
}

if (import.meta.main) {
  const result = await Promise.try(main).then(
    () => ({ ok: true as const }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  if (!result.ok) {
    fail(`FATAL: ${errorText(result.error)}`);
    process.exit(1);
  }
  process.exit(process.exitCode ?? 0);
}
