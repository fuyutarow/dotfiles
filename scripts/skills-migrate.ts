// Detach the Codex skills root and declared vendor links only. Individual in-house links remain
// live so edits in the repo are still visible to the tools.

import {
  cpSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { cli } from "cleye";
import { fromThrowable } from "neverthrow";
import {
  readDeclaration,
  resolvesIntoRepository,
} from "./skills-declaration.ts";

const USAGE =
  "Usage: bun scripts/skills-migrate.ts [--dry-run] [--dotfiles <path>] [--home <path>]\n";

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

function migrateLink(path: string, dotfiles: string, dryRun: boolean): boolean {
  const state = fromThrowable((value: string) => lstatSync(value))(path);
  if (state.isErr() || !state.value.isSymbolicLink()) return false;
  if (!resolvesIntoRepository(path, dotfiles)) {
    print(`left unrelated link: ${path}`);
    return false;
  }
  const source = fromThrowable((value: string) => realpathSync(value))(path);
  if (source.isErr()) {
    fail(`cannot migrate ${path}: ${errorText(source.error)}`);
    process.exitCode = 1;
    return false;
  }
  const info = fromThrowable((value: string) => statSync(value))(source.value);
  if (info.isErr() || (!info.value.isDirectory() && !info.value.isFile())) {
    fail(
      `cannot migrate ${path}: link target is not a regular file or directory`,
    );
    process.exitCode = 1;
    return false;
  }
  if (dryRun) {
    print(`[dry-run] would copy ${source.value} into real path ${path}`);
    return true;
  }

  const temp = fromThrowable(() =>
    mkdtempSync(join(dirname(path), ".skills-migrate-")),
  )();
  if (temp.isErr()) {
    fail(`cannot migrate ${path}: ${errorText(temp.error)}`);
    process.exitCode = 1;
    return false;
  }
  const copy = join(temp.value, "copy");
  const backup = join(temp.value, "link");
  const copied = fromThrowable(() => {
    cpSync(source.value, copy, {
      recursive: info.value.isDirectory(),
      dereference: true,
      force: false,
      errorOnExist: true,
    });
  })();
  if (copied.isErr()) {
    rmSync(temp.value, { recursive: true, force: true });
    fail(`cannot migrate ${path}: copy failed: ${errorText(copied.error)}`);
    process.exitCode = 1;
    return false;
  }

  const movedLink = fromThrowable(() => {
    renameSync(path, backup);
  })();
  if (movedLink.isErr()) {
    rmSync(temp.value, { recursive: true, force: true });
    fail(
      `cannot migrate ${path}: could not stage old link: ${errorText(movedLink.error)}`,
    );
    process.exitCode = 1;
    return false;
  }
  const installed = fromThrowable(() => {
    renameSync(copy, path);
  })();
  if (installed.isErr()) {
    const restored = fromThrowable(() => {
      renameSync(backup, path);
    })();
    rmSync(temp.value, { recursive: true, force: true });
    fail(
      `cannot migrate ${path}: could not install copy: ${errorText(installed.error)}` +
        (restored.isErr()
          ? `; restoring old link failed: ${errorText(restored.error)}`
          : ""),
    );
    process.exitCode = 1;
    return false;
  }
  unlinkSync(backup);
  rmSync(temp.value, { recursive: true, force: true });
  print(`migrated: ${path} -> real copy of ${source.value}`);
  return true;
}

function migrateThirdPartyLinks(
  root: string,
  dotfiles: string,
  names: readonly string[],
  dryRun: boolean,
): number {
  let changed = 0;
  for (const name of names.toSorted())
    if (migrateLink(join(root, name), dotfiles, dryRun)) changed += 1;

  const entries = fromThrowable((path: string) => readdirSync(path))(root);
  if (entries.isErr()) return changed;
  const thirdParty = new Set(names);
  for (const name of entries.value.toSorted()) {
    if (thirdParty.has(name)) continue;
    const path = join(root, name);
    if (
      fromThrowable((value: string) => lstatSync(value))(path)
        .map((stat) => stat.isSymbolicLink())
        .unwrapOr(false) &&
      resolvesIntoRepository(path, dotfiles)
    )
      print(`left in-house link: ${path}`);
  }
  return changed;
}

function main(): void {
  const parsed = cli(
    {
      name: "skills-migrate.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "Detach the Codex skills root and declared third-party links from repository paths.",
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
    return;
  }
  const home = parsed.flags.home ?? process.env["HOME"] ?? homedir();
  const dotfiles =
    parsed.flags.dotfiles ??
    process.env["DOTFILES"] ??
    resolve(import.meta.dir, "..");
  const declaration = readDeclaration(dotfiles);
  if (declaration.isErr()) {
    fail(`cannot migrate skills: ${declaration.error}`);
    process.exitCode = 1;
    return;
  }
  const names = declaration.value.skills.map((entry) => entry.skill);
  const agentsRoot = resolve(home, ".agents/skills");
  const migratedAgentsRoot = migrateLink(
    agentsRoot,
    dotfiles,
    parsed.flags.dryRun,
  )
    ? 1
    : 0;
  const thirdPartyRoots = [agentsRoot, resolve(home, ".claude/skills")];
  const migratedThirdParty = thirdPartyRoots.reduce(
    (sum, root) =>
      sum + migrateThirdPartyLinks(root, dotfiles, names, parsed.flags.dryRun),
    0,
  );
  const total = migratedAgentsRoot + migratedThirdParty;
  if (total === 0 && process.exitCode !== 1)
    print("already tool-owned: no skill links resolve into a repository");
  print(
    `${parsed.flags.dryRun ? "would migrate" : "migrated"}: ${total} path(s)`,
  );
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
