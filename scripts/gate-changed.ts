// Consumer: workers (verdict lines). Read-only checks; no commit, formatting, or deployment.
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { cli } from "cleye";
import { Result, errorMessage } from "@dotfiles/shared/src/result.ts";
import { z } from "@dotfiles/hooks/zod.ts";
import { JJ_READ_ARGS } from "@dotfiles/shared/src/jj-read.ts";
import { readonlyCommand } from "@dotfiles/shared/src/readonly-command.ts";

const ROOT = resolve(import.meta.dir, "..");
const TYPESCRIPT = /\.(?:[cm]?ts|tsx)$/u;

type Output = { stdout: string; stderr: string; exit: number };

async function command(
  cmd: string[],
  cwd: string,
  env = process.env,
): Promise<Result<Output, unknown>> {
  if (Bun.which(cmd[0] ?? "") === null)
    return Result.err(`command unavailable: ${cmd[0]}`);
  const signal = AbortSignal.timeout(180_000);
  const result = await Result.tryPromise({
    try: async () => {
      const child = Bun.spawn(cmd, {
        cwd,
        env,
        stdout: "pipe",
        stderr: "pipe",
        signal,
      });
      const [stdout, stderr, exit] = await Promise.all([
        child.stdout.text(),
        child.stderr.text(),
        child.exited,
      ]);
      return { stdout, stderr, exit };
    },
    catch: (e: unknown) => e,
  });
  if (signal.aborted) return Result.err(`timed out: ${cmd.join(" ")}`);
  return result;
}

async function commandOutput(
  cmd: string[],
  root: string,
  env = process.env,
): Promise<Result<string, unknown>> {
  const result = await command(cmd, root, env);
  if (!result.isOk()) return Result.err(result.error);
  if (result.value.exit !== 0)
    return Result.err(
      `read failed (${result.value.exit}): ${result.value.stderr}`,
    );
  return Result.ok(result.value.stdout);
}

async function liveChanges(
  root: string,
  gitDir: string,
  fork: string,
  snapshot: string,
  temporary: string,
): Promise<Result<string[], unknown>> {
  // The private index supplies tracked paths from @. Git compares live contents
  // and applies nested/global ignore rules and info/exclude for new files.
  const env = {
    ...process.env,
    GIT_INDEX_FILE: join(temporary, "index"),
    GIT_NO_LAZY_FETCH: "1",
  };
  const git = (args: string[]) =>
    commandOutput(
      [
        "git",
        "--no-optional-locks",
        "--git-dir",
        gitDir,
        "--work-tree",
        root,
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.splitIndex=false",
        "-c",
        `core.hooksPath=${temporary}`,
        ...args,
      ],
      root,
      env,
    );
  // jj's synthetic root has no Git commit. Ask the backend for its empty tree
  // hash without writing an object (also works with SHA-256 Git repositories).
  const base = /^0+$/u.test(fork)
    ? await git(["hash-object", "-t", "tree", "--stdin"])
    : Result.ok(fork);
  if (!base.isOk()) return Result.err(base.error);
  const indexed = await git(
    /^0+$/u.test(snapshot) ? ["read-tree", "--empty"] : ["read-tree", snapshot],
  );
  if (!indexed.isOk()) return Result.err(indexed.error);
  const diff = [
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "--no-renames",
    "--name-only",
    "-z",
  ];
  const recorded = /^0+$/u.test(snapshot) ? base.value.trim() : snapshot;
  // Keep committed changes and edits since @ separately: a live edit restoring
  // the fork's contents must not cancel a path out of the selected set.
  const [committed, changed, added] = await Promise.all([
    git([...diff, base.value.trim(), recorded, "--"]),
    git([...diff, recorded, "--"]),
    git(["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  if (!committed.isOk()) return Result.err(committed.error);
  if (!changed.isOk()) return Result.err(changed.error);
  if (!added.isOk()) return Result.err(added.error);
  return Result.ok([
    ...new Set(
      (committed.value + changed.value + added.value)
        .split("\0")
        .filter(
          (path) =>
            path !== "" &&
            path !== ".jj" &&
            !path.startsWith(".jj/") &&
            path !== ".git" &&
            !path.startsWith(".git/"),
        ),
    ),
  ]);
}

/** Compare the fork point with live files without updating the shared store. */
export async function changedFiles(
  root: string,
): Promise<Result<string[], unknown>> {
  const read = (args: string[]) => {
    const invocation = readonlyCommand(["jj", ...JJ_READ_ARGS, ...args], root);
    return commandOutput(invocation.cmd, root, invocation.env);
  };
  const [gitDir, fork, snapshot] = await Promise.all([
    read(["git", "root"]),
    read([
      "log",
      "--no-graph",
      "-r",
      "heads(::trunk() & ::@)",
      "-T",
      'commit_id ++ "\\n"',
    ]),
    read(["log", "--no-graph", "-r", "@", "-T", "commit_id"]),
  ]);
  if (!gitDir.isOk()) return Result.err(gitDir.error);
  if (!fork.isOk()) return Result.err(fork.error);
  if (!snapshot.isOk()) return Result.err(snapshot.error);
  // Multiple merge bases have no unique fork point. Never silently select one.
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(fork.value.trim()))
    return Result.err("expected exactly one fork point between trunk() and @");
  const temporary = await Result.tryPromise({
    try: () => mkdtemp(join(tmpdir(), "gate-changed-index-")),
    catch: (e: unknown) => e,
  });
  if (!temporary.isOk()) return Result.err(temporary.error);
  const result = await Result.tryPromise({
    try: () =>
      liveChanges(
        root,
        gitDir.value.trimEnd(),
        fork.value.trim(),
        snapshot.value.trim(),
        temporary.value,
      ),
    catch: (e: unknown) => e,
  });
  const cleanup = await Result.tryPromise({
    try: () => rm(temporary.value, { recursive: true, force: true }),
    catch: (e: unknown) => e,
  });
  if (!cleanup.isOk()) return Result.err(cleanup.error);
  return result.isOk() ? result.value : Result.err(result.error);
}

async function existingFile(path: string): Promise<Result<boolean, unknown>> {
  const entry = await Result.tryPromise({
    try: () => stat(path),
    catch: (e: unknown) => e,
  });
  if (entry.isOk()) return Result.ok(entry.value.isFile());
  const missing = z
    .object({ code: z.literal("ENOENT") })
    .safeParse(entry.error);
  return missing.success ? Result.ok(false) : Result.err(entry.error);
}

async function existingFiles(
  root: string,
  paths: readonly string[],
): Promise<Result<string[], unknown>> {
  const files: string[] = [];
  for (const path of new Set(paths)) {
    if (isAbsolute(path) || path.split("/").includes(".."))
      return Result.err(`invalid repo-relative path: ${path}`);
    const entry = await existingFile(join(root, path));
    if (!entry.isOk()) return Result.err(entry.error);
    if (entry.value) files.push(path);
  }
  return Result.ok(files);
}

/** Files may be injected by fixture callers; the CLI always discovers them with jj. */
export async function gateChanged(
  root = ROOT,
  paths?: readonly string[],
): Promise<number> {
  const started = performance.now();
  const selected =
    paths === undefined ? await changedFiles(root) : Result.ok(paths);
  if (!selected.isOk()) return fatal(selected.error);
  const existing = await existingFiles(root, selected.value);
  if (!existing.isOk()) return fatal(existing.error);
  const files = existing.value;
  if (files.length === 0) {
    process.stdout.write("gate:changed: no existing changed files; ok\n");
    return 0;
  }
  const ts = files.filter((path) => TYPESCRIPT.test(path));
  const checks = [];
  if (ts.length > 0) {
    // Prefix paths so a filename beginning with '-' cannot become a tool option.
    const arguments_ = ts.map((path) => `./${path}`);
    checks.push(
      {
        name: "format",
        run: () =>
          command(["bunx", "--bun", "oxfmt", "--check", ...arguments_], root),
      },
      {
        name: "lint:ts",
        run: () =>
          command(
            ["bunx", "--bun", "oxlint", "--type-aware", ...arguments_],
            root,
          ),
      },
    );
  }
  // TypeScript needs the whole program; this is the deliberate scope exception.
  checks.push({
    name: "typecheck",
    run: () => command(["bun", "check"], root),
  });
  let failed = false;
  for (const check of checks) {
    const start = performance.now();
    const attempted = await Result.tryPromise({
      try: check.run,
      catch: (e: unknown) => e,
    });
    const result = attempted.isOk()
      ? attempted.value
      : Result.err(attempted.error);
    if (!result.isOk()) {
      process.stderr.write(`${check.name}: ${errorMessage(result.error)}\n`);
      failed = true;
      continue;
    }
    if (result.value.exit !== 0) {
      process.stdout.write(result.value.stdout);
      process.stderr.write(result.value.stderr);
      failed = true;
    }
    process.stdout.write(
      `gate:changed: ${check.name} ${result.value.exit === 0 ? "ok" : "FAIL"} (${((performance.now() - start) / 1000).toFixed(2)}s)\n`,
    );
  }
  process.stdout.write(
    `gate:changed: ${files.length} existing changed file(s), ${ts.length} TS; ${failed ? "FAIL" : "ok"} (${((performance.now() - started) / 1000).toFixed(2)}s)\n`,
  );
  return failed ? 1 : 0;
}

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__")
    process.exit(fatal(`unknown option '--${flag}'`));
}

function fatal(error: unknown): number {
  process.stderr.write(`FATAL: ${errorMessage(error)}\n`);
  return 2;
}

async function main(): Promise<number> {
  const argv = cli({
    name: "gate-changed",
    parameters: [],
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
  });
  if (argv._.length > 0) return fatal(`unexpected argument: ${argv._[0]}`);
  return gateChanged();
}

if (import.meta.main) {
  const result = await Result.tryPromise({
    try: main,
    catch: (e: unknown) => e,
  });
  if (result.isOk()) process.exitCode = result.value;
  else {
    process.stderr.write(`FATAL: ${errorMessage(result.error)}\n`);
    process.exitCode = 2;
  }
}
