// Reconcile the installed third-party skill set with agents/skills.thirdparty.toml.
// Fresh upstream copies land in a throwaway HOME; only missing or changed global copies are installed.

import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { cli } from "cleye";
import { fromThrowable } from "neverthrow";
import {
  homePathRefusals,
  parseDeclaration,
  skillCliArgs,
} from "./skills-declaration.ts";
import {
  readInstalledLock,
  removeNewStowaways,
  runSkillsCli,
  targetSkillNames,
} from "./skills-install.ts";

const USAGE =
  "Usage: bun scripts/skills-sync.ts [--dry-run] [--dotfiles <path>] [--home <path>]\n";

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
          "Install missing or out-of-date third-party skills from agents/skills.thirdparty.toml.",
      },
      flags: {
        dryRun: { type: Boolean, default: false },
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
  const refusals = homePathRefusals(home, dotfiles, names);
  if (refusals.length > 0) {
    for (const refusal of refusals) fail(refusal);
    process.exitCode = 3;
    return Promise.resolve();
  }

  const initialLock = readInstalledLock(home);
  if (initialLock === undefined) {
    fail("FATAL: global skills lock is unreadable; refusing to sync");
    process.exitCode = 1;
    return Promise.resolve();
  }

  const bySource = Map.groupBy(
    declaration.value.skills,
    (entry) => entry.source,
  );
  const run = async (): Promise<void> => {
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
      .filter((name) => !declared.has(name))
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
    fail(
      `FATAL: ${result.error instanceof Error ? result.error.message : String(result.error)}`,
    );
    process.exit(1);
  }
  process.exit(process.exitCode ?? 0);
}
