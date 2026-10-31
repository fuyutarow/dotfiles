// Copy in-house skills to Claude Code and Codex, retire the local plugin, and reconcile declared vendors.
// Upstream and Claude copies are staged in throwaway HOMEs; only verified results reach the live HOME.

import {
  existsSync,
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import {
  access,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  writeFile,
  rename,
  rm,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { cli } from "cleye";
import { consola } from "consola";
import { err, fromAsyncThrowable, fromThrowable, ok } from "neverthrow";
import { jsonOf, z } from "../agents/hooks/zod.ts";
import {
  homePathRefusals,
  inHouseLayoutRefusals,
  isOwnInHouseLink,
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
import { skillFiles } from "./skills-declaration.ts";
import {
  prepareSkillCopy,
  sourceDigester,
  skillEntries,
  unresolvedSkillImports,
} from "./skills-copy.ts";

const USAGE =
  "Usage: bun scripts/skills-sync.ts [--dry-run] [--in-house-only] [--dotfiles <path>] [--home <path>]\n";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function print(line: string): void {
  consola.info(line);
}

function fail(line: string): void {
  consola.error(line);
}

const InHouseStateSchema = z.strictObject({
  version: z.literal(1),
  skills: z.record(z.string(), z.string()),
  sources: z
    .record(
      z.string(),
      z.object({
        digest: z.string(),
        inputs: z.array(z.string()),
      }),
    )
    .optional(),
});

type PreparedSkills = string | { root: string; reused: Map<string, string> };
function preparedSkill(prepared: PreparedSkills, name: string): string {
  if (typeof prepared === "string") return resolve(prepared, name);
  return prepared.reused.get(name) ?? resolve(prepared.root, name);
}

type InHouseState = z.infer<typeof InHouseStateSchema>;

const InstalledPluginsSchema = z.looseObject({
  plugins: z.record(z.string(), z.array(z.looseObject({ scope: z.string() }))),
});
const SkillSourceSchema = z.object({ source: z.string() });

type CommandResult = { code: number; out: string; err: string };

async function runClaude(
  args: string[],
  home: string,
  cwd: string,
): Promise<CommandResult> {
  const result = fromThrowable(() =>
    Bun.spawn(["claude", ...args], {
      cwd,
      env: { ...process.env, HOME: home },
      stdout: "pipe",
      stderr: "pipe",
      signal: AbortSignal.timeout(30_000),
    }),
  )();
  if (result.isErr())
    return {
      code: 127,
      out: "",
      err: errorText(result.error),
    };
  const [code, out, stderr] = await Promise.all([
    result.value.exited,
    new Response(result.value.stdout).text(),
    new Response(result.value.stderr).text(),
  ]);
  return { code, out, err: stderr };
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

async function loadInHouseState(home: string) {
  const path = resolve(home, ".agents/.dotfiles-skills.json");
  const raw = await readFile(path, "utf8").then(
    (value) => ok(value),
    (error: unknown) => err(error),
  );
  if (raw.isErr()) {
    const code = z.object({ code: z.literal("ENOENT") }).safeParse(raw.error);
    if (!code.success)
      return err(`cannot read ${path}: ${errorText(raw.error)}`);
    const empty: InHouseState = { version: 1, skills: {} };
    return ok(empty);
  }
  const checked = jsonOf(InHouseStateSchema).safeParse(raw.value);
  return checked.success
    ? ok(checked.data)
    : err(`invalid ${path}: ${checked.error.message}`);
}

async function writeInHouseState(
  home: string,
  state: InHouseState,
): Promise<string | undefined> {
  const directory = resolve(home, ".agents");
  const path = resolve(directory, ".dotfiles-skills.json");
  const temporary = `${path}.${randomUUID()}.tmp`;
  const written = await fromAsyncThrowable(async () => {
    await mkdir(directory, { recursive: true });
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {
      flag: "wx",
    });
    await rename(temporary, path);
  })();
  if (written.isOk()) return undefined;
  await rm(temporary, { force: true });
  return errorText(written.error);
}

function isWithin(root: string, path: string): boolean {
  const rel = relative(root, path);
  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  );
}

async function codexInHouseNamesFromLock(
  home: string,
  dotfiles: string,
): Promise<string[]> {
  const lock = await readInstalledLock(home);
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

async function uninstallDotfilesPlugin(
  home: string,
  root: string,
  dryRun: boolean,
): Promise<string | undefined> {
  if (dryRun) {
    print(
      "[dry-run] would uninstall dotfiles@dotfiles from every installed scope",
    );
    return undefined;
  }
  const installedPath = resolve(home, ".claude/plugins/installed_plugins.json");
  const present = await access(installedPath).then(
    () => true,
    () => false,
  );
  if (!present) return undefined;
  const installed = jsonOf(InstalledPluginsSchema).safeParse(
    await readFile(installedPath, "utf8"),
  );
  if (!installed.success)
    return `cannot inspect ${installedPath}: ${installed.error.message}`;
  const scopes = [
    ...new Set(
      (installed.data.plugins["dotfiles@dotfiles"] ?? []).map(
        (plugin) => plugin.scope,
      ),
    ),
  ];
  for (const scope of scopes) {
    const removed = jsonLastLine(
      await runClaude(
        [
          "plugin",
          "uninstall",
          "dotfiles@dotfiles",
          "--scope",
          scope,
          "--json",
        ],
        home,
        root,
      ),
      z.object({ outcome: z.string(), message: z.string() }),
      "claude plugin uninstall",
    );
    if (removed.isErr()) return removed.error;
    if (removed.value.outcome !== "ok")
      return `claude plugin uninstall failed: ${removed.value.message}`;
  }
  return undefined;
}

async function syncInHouseClaude(
  home: string,
  root: string,
  names: readonly string[],
  cliVersion: string,
  dryRun: boolean,
  prepared: PreparedSkills = resolve(root, "agents/skills"),
): Promise<string | undefined> {
  const source = resolve(root, "agents/skills");
  const install: string[] = [];
  for (const name of names) {
    const target = resolve(home, ".claude/skills", name);
    if (
      (await treeDigest(target)) !==
      (await treeDigest(preparedSkill(prepared, name)))
    )
      install.push(name);
  }
  if (dryRun) {
    for (const name of names.toSorted())
      print(
        install.includes(name)
          ? `[dry-run] would copy-install Claude skill ${name}: bunx --bun --yes skills@${cliVersion} add ${source} --skill ${name} -g -a claude-code --copy -y`
          : `[dry-run] would keep current Claude copy ${name}`,
      );
    return undefined;
  }
  if (install.length === 0) return undefined;

  const stageHome = mkdtempSync(join(tmpdir(), "skills-sync-claude-home-"));
  using _stage = {
    [Symbol.dispose]: () => {
      rmSync(stageHome, { recursive: true, force: true });
    },
  };
  mkdirSync(join(stageHome, ".agents"), { recursive: true });
  mkdirSync(join(stageHome, ".claude/skills"), { recursive: true });
  const result = await runPinnedSkillsCommand(
    cliVersion,
    [
      "add",
      source,
      ...install.toSorted().flatMap((name) => ["--skill", name]),
      "-g",
      "-a",
      "claude-code",
      "--copy",
      "-y",
    ],
    stageHome,
    root,
  );
  if (result.timedOut || result.exitCode !== 0)
    return `skills add for Claude ${result.timedOut ? "timed out" : `exited ${result.exitCode}`}`;

  const invalid = install.filter((name) => {
    const target = resolve(stageHome, ".claude/skills", name);
    const info = fromThrowable((path: string) => lstatSync(path))(target);
    return (
      info.isErr() ||
      info.value.isSymbolicLink() ||
      !info.value.isDirectory() ||
      readFileSync(resolve(target, "SKILL.md"), "utf8") !==
        readFileSync(resolve(source, name, "SKILL.md"), "utf8")
    );
  });
  if (invalid.length > 0)
    return `skills CLI did not stage matching Claude copies: ${invalid.join(", ")}`;

  for (const name of install)
    await cp(
      preparedSkill(prepared, name),
      resolve(stageHome, ".claude/skills", name),
      { recursive: true },
    );

  const skillsRoot = resolve(home, ".claude/skills");
  mkdirSync(skillsRoot, { recursive: true });
  const transaction = mkdtempSync(join(skillsRoot, ".dotfiles-skills-sync-"));
  using _transaction = {
    [Symbol.dispose]: () => {
      rmSync(transaction, { recursive: true, force: true });
    },
  };
  const replaced: { target: string; backup: string }[] = [];
  const committed = fromThrowable(() => {
    for (const name of install) {
      const staged = resolve(transaction, name);
      cpSync(resolve(stageHome, ".claude/skills", name), staged, {
        recursive: true,
      });
    }
    for (const name of install) {
      const target = resolve(skillsRoot, name);
      const staged = resolve(transaction, name);
      const backup = resolve(transaction, `${name}.previous`);
      const targetInfo = lstatSync(target, { throwIfNoEntry: false });
      if (targetInfo !== undefined) {
        renameSync(target, backup);
        replaced.push({ target, backup });
      }
      renameSync(staged, target);
    }
  })();
  if (committed.isErr()) {
    const rollback = fromThrowable(() => {
      for (const { target, backup } of replaced.toReversed()) {
        rmSync(target, { recursive: true, force: true });
        if (lstatSync(backup, { throwIfNoEntry: false }) !== undefined)
          renameSync(backup, target);
      }
    })();
    if (rollback.isErr())
      return `could not install staged Claude copies: ${errorText(committed.error)}; rollback failed: ${errorText(rollback.error)}`;
    return `could not install staged Claude copies: ${errorText(committed.error)}`;
  }

  const mismatched = install.filter((name) => {
    const target = resolve(skillsRoot, name);
    const info = fromThrowable((path: string) => lstatSync(path))(target);
    return (
      info.isErr() ||
      info.value.isSymbolicLink() ||
      !info.value.isDirectory() ||
      readFileSync(resolve(target, "SKILL.md"), "utf8") !==
        readFileSync(resolve(source, name, "SKILL.md"), "utf8")
    );
  });
  return mismatched.length > 0
    ? `Claude copies do not match the repository: ${mismatched.join(", ")}`
    : undefined;
}

async function syncInHouseCodex(
  home: string,
  root: string,
  names: readonly string[],
  thirdPartyNames: readonly string[],
  cliVersion: string,
  dryRun: boolean,
  deferRemoval = false,
  prepared: PreparedSkills = resolve(root, "agents/skills"),
): Promise<string | undefined> {
  const loaded = await loadInHouseState(home);
  if (loaded.isErr()) return loaded.error;
  const previous = new Set([
    ...Object.keys(loaded.value.skills),
    ...(await codexInHouseNamesFromLock(home, root)),
  ]);
  const digests = new Map<string, string | undefined>();
  for (const name of names)
    digests.set(name, await treeDigest(preparedSkill(prepared, name)));
  if ([...digests.values()].some((digest) => digest === undefined))
    return "could not read a complete in-house skill tree";
  const install: string[] = [];
  for (const name of names) {
    const target = resolve(home, ".agents/skills", name);
    const state = fromThrowable((path: string) => lstatSync(path))(target);
    if (
      loaded.value.skills[name] !== digests.get(name) ||
      (await treeDigest(target)) !== digests.get(name) ||
      state.isErr() ||
      state.value.isSymbolicLink() ||
      !state.value.isDirectory() ||
      !existsSync(resolve(target, "SKILL.md"))
    )
      install.push(name);
  }
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
    const skillsRoot = resolve(home, ".agents/skills");
    await mkdir(skillsRoot, { recursive: true });
    const transaction = await mkdtemp(
      join(skillsRoot, ".dotfiles-skills-sync-"),
    );
    const links: { target: string; backup: string }[] = [];
    let succeeded = false;
    await using _transaction = {
      [Symbol.asyncDispose]: async () => {
        if (!succeeded) {
          for (const { target, backup } of links.toReversed()) {
            await rm(target, { recursive: true, force: true });
            await rename(backup, target);
          }
        }
        await rm(transaction, { recursive: true, force: true });
      },
    };
    for (const name of (
      await Promise.all(
        install.map(async (candidate) =>
          (await isOwnInHouseLink(
            resolve(skillsRoot, candidate),
            root,
            candidate,
          ))
            ? candidate
            : undefined,
        ),
      )
    ).filter((candidate) => candidate !== undefined)) {
      const target = resolve(skillsRoot, name);
      const backup = resolve(transaction, name);
      await rename(target, backup);
      links.push({ target, backup });
    }
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
        !existsSync(resolve(target, "SKILL.md")) ||
        readFileSync(resolve(target, "SKILL.md"), "utf8") !==
          readFileSync(resolve(root, "agents/skills", name, "SKILL.md"), "utf8")
      );
    });
    if (missing.length > 0)
      return `skills CLI returned success without copy-installing: ${missing.join(", ")}`;
    for (const name of install)
      await cp(
        preparedSkill(prepared, name),
        resolve(home, ".agents/skills", name),
        {
          recursive: true,
        },
      );
    succeeded = true;
  }

  if (stale.length > 0 && !deferRemoval) {
    const removed = await runPinnedSkillsCommand(
      cliVersion,
      ["remove", ...stale.toSorted(), "-g", "--agent", "codex", "-y"],
      home,
      root,
    );
    if (removed.timedOut || removed.exitCode !== 0)
      return `skills remove for stale Codex skills ${removed.timedOut ? "timed out" : `exited ${removed.exitCode}`}`;
  }

  if (deferRemoval) return undefined;
  const writeError = await recordInHouseState(home, root, names, prepared);
  return writeError;
}

async function recordInHouseState(
  home: string,
  root: string,
  names: readonly string[],
  prepared: PreparedSkills = resolve(root, "agents/skills"),
  sources?: InHouseState["sources"],
): Promise<string | undefined> {
  const skills: Record<string, string> = {};
  for (const name of names)
    skills[name] = (await treeDigest(preparedSkill(prepared, name))) ?? "";
  const writeError = await writeInHouseState(home, {
    version: 1,
    skills,
    sources,
  });
  return writeError === undefined
    ? undefined
    : `could not record in-house skill state: ${writeError}`;
}

async function pathPresent(path: string): Promise<boolean> {
  return Promise.try(() => lstat(path)).then(
    () => true,
    (error: unknown) => {
      const parsed = z.object({ code: z.string() }).safeParse(error);
      if (parsed.success && parsed.data.code === "ENOENT") return false;
      fail(`FATAL: cannot inspect ${path}: ${errorText(error)}`);
      return process.exit(1);
    },
  );
}

async function previousInHouseNames(
  home: string,
  dotfiles: string,
): Promise<Set<string>> {
  const state = (await loadInHouseState(home)).unwrapOr({
    version: 1,
    skills: {},
  });
  const archive = resolve(dotfiles, "archives/skills/README.md");
  const text = (await pathPresent(archive))
    ? await readFile(archive, "utf8")
    : "";
  // Only table entries identify retired skills; prose may mention active successors.
  const archived = [
    ...text.matchAll(
      /^\|\s*(?:\[`([a-z0-9][a-z0-9-]{0,63})`\]\([^)]*\)|`([a-z0-9][a-z0-9-]{0,63})`)\s*\|/gmu,
    ),
  ].map((match) => match[1] ?? match[2] ?? "");
  const present = await Promise.all(
    archived.map(async (name) => ({
      name,
      paths: await Promise.all(
        [".agents/skills", ".claude/skills"].map((base) =>
          pathPresent(resolve(home, base, name)),
        ),
      ),
    })),
  );
  return new Set([
    ...Object.keys(state.skills),
    ...(await codexInHouseNamesFromLock(home, dotfiles)),
    ...present
      .filter((entry) => entry.paths.some(Boolean))
      .map((entry) => entry.name),
  ]);
}

async function retireCopies(
  home: string,
  base: string,
  names: readonly string[],
): Promise<string | undefined> {
  for (const name of names) {
    const target = resolve(home, base, name);
    if (!(await pathPresent(target))) continue;
    const result = Bun.spawn(["rip", target], {
      stdout: "ignore",
      stderr: "pipe",
      timeout: 30_000,
    });
    const [exitCode, stderr] = await Promise.all([
      result.exited,
      new Response(result.stderr).text(),
    ]);
    if (exitCode !== 0 || (await pathPresent(target)))
      return `could not retire ${target}: ${stderr.trim()}`;
    print(`removed stale ${base} skill ${name}`);
  }
  return undefined;
}

async function removeStaleCodex(
  home: string,
  root: string,
  stale: readonly string[],
  cliVersion: string,
): Promise<string | undefined> {
  if (stale.length === 0) return undefined;
  const present = (
    await Promise.all(
      stale.map(async (name) => ({
        name,
        present: await pathPresent(resolve(home, ".agents/skills", name)),
      })),
    )
  )
    .filter((entry) => entry.present)
    .map((entry) => entry.name);
  const removed = await runPinnedSkillsCommand(
    cliVersion,
    ["remove", ...stale.toSorted(), "-g", "--agent", "codex", "-y"],
    home,
    root,
  );
  const remaining = (
    await Promise.all(
      stale.map(async (name) => ({
        name,
        present: await pathPresent(resolve(home, ".agents/skills", name)),
      })),
    )
  )
    .filter((entry) => entry.present)
    .map((entry) => entry.name);
  for (const name of present.filter(
    (candidate) => !remaining.includes(candidate),
  ))
    print(`removed stale .agents/skills skill ${name}`);
  if (remaining.length > 0)
    return retireCopies(home, ".agents/skills", remaining);
  if (!removed.timedOut && removed.exitCode === 0) return undefined;
  const reason = removed.timedOut ? "timed out" : `exited ${removed.exitCode}`;
  return `skills remove for stale Codex skills ${reason}`;
}

async function removeStaleClaude(
  home: string,
  stale: readonly string[],
): Promise<string | undefined> {
  return retireCopies(home, ".claude/skills", stale);
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

async function treeDigest(root: string): Promise<string | undefined> {
  const exists = await fromAsyncThrowable(lstat)(root);
  if (exists.isErr() || !exists.value.isDirectory()) return undefined;
  const result = await fromAsyncThrowable(async () => {
    const hash = createHash("sha256");
    const visit = async (directory: string, prefix: string): Promise<void> => {
      const entries = (
        await readdir(directory, { withFileTypes: true })
      ).toSorted((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        const fullPath = join(directory, entry.name);
        const relPath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
        const info = await lstat(fullPath);
        if (info.isSymbolicLink()) {
          hash.update(`link\0${relPath}\0${await readlink(fullPath)}\0`);
        } else if (info.isDirectory()) {
          hash.update(`dir\0${relPath}\0`);
          await visit(fullPath, relPath);
        } else {
          hash.update(`file\0${relPath}\0`);
          hash.update(await readFile(fullPath));
          hash.update("\0");
        }
      }
    };
    await visit(root, "");
    return hash.digest("hex");
  })();
  return result.unwrapOr(undefined);
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "skills-sync.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "Copy in-house skills to Claude Code and Codex, uninstall the retired dotfiles plugin, and reconcile declared third-party skills.",
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
    return;
  }
  const home = parsed.flags.home ?? process.env["HOME"] ?? homedir();
  const dotfiles =
    parsed.flags.dotfiles ??
    process.env["DOTFILES"] ??
    resolve(import.meta.dir, "..");
  const declarationPath = resolve(dotfiles, "agents/skills.thirdparty.toml");
  const text = fromThrowable((path: string) => readFileSync(path, "utf8"))(
    declarationPath,
  );
  if (text.isErr()) {
    fail(`FATAL: ${declarationPath}: ${errorText(text.error)}`);
    process.exitCode = 1;
    return;
  }
  const declaration = parseDeclaration(text.value);
  if (declaration.isErr()) {
    fail(`FATAL: ${declaration.error}`);
    process.exitCode = 1;
    return;
  }

  const layoutRefusals = await inHouseLayoutRefusals(
    resolve(dotfiles, "agents/skills"),
  );
  if (layoutRefusals.length > 0) {
    for (const refusal of layoutRefusals) fail(`FATAL: ${refusal}`);
    process.exitCode = 1;
    return;
  }

  const names = declaration.value.skills.map((entry) => entry.skill);
  const inHouseNames = (
    await skillFiles(resolve(dotfiles, "agents/skills"))
  ).map((skill) => basename(resolve(skill.path, "..")));
  const inHouseSet = new Set(inHouseNames);
  const overlap = names.filter((name) => inHouseSet.has(name));
  if (overlap.length > 0) {
    fail(
      `FATAL: third-party names overlap in-house skills: ${overlap.join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }

  const refusals = parsed.flags.dryRun
    ? []
    : await homePathRefusals(
        home,
        dotfiles,
        [...names, ...inHouseNames],
        inHouseNames,
      );
  for (const refusal of refusals) fail(refusal);
  if (refusals.length > 0) {
    process.exitCode = 3;
    return;
  }

  if (parsed.flags.dryRun) {
    const plan = async (): Promise<void> => {
      const pluginError = await uninstallDotfilesPlugin(home, dotfiles, true);
      if (pluginError !== undefined) {
        fail(`FATAL: ${pluginError}`);
        process.exitCode = 1;
        return;
      }
      const claudeError = await syncInHouseClaude(
        home,
        dotfiles,
        inHouseNames,
        declaration.value.cli_version,
        true,
      );
      if (claudeError !== undefined) {
        fail(`FATAL: ${claudeError}`);
        process.exitCode = 1;
        return;
      }
      const codexError = await syncInHouseCodex(
        home,
        dotfiles,
        inHouseNames,
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
    const preparedRoot = await mkdtemp(join(tmpdir(), "skills-sync-copies-"));
    await using _prepared = {
      [Symbol.asyncDispose]: async () => {
        await rm(preparedRoot, { recursive: true, force: true });
      },
    };
    const loaded = await loadInHouseState(home);
    if (loaded.isErr()) {
      fail(`FATAL: ${loaded.error}`);
      process.exitCode = 1;
      return;
    }
    const prepared = { root: preparedRoot, reused: new Map<string, string>() };
    const sources: NonNullable<InHouseState["sources"]> = {};
    const digestSource = sourceDigester();
    // Resolution/build configuration also invalidates previously discovered input lists.
    const configuration = [resolve(import.meta.dir, "skills-copy.ts")];
    for (const file of ["package.json", "bun.lock", "tsconfig.json"]) {
      const path = resolve(dotfiles, file);
      if (await Bun.file(path).exists()) configuration.push(path);
    }
    let bundled = 0;
    for (const name of inHouseNames) {
      const source = resolve(dotfiles, "agents/skills", name);
      const previous = loaded.value.sources?.[name];
      const inputs = [...(previous?.inputs ?? []), ...configuration];
      const digest = await digestSource(source, inputs);
      const deployed = loaded.value.skills[name];
      if (
        previous !== undefined &&
        digest !== undefined &&
        previous.digest === digest &&
        deployed !== undefined &&
        (await treeDigest(resolve(home, ".agents/skills", name))) ===
          deployed &&
        (await treeDigest(resolve(home, ".claude/skills", name))) === deployed
      ) {
        prepared.reused.set(name, resolve(home, ".agents/skills", name));
        sources[name] = previous;
        continue;
      }
      const target = resolve(preparedRoot, name);
      const built = await prepareSkillCopy(
        resolve(dotfiles, "agents/skills", name),
        target,
      );
      if (built.isErr()) {
        fail(`FATAL: ${built.error}`);
        process.exitCode = 1;
        return;
      }
      const entries = await skillEntries(source);
      bundled += entries.length;
      print(`prepared skill ${name} (${entries.length} entries)`);
      const sourceInputs = [...built.value.inputs, ...configuration];
      const sourceDigest = await digestSource(source, sourceInputs);
      if (sourceDigest === undefined) {
        fail(`FATAL: cannot digest source inputs for ${name}`);
        process.exitCode = 1;
        return;
      }
      sources[name] = { digest: sourceDigest, inputs: built.value.inputs };
      const failures = await unresolvedSkillImports(target);
      if (failures.length > 0) {
        fail(`FATAL: ${failures.join("\n")}`);
        process.exitCode = 1;
        return;
      }
    }
    print(`bundled entries: ${bundled}`);
    const stale = [...(await previousInHouseNames(home, dotfiles))].filter(
      (name) => !inHouseSet.has(name) && !names.includes(name),
    );
    const claudeError = await syncInHouseClaude(
      home,
      dotfiles,
      inHouseNames,
      declaration.value.cli_version,
      false,
      prepared,
    );
    if (claudeError !== undefined) {
      fail(`FATAL: ${claudeError}`);
      process.exitCode = 1;
      return;
    }
    const codexError = await syncInHouseCodex(
      home,
      dotfiles,
      inHouseNames,
      names,
      declaration.value.cli_version,
      false,
      true,
      prepared,
    );
    if (codexError !== undefined) {
      fail(`FATAL: ${codexError}`);
      process.exitCode = 1;
      return;
    }

    const pluginError = await uninstallDotfilesPlugin(home, dotfiles, false);
    if (pluginError !== undefined) {
      fail(`FATAL: ${pluginError}`);
      process.exitCode = 1;
      return;
    }
    if (parsed.flags.inHouseOnly) {
      const cleanupError = await removeStaleCodex(
        home,
        dotfiles,
        stale,
        declaration.value.cli_version,
      );
      if (cleanupError !== undefined) {
        fail(`FATAL: ${cleanupError}`);
        process.exitCode = 1;
        return;
      }
      const claudeCleanupError = await removeStaleClaude(home, stale);
      if (claudeCleanupError !== undefined) {
        fail(`FATAL: ${claudeCleanupError}`);
        process.exitCode = 1;
        return;
      }
      const stateError = await recordInHouseState(
        home,
        dotfiles,
        inHouseNames,
        prepared,
        sources,
      );
      if (stateError !== undefined) {
        fail(`FATAL: ${stateError}`);
        process.exitCode = 1;
        return;
      }
      print(
        "in-house Claude and Codex copies are in sync; dotfiles plugin is uninstalled",
      );
      return;
    }

    const initialLock = await readInstalledLock(home);
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
      const stageHome = await mkdtemp(join(tmpdir(), "skills-sync-home-"));
      await using _stage = {
        [Symbol.asyncDispose]: async () => {
          await rm(stageHome, { recursive: true, force: true });
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

      const outOfDate: typeof entries = [];
      for (const entry of entries) {
        const upstream = await treeDigest(
          resolve(stageHome, ".agents/skills", entry.skill),
        );
        outOfDate.push(
          ...(upstream === undefined ||
          (await treeDigest(resolve(home, ".agents/skills", entry.skill))) !==
            upstream ||
          (await treeDigest(resolve(home, ".claude/skills", entry.skill))) !==
            upstream
            ? [entry]
            : []),
        );
      }
      if (outOfDate.length === 0) {
        print(`up to date: ${source} (${requested.length} skill(s))`);
        continue;
      }

      const staleNames = outOfDate.map((entry) => entry.skill);
      if (parsed.flags.dryRun) {
        print(
          `[dry-run] would run: ${skillCliArgs(declaration.value.cli_version, source, staleNames).join(" ")}`,
        );
        continue;
      }

      const before = await readInstalledLock(home);
      if (before === undefined) {
        fail("FATAL: global skills lock became unreadable before install");
        process.exitCode = 1;
        return;
      }
      const namesBefore = await targetSkillNames(home);
      const installed = await runSkillsCli(
        declaration.value.cli_version,
        source,
        staleNames,
        home,
      );
      const after = await readInstalledLock(home);
      if (after === undefined) {
        fail(
          "FATAL: global skills lock is unreadable after install; stowaway cleanup could not be verified",
        );
        process.exitCode = 1;
        return;
      }
      const cleanup = await removeNewStowaways(
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

      const finalLock = await readInstalledLock(home);
      const missing: string[] = [];
      for (const name of staleNames) {
        missing.push(
          ...(finalLock === undefined ||
          !Object.hasOwn(finalLock.skills, name) ||
          (
            await fromAsyncThrowable(access)(
              resolve(home, ".agents/skills", name, "SKILL.md"),
            )
          ).isErr() ||
          (
            await fromAsyncThrowable(access)(
              resolve(home, ".claude/skills", name, "SKILL.md"),
            )
          ).isErr()
            ? [name]
            : []),
        );
      }
      if (missing.length > 0) {
        fail(
          `FATAL: CLI returned success without installing and recording: ${missing.join(", ")}`,
        );
        process.exitCode = 1;
        return;
      }
      print(`synced: ${source} (${staleNames.join(", ")})`);
    }

    const cleanupError = await removeStaleCodex(
      home,
      dotfiles,
      stale,
      declaration.value.cli_version,
    );
    if (cleanupError !== undefined) {
      fail(`FATAL: ${cleanupError}`);
      process.exitCode = 1;
      return;
    }
    const claudeCleanupError = await removeStaleClaude(home, stale);
    if (claudeCleanupError !== undefined) {
      fail(`FATAL: ${claudeCleanupError}`);
      process.exitCode = 1;
      return;
    }
    const stateError = await recordInHouseState(
      home,
      dotfiles,
      inHouseNames,
      prepared,
      sources,
    );
    if (stateError !== undefined) {
      fail(`FATAL: ${stateError}`);
      process.exitCode = 1;
      return;
    }

    const finalLock = await readInstalledLock(home);
    if (finalLock === undefined) {
      fail("FATAL: global skills lock is unreadable after sync");
      process.exitCode = 1;
      return;
    }
    const declared = new Set(names);
    const extras = Object.keys(finalLock.skills)
      .filter((name) => !declared.has(name) && !inHouseSet.has(name))
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
