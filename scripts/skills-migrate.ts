// Detach the Codex skills root and declared vendor links only. Individual in-house links remain
// live so edits in the repo are still visible to the tools.

import {
  cp,
  lstat,
  mkdtemp,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
} from "node:fs/promises";
import consola from "consola";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { cli } from "cleye";
import { fromAsyncThrowable } from "neverthrow";
import {
  readDeclaration,
  resolvesIntoRepository,
} from "./skills-declaration.ts";

const USAGE =
  "Usage: bun scripts/skills-migrate.ts [--dry-run] [--dotfiles <path>] [--home <path>]\n";

consola.options.reporters = [
  {
    log: ({ args }) => {
      process.stdout.write(`${args.join(" ")}\n`);
    },
  },
];

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const print = (line: string): void => {
  consola.info(line);
  process.stdout.write(`${line}\n`);
};

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

async function migrateLink(
  path: string,
  dotfiles: string,
  dryRun: boolean,
): Promise<boolean> {
  const state = await fromAsyncThrowable(() => lstat(path))();
  if (state.isErr() || !state.value.isSymbolicLink()) return false;
  if (!(await resolvesIntoRepository(path, dotfiles))) {
    print(`left unrelated link: ${path}`);
    return false;
  }
  const source = await fromAsyncThrowable(() => realpath(path), errorText)();
  if (source.isErr()) {
    fail(`cannot migrate ${path}: ${errorText(source.error)}`);
    process.exitCode = 1;
    return false;
  }
  const info = await fromAsyncThrowable(() => stat(source.value))();
  if (info.isErr()) {
    fail(
      `cannot migrate ${path}: link target is not a regular file or directory`,
    );
    process.exitCode = 1;
    return false;
  }
  if (!info.value.isDirectory() && !info.value.isFile()) {
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

  const temp = await fromAsyncThrowable(
    () => mkdtemp(join(dirname(path), ".skills-migrate-")),
    errorText,
  )();
  if (temp.isErr()) {
    fail(`cannot migrate ${path}: ${errorText(temp.error)}`);
    process.exitCode = 1;
    return false;
  }
  const copy = join(temp.value, "copy");
  const backup = join(temp.value, "link");
  const copied = await fromAsyncThrowable(
    () =>
      cp(source.value, copy, {
        recursive: info.value.isDirectory(),
        dereference: true,
        force: false,
        errorOnExist: true,
      }),
    errorText,
  )();
  if (copied.isErr()) {
    await rm(temp.value, { recursive: true, force: true });
    fail(`cannot migrate ${path}: copy failed: ${errorText(copied.error)}`);
    process.exitCode = 1;
    return false;
  }

  const moved = await fromAsyncThrowable(
    () => rename(path, backup),
    errorText,
  )();
  if (moved.isErr()) {
    await rm(temp.value, { recursive: true, force: true });
    fail(
      `cannot migrate ${path}: could not stage old link: ${errorText(moved.error)}`,
    );
    process.exitCode = 1;
    return false;
  }
  const installed = await fromAsyncThrowable(
    () => rename(copy, path),
    errorText,
  )();
  if (installed.isErr()) {
    const restored = await fromAsyncThrowable(
      () => rename(backup, path),
      errorText,
    )();
    await rm(temp.value, { recursive: true, force: true });
    fail(
      `cannot migrate ${path}: could not install copy: ${errorText(installed.error)}` +
        (restored.isErr()
          ? `; restoring old link failed: ${errorText(restored.error)}`
          : ""),
    );
    process.exitCode = 1;
    return false;
  }
  await unlink(backup);
  await rm(temp.value, { recursive: true, force: true });
  print(`migrated: ${path} -> real copy of ${source.value}`);
  return true;
}

async function migrateThirdPartyLinks(
  root: string,
  dotfiles: string,
  names: readonly string[],
  dryRun: boolean,
): Promise<number> {
  let changed = 0;
  for (const name of names.toSorted())
    if (await migrateLink(join(root, name), dotfiles, dryRun)) changed += 1;

  const entries = await fromAsyncThrowable(() => readdir(root))();
  if (entries.isErr()) return changed;
  const thirdParty = new Set(names);
  for (const name of entries.value.toSorted()) {
    if (thirdParty.has(name)) continue;
    const path = join(root, name);
    if (
      (await lstat(path)
        .then((value) => value.isSymbolicLink())
        .catch(() => false)) &&
      (await resolvesIntoRepository(path, dotfiles))
    )
      print(`left in-house link: ${path}`);
  }
  return changed;
}

async function main(): Promise<void> {
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
  const declaration = await readDeclaration(dotfiles);
  if (declaration.isErr()) {
    fail(`cannot migrate skills: ${declaration.error}`);
    process.exitCode = 1;
    return;
  }
  const names = declaration.value.skills.map((entry) => entry.skill);
  const agentsRoot = resolve(home, ".agents/skills");
  const migratedAgentsRoot = (await migrateLink(
    agentsRoot,
    dotfiles,
    parsed.flags.dryRun,
  ))
    ? 1
    : 0;
  const thirdPartyRoots = [agentsRoot, resolve(home, ".claude/skills")];
  let migratedThirdParty = 0;
  for (const root of thirdPartyRoots)
    migratedThirdParty += await migrateThirdPartyLinks(
      root,
      dotfiles,
      names,
      parsed.flags.dryRun,
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
