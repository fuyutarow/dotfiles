import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  statSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fromThrowable } from "neverthrow";

export const REF_LOCK_STALE_MS = 60_000;

export type OwnerlessRefLock = Readonly<{ path: string; ageMs: number }>;

const refLockNames = new Set(["packed-refs.lock", "shallow.lock"]);

function gitDirectory(repoRoot: string): string | undefined {
  const dotGit = join(repoRoot, ".git");
  const stat = lstatSync(dotGit, { throwIfNoEntry: false });
  if (stat === undefined) return undefined;
  if (stat.isDirectory()) return realpathSync(dotGit);
  if (!stat.isFile()) return undefined;
  const match = /^gitdir:\s*(.+)\s*$/mu.exec(readFileSync(dotGit, "utf8"));
  const target = match?.[1];
  if (target === undefined) return undefined;
  const gitDir = realpathSync(
    isAbsolute(target) ? target : resolve(repoRoot, target),
  );
  const commonDirFile = join(gitDir, "commondir");
  return existsSync(commonDirFile)
    ? realpathSync(resolve(gitDir, readFileSync(commonDirFile, "utf8").trim()))
    : gitDir;
}

function refLockPaths(gitDir: string): string[] {
  const found: string[] = [];
  const addIfFile = (path: string): void => {
    if (lstatSync(path, { throwIfNoEntry: false })?.isFile() === true)
      found.push(resolve(path));
  };
  for (const name of refLockNames) addIfFile(join(gitDir, name));
  const refs = join(gitDir, "refs");
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.endsWith(".lock")) addIfFile(path);
    }
  };
  if (existsSync(refs)) walk(refs);
  return found;
}

function fdPointsTo(fdPath: string, target: string): boolean {
  const link = fromThrowable(() => readlinkSync(fdPath))();
  if (link.isErr()) return false;
  const held = link.value.replace(/ \(deleted\)$/u, "");
  return resolve(held) === target;
}

function processHoldsPath(pidDir: string, target: string): boolean {
  const fds = join(pidDir, "fd");
  const entries = fromThrowable(() => readdirSync(fds))();
  if (entries.isErr()) return false;
  return entries.value.some((fd) => fdPointsTo(join(fds, fd), target));
}

function procHoldsPath(path: string, procRoot: string): boolean | undefined {
  if (!existsSync(procRoot)) return undefined;
  const target = resolve(path);
  for (const pid of readdirSync(procRoot)) {
    if (!/^\d+$/u.test(pid)) continue;
    if (processHoldsPath(join(procRoot, pid), target)) return true;
  }
  return false;
}

function hasHolder(path: string, procRoot: string): boolean {
  const procResult = procHoldsPath(path, procRoot);
  if (procResult !== undefined) return procResult;
  const lsof = Bun.which("lsof");
  if (lsof === null || lsof === undefined) return true;
  const result = Bun.spawnSync([lsof, "-t", "--", path], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 2_000,
    killSignal: "SIGTERM",
  });
  if (result.signalCode !== null || result.exitCode === null) return true;
  if (result.exitCode === 0) return result.stdout.toString().trim() !== "";
  return result.exitCode !== 1 || result.stderr.toString().trim() !== "";
}

/** Return stale ref locks only when the host can establish that no process holds them open. */
export function ownerlessRefLocks(
  repoRoot: string,
  options: {
    nowMs?: number;
    staleMs?: number;
    procRoot?: string;
  } = {},
): OwnerlessRefLock[] {
  const gitDir = gitDirectory(resolve(repoRoot));
  if (gitDir === undefined) return [];
  const nowMs = options.nowMs ?? Temporal.Now.instant().epochMilliseconds;
  const staleMs = options.staleMs ?? REF_LOCK_STALE_MS;
  const procRoot = options.procRoot ?? "/proc";
  return refLockPaths(gitDir).flatMap((path) => {
    const ageMs = Math.max(0, nowMs - statSync(path).mtimeMs);
    return ageMs >= staleMs && !hasHolder(path, procRoot)
      ? [{ path, ageMs }]
      : [];
  });
}
