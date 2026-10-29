import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";
import { err, fromThrowable, ok, type Result } from "neverthrow";
import {
  parseSkillLock,
  pathExists,
  readToolLock,
  skillCliArgs,
  toolLockPath,
  type SkillLock,
} from "./skills-declaration.ts";

export const FETCH_TIMEOUT_MS = 600_000;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function targetSkillNames(home: string): Set<string> {
  const names = new Set<string>();
  for (const root of [
    resolve(home, ".agents/skills"),
    resolve(home, ".claude/skills"),
  ]) {
    if (!existsSync(root)) continue;
    for (const name of fromThrowable((path: string) => readdirSync(path))(root)
      .map((entries) => entries.filter((entry) => !entry.startsWith(".")))
      .unwrapOr([]))
      names.add(name);
  }
  return names;
}

export async function runSkillsCli(
  version: string,
  source: string,
  names: readonly string[],
  home: string,
): Promise<{ exitCode: number; timedOut: boolean }> {
  const cwd = mkdtempSync(join(tmpdir(), "skills-cli-cwd-"));
  using _cwd = {
    [Symbol.dispose]: () => {
      rmSync(cwd, { recursive: true, force: true });
    },
  };
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const fake = process.env["VENDOR_SKILL_CLI"];
  const cliArgs = skillCliArgs(version, source, names);
  const command =
    fake === undefined
      ? cliArgs
      : [process.execPath, fake, ...cliArgs.slice(3)];
  const env =
    fake === undefined
      ? {
          ...process.env,
          HOME: home,
          BUN_INSTALL_CACHE_DIR:
            process.env["BUN_INSTALL_CACHE_DIR"] ??
            resolve(homedir(), ".bun/install/cache"),
        }
      : { ...process.env, HOME: home };

  if (fake === undefined && Bun.which("bunx") === null)
    return { exitCode: 127, timedOut: false };

  const proc = Bun.spawn(command, {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    cwd,
    env,
    signal,
    killSignal: "SIGTERM",
  });
  const exitCode = await proc.exited;
  return { exitCode, timedOut: signal.aborted };
}

/** Run an explicit skills CLI subcommand through the pinned Bun-based launcher. */
export async function runPinnedSkillsCommand(
  version: string,
  args: readonly string[],
  home: string,
  cwd: string,
): Promise<{ exitCode: number; timedOut: boolean }> {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  if (Bun.which("bunx") === null) return { exitCode: 127, timedOut: false };
  const proc = Bun.spawn(
    ["bunx", "--bun", "--yes", `skills@${version}`, ...args],
    {
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
      cwd,
      env: {
        ...process.env,
        HOME: home,
        BUN_INSTALL_CACHE_DIR:
          process.env["BUN_INSTALL_CACHE_DIR"] ??
          resolve(homedir(), ".bun/install/cache"),
      },
      signal,
      killSignal: "SIGTERM",
    },
  );
  const exitCode = await proc.exited;
  return { exitCode, timedOut: signal.aborted };
}

export function newlyInstalledStowaways(
  before: SkillLock,
  after: SkillLock,
  requested: readonly string[],
): string[] {
  const old = new Set(Object.keys(before.skills));
  const asked = new Set(requested);
  return Object.keys(after.skills)
    .filter((name) => !old.has(name) && !asked.has(name))
    .toSorted();
}

export function removeNewStowaways(
  home: string,
  before: SkillLock,
  after: SkillLock,
  requested: readonly string[],
  namesBefore: ReadonlySet<string>,
): Result<string[], string> {
  const stowaways = newlyInstalledStowaways(before, after, requested);
  if (stowaways.length === 0) return ok([]);

  stowaways
    .filter((name) => !namesBefore.has(name))
    .forEach((name) => {
      removeStowawayTargets(home, name);
    });

  const removed = new Set(stowaways);
  const skills = Object.fromEntries(
    Object.entries(after.skills).filter(([name]) => !removed.has(name)),
  );
  const lockPath = toolLockPath(home);
  const lockText = fromThrowable((path: string) => readFileSync(path, "utf8"))(
    lockPath,
  );
  if (lockText.isErr()) return err(errorText(lockText.error));
  const parsed = parseSkillLock(lockText.value);
  if (parsed.isErr()) return err(parsed.error);
  const written = fromThrowable(() => {
    writeFileSync(
      lockPath,
      `${JSON.stringify({ ...parsed.value, skills }, null, 2)}\n`,
    );
  })();
  return written.isErr() ? err(errorText(written.error)) : ok(stowaways);
}

function removeStowawayTargets(home: string, name: string): void {
  for (const target of [
    resolve(home, ".agents/skills", name),
    resolve(home, ".claude/skills", name),
  ]) {
    if (pathExists(target)) rmSync(target, { recursive: true, force: true });
  }
}

export function readInstalledLock(home: string): SkillLock | undefined {
  return readToolLock(home).unwrapOr(undefined);
}
