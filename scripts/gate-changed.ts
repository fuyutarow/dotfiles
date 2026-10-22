// Consumer: workers (verdict lines). Read-only checks; no commit, formatting, or deployment.
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { cli } from "cleye";
import {
  attempt,
  errorMessage,
  type Attempt,
} from "../agents/hooks/attempt.ts";
import { z } from "../agents/hooks/zod.ts";

const ROOT = resolve(import.meta.dir, "..");
const TYPESCRIPT = /\.(?:[cm]?ts|tsx)$/u;

type Output = { stdout: string; stderr: string; exit: number };

async function command(cmd: string[], cwd: string): Promise<Attempt<Output>> {
  if (Bun.which(cmd[0] ?? "") === null)
    return { ok: false, error: `command unavailable: ${cmd[0]}` };
  const signal = AbortSignal.timeout(180_000);
  const result = await attempt(async () => {
    const child = Bun.spawn(cmd, {
      cwd,
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
  });
  if (signal.aborted)
    return { ok: false, error: `timed out: ${cmd.join(" ")}` };
  return result;
}

/** Snapshot this workspace, including uncommitted files, and compare it with trunk. */
export async function changedFiles(root: string): Promise<Attempt<string[]>> {
  const result = await command(
    ["jj", "diff", "--from", "trunk()", "--template", 'path ++ "\\0"'],
    root,
  );
  if (!result.ok) return result;
  if (result.value.exit !== 0)
    return {
      ok: false,
      error: `jj diff failed (${result.value.exit}): ${result.value.stderr}`,
    };
  return {
    ok: true,
    value: result.value.stdout.split("\0").filter((path) => path !== ""),
  };
}

async function existingFile(path: string): Promise<Attempt<boolean>> {
  const entry = await attempt(() => stat(path));
  if (entry.ok) return { ok: true, value: entry.value.isFile() };
  const missing = z
    .object({ code: z.literal("ENOENT") })
    .safeParse(entry.error);
  return missing.success ? { ok: true, value: false } : entry;
}

async function existingFiles(
  root: string,
  paths: readonly string[],
): Promise<Attempt<string[]>> {
  const files: string[] = [];
  for (const path of new Set(paths)) {
    if (isAbsolute(path) || path.split("/").includes(".."))
      return { ok: false, error: `invalid repo-relative path: ${path}` };
    const entry = await existingFile(join(root, path));
    if (!entry.ok) return entry;
    if (entry.value) files.push(path);
  }
  return { ok: true, value: files };
}

/** The existing no-sync CLI scans cwd, so give it only the selected sources and policy. */
async function syncPolicy(root: string, files: readonly string[]) {
  const candidate = await mkdtemp(join(tmpdir(), "gate-changed-"));
  const result = await attempt(async () => {
    for (const path of [
      ".oxlintrc.json",
      "lint/no-sync-baseline.tsv",
      ...files,
    ]) {
      const target = join(candidate, path);
      await mkdir(dirname(target), { recursive: true });
      await Bun.write(target, Bun.file(join(root, path)));
    }
    return command(["bun", join(ROOT, "scripts/lint-no-sync.ts")], candidate);
  });
  // Only our disposable candidate is removed; source files are never rewritten.
  await rm(candidate, { recursive: true, force: true });
  return result.ok ? result.value : result;
}

/** Files may be injected by fixture callers; the CLI always discovers them with jj. */
export async function gateChanged(
  root = ROOT,
  paths?: readonly string[],
): Promise<number> {
  const started = performance.now();
  const selected =
    paths === undefined
      ? await changedFiles(root)
      : ({ ok: true, value: paths } satisfies Attempt<readonly string[]>);
  if (!selected.ok) return fatal(selected.error);
  const existing = await existingFiles(root, selected.value);
  if (!existing.ok) return fatal(existing.error);
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
      { name: "lint:no-sync", run: () => syncPolicy(root, ts) },
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
    const attempted = await attempt(check.run);
    const result = attempted.ok ? attempted.value : attempted;
    if (!result.ok) {
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
  const result = await attempt(main);
  if (result.ok) process.exitCode = result.value;
  else {
    process.stderr.write(`FATAL: ${errorMessage(result.error)}\n`);
    process.exitCode = 2;
  }
}
