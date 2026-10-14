import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import {
  lstatSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  unlinkSync,
} from "node:fs";
import { fromThrowable } from "neverthrow";

const TOOL_SKILL_DIRS = [".claude/skills", ".agents/skills", ".codex/skills"];

function canonicalPath(path: string): string | undefined {
  let cursor = resolve(path);
  const suffix: string[] = [];
  while (true) {
    const real = fromThrowable((value: string) => realpathSync(value))(cursor);
    if (real.isOk()) return resolve(real.value, ...suffix);
    const parent = dirname(cursor);
    if (parent === cursor) return undefined;
    suffix.unshift(basename(cursor));
    cursor = parent;
  }
}

function isWithin(root: string, path: string): boolean {
  const rel = relative(root, path);
  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  );
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && Reflect.get(error, "code") === "ENOENT";
}

function commonGitDirectory(repoRoot: string): string | undefined {
  const root = canonicalPath(repoRoot) ?? resolve(repoRoot);
  const marker = join(root, ".git");
  const markerInfo = fromThrowable((value: string) => lstatSync(value))(marker);
  if (markerInfo.isErr() || markerInfo.value.isSymbolicLink()) return undefined;
  if (markerInfo.value.isDirectory()) return canonicalPath(marker);
  if (!markerInfo.value.isFile()) return undefined;

  const markerText = fromThrowable((value: string) =>
    readFileSync(value, "utf8"),
  )(marker);
  if (markerText.isErr()) return undefined;
  const gitDirLine = markerText.value.match(/^gitdir:\s*(.+)\s*$/mu);
  const gitDirValue = gitDirLine?.[1];
  if (gitDirValue === undefined || gitDirValue.trim() === "") return undefined;
  const gitDir = canonicalPath(resolve(root, gitDirValue));
  if (gitDir === undefined) return undefined;

  const commonDirPath = join(gitDir, "commondir");
  const commonDirText = fromThrowable((value: string) =>
    readFileSync(value, "utf8"),
  )(commonDirPath);
  if (commonDirText.isErr())
    return isMissing(commonDirText.error) ? gitDir : undefined;
  const commonDirValue = commonDirText.value.trim();
  return commonDirValue === ""
    ? undefined
    : canonicalPath(resolve(gitDir, commonDirValue));
}

function gitRootForPath(path: string): string | undefined {
  let cursor = resolve(path);
  while (true) {
    const marker = fromThrowable((value: string) => lstatSync(value))(
      join(cursor, ".git"),
    );
    if (
      marker.isOk() &&
      !marker.value.isSymbolicLink() &&
      (marker.value.isDirectory() || marker.value.isFile())
    )
      return cursor;
    const parent = dirname(cursor);
    if (parent === cursor) return undefined;
    cursor = parent;
  }
}

function symlinkPointsIntoRepo(path: string, repoRoot: string): boolean {
  const state = fromThrowable((value: string) => lstatSync(value))(path);
  if (state.isErr() || !state.value.isSymbolicLink()) return false;
  const rawTarget = fromThrowable((value: string) => readlinkSync(value))(path);
  if (rawTarget.isErr()) return false;
  const target = isAbsolute(rawTarget.value)
    ? rawTarget.value
    : resolve(dirname(path), rawTarget.value);
  const resolvedTarget = canonicalPath(target);
  const resolvedRoot = canonicalPath(repoRoot) ?? resolve(repoRoot);
  if (resolvedTarget === undefined) return false;
  if (isWithin(resolvedRoot, resolvedTarget)) return true;

  const currentCommonDir = commonGitDirectory(resolvedRoot);
  const targetRoot = gitRootForPath(resolvedTarget);
  if (currentCommonDir === undefined || targetRoot === undefined) return false;
  return commonGitDirectory(targetRoot) === currentCommonDir;
}

export type SkillSymlinkScan = { paths: string[]; errors: string[] };

export function findRepoSkillSymlinks(
  home: string,
  repoRoot: string,
): SkillSymlinkScan {
  const paths: string[] = [];
  const errors: string[] = [];
  const visit = (path: string): void => {
    const state = fromThrowable((value: string) => lstatSync(value))(path);
    if (state.isErr()) {
      if (!isMissing(state.error))
        errors.push(
          `${path}: ${state.error instanceof Error ? state.error.message : String(state.error)}`,
        );
      return;
    }
    if (state.value.isSymbolicLink()) {
      if (symlinkPointsIntoRepo(path, repoRoot)) paths.push(path);
      return;
    }
    if (!state.value.isDirectory()) return;
    const entries = fromThrowable((value: string) => readdirSync(value))(path);
    if (entries.isErr()) {
      errors.push(
        `${path}: ${entries.error instanceof Error ? entries.error.message : String(entries.error)}`,
      );
      return;
    }
    for (const entry of entries.value) visit(join(path, entry));
  };

  for (const rel of TOOL_SKILL_DIRS) visit(resolve(home, rel));
  return { paths: paths.toSorted(), errors };
}

export function removeRepoSkillSymlinks(
  home: string,
  repoRoot: string,
  dryRun = false,
): SkillSymlinkScan & { removed: string[] } {
  const scan = findRepoSkillSymlinks(home, repoRoot);
  const removed: string[] = [];
  if (dryRun || scan.errors.length > 0) return { ...scan, removed };

  for (const path of scan.paths) {
    // Recheck immediately before unlinking. The scan may have raced with another writer.
    if (!symlinkPointsIntoRepo(path, repoRoot)) continue;
    const result = fromThrowable(() => {
      unlinkSync(path);
    })();
    if (result.isErr()) {
      scan.errors.push(
        `${path}: ${result.error instanceof Error ? result.error.message : String(result.error)}`,
      );
      continue;
    }
    removed.push(path);
  }
  return { ...scan, removed };
}
