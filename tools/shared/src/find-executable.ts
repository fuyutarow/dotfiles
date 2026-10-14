import { constants, statSync } from "node:fs";
import { join } from "node:path";

// Any-execute-bit check without throwing: statSync(throwIfNoEntry: false) returns undefined for
// a missing path instead of throwing, so the X_OK check below never needs a catch to "keep
// looking" past a missing or non-executable candidate.
// Two deliberate differences from accessSync(p, X_OK): a directory no longer counts (X_OK passed
// for a searchable dir of the same name), and any x bit counts rather than the one for this
// process's uid/gid — for a PATH lookup of a named binary neither case is a real executable.
function isExecutable(path: string): boolean {
  const stat = statSync(path, { throwIfNoEntry: false });
  if (stat === undefined || !stat.isFile()) return false;
  return (
    (stat.mode & constants.S_IXUSR) !== 0 ||
    (stat.mode & constants.S_IXGRP) !== 0 ||
    (stat.mode & constants.S_IXOTH) !== 0
  );
}

// Locate an executable: $PATH first, then fallback dirs (hooks may run with a narrow PATH).
export function findExe(
  name: string,
  fallbackDirs: string[] = [],
): string | null {
  const dirs = (process.env.PATH ?? "")
    .split(":")
    .filter(Boolean)
    .concat(fallbackDirs);
  for (const dir of dirs) {
    const path = join(dir, name);
    if (isExecutable(path)) return path;
  }
  return null;
}
