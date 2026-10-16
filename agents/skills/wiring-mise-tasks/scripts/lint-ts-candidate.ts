#!/usr/bin/env bun
// Select immutable jj candidate paths; lint-oxlint.ts remains the sole oxlint runner.
import { cli } from "cleye";
import { access, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import {
  jjCandidate,
  jjChanged,
  jjContext,
  jjExport,
  jjRead,
  selected,
  validPath,
} from "./jj-precommit.ts";

const exportCandidate: (...args: Parameters<typeof jjExport>) => unknown =
  jjExport;

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("lint-ts-candidate: unknown option --__proto__\n");
    process.exit(2);
  }
}

async function main(): Promise<number> {
  const parsed = cli({
    name: "lint-ts-candidate",
    parameters: [],
    flags: {
      dir: {
        type: String,
        default: ".",
        description:
          "Repo-relative directory holding the toolchain and lint-oxlint.ts",
      },
    },
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
  });
  if (parsed._.length > 0) {
    process.stderr.write("lint-ts-candidate takes no arguments\n");
    return 2;
  }
  if (!validPath(parsed.flags.dir)) {
    process.stderr.write(
      "lint-ts-candidate: --dir must be a repo-relative directory without .., .git or .jj components\n",
    );
    return 2;
  }
  const directory = posix.normalize(parsed.flags.dir);
  const context =
    (await Promise.try(() => jjContext())) ??
    (await Promise.try(() => {
      const root = jjRead(["root"]).toString().trim();
      const rev = jjRead(
        ["log", "--no-graph", "-r", "@", "-T", "commit_id"],
        root,
      ).toString();
      const base = jjRead(
        ["log", "--no-graph", "-r", "@-", "-T", "commit_id"],
        root,
      ).toString();
      return { root, rev, base, paths: ["."] };
    }));
  const candidate = await Promise.try(() => jjCandidate(context));
  const changed = await Promise.try(() => jjChanged(context));
  const files = changed.filter(
    (path) =>
      candidate.has(path) &&
      selected([directory], path) &&
      /\.tsx?$/u.test(path),
  );
  if (files.length === 0) {
    process.stdout.write("lint-ts-candidate: no candidate .ts/.tsx files\n");
    return 0;
  }
  const temporary = await mkdtemp(join(tmpdir(), "lint-ts-candidate-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () =>
      rm(temporary, { recursive: true, force: true }),
  };
  await exportCandidate(context, temporary, candidate);
  const toolchain = join(temporary, directory);
  if (
    await access(join(context.root, directory, "node_modules")).then(
      () => true,
      () => false,
    )
  )
    await symlink(
      join(context.root, directory, "node_modules"),
      join(toolchain, "node_modules"),
    );
  const child = Bun.spawn(
    [
      process.execPath,
      join(toolchain, "lint-oxlint.ts"),
      "--type-aware",
      "--",
      ...files.map((path) => `./${posix.relative(directory, path)}`),
    ],
    {
      cwd: toolchain,
      stdout: "inherit",
      stderr: "inherit",
      timeout: 120_000,
    },
  );
  return await child.exited;
}

process.exitCode = await main().catch((error: unknown) => {
  process.stderr.write(`lint-ts-candidate: FATAL: ${String(error)}\n`);
  return 2;
});
