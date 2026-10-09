import { existsSync } from "node:fs";
import { resolve } from "node:path";

export type PremiseCheck =
  | { status: "ok" }
  | { status: "missing"; premises: string[] }
  | { status: "timeout" };

type CommandResult = { exitCode: number | null; stdout: string };
type CommandRunner = (
  argv: string[],
  cwd: string,
  timeoutMs: number,
) => CommandResult;

const REPO_ROOT = resolve(import.meta.dir, "../../..");
const TRACKED_FILES = resolve(REPO_ROOT, "scripts/tracked-files.ts");
const DEFAULT_BUDGET_MS = 5_000;

const runCommand: CommandRunner = (argv, cwd, timeoutMs) => {
  const result = Bun.spawnSync(argv, {
    cwd,
    stdout: "pipe",
    stderr: "ignore",
    timeout: Math.max(1, Math.floor(timeoutMs)),
  });
  return { exitCode: result.exitCode, stdout: result.stdout.toString() };
};

function parseSymbol(value: string): { name: string; glob?: string } {
  const reference = value.slice("symbol:".length);
  const separator = reference.indexOf("@");
  return separator < 0
    ? { name: reference }
    : {
        name: reference.slice(0, separator),
        glob: reference.slice(separator + 1),
      };
}

function isTimeout(
  result: CommandResult,
  startedAt: number,
  budgetMs: number,
): boolean {
  return result.exitCode === null || performance.now() - startedAt >= budgetMs;
}

export function checkPremises(
  premises: string[] | undefined,
  cwd: string,
  options: {
    budgetMs?: number;
    runner?: CommandRunner;
  } = {},
): PremiseCheck {
  if (premises === undefined || premises.length === 0) return { status: "ok" };
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const startedAt = performance.now();
  const runner = options.runner ?? runCommand;
  const remaining = (): number => budgetMs - (performance.now() - startedAt);
  const missing: string[] = [];

  for (const premise of premises) {
    if (
      premise.startsWith("file:") &&
      !existsSync(resolve(cwd, premise.slice("file:".length)))
    )
      missing.push(premise);
  }

  const symbols = premises.filter((premise) => premise.startsWith("symbol:"));
  if (symbols.length === 0)
    return missing.length === 0
      ? { status: "ok" }
      : { status: "missing", premises: missing };

  let files: string[] | undefined;
  if (resolve(cwd) === REPO_ROOT) {
    const result = runner(
      [process.execPath, TRACKED_FILES],
      cwd,
      Math.max(1, remaining()),
    );
    if (isTimeout(result, startedAt, budgetMs)) return { status: "timeout" };
    if (result.exitCode !== 0) return { status: "timeout" };
    files = result.stdout.split("\0").filter(Boolean);
  }

  for (const premise of symbols) {
    const { name, glob } = parseSymbol(premise);
    const argv = ["rg", "--fixed-strings", "--files-with-matches"];
    if (glob !== undefined) argv.push("--glob", glob);
    argv.push("--", name, ...(files ?? ["."]));
    const result = runner(argv, cwd, Math.max(1, remaining()));
    if (isTimeout(result, startedAt, budgetMs)) return { status: "timeout" };
    if (result.exitCode === 1) missing.push(premise);
    else if (result.exitCode !== 0) return { status: "timeout" };
  }

  return missing.length === 0
    ? { status: "ok" }
    : { status: "missing", premises: missing };
}
