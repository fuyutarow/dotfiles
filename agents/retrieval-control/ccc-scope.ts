// Did anything ccc indexes change between two commits? The freshness gate's watermark records a
// git HEAD, and in a repo where ten agents commit every minute or two HEAD moves constantly —
// mostly through append-only records the index excludes. A HEAD mismatch alone therefore said
// "stale" about indexes that a re-index would reproduce byte for byte (firedancer 2026-09-25:
// NO_INDEX, then `index` failing twice on "HEAD moved", three minutes to one search).
//
// The question is answered by ccc's own matcher, run under ccc's own interpreter (ccc_scope.py),
// never by a reimplementation of its globs. Any failure to answer returns null, which callers
// treat as "in scope" — the old, conservative verdict.

import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

// The `ccc` entry point is a uv-tool script whose shebang names the interpreter that can import
// cocoindex_code.
function cccPython(ccc: string): string | null {
  try {
    const first =
      readFileSync(realpathSync(ccc), "utf8").split("\n", 1)[0] ?? "";
    const interpreter = first.startsWith("#!/") ? first.slice(2).trim() : "";
    // Only a Python interpreter can import cocoindex_code; anything else (a test double, a
    // wrapper script) cannot answer, and running ccc_scope.py under it would be meaningless.
    return /\/python[0-9.]*$/.test(interpreter) ? interpreter : null;
  } catch {
    return null;
  }
}

async function capture(
  cmd: string[],
  cwd: string,
  stdin?: string,
): Promise<string | null> {
  const child = Bun.spawn({
    cmd,
    cwd,
    stdin: stdin === undefined ? "ignore" : new Response(stdin),
    stdout: "pipe",
    stderr: "ignore",
    signal: AbortSignal.timeout(30_000),
  });
  const [out, code] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited,
  ]);
  return code === 0 ? out : null;
}

export type ScopeDrift = { changed: number; inScope: string[] };

// null = could not decide (treat as stale). Otherwise the changed paths and the subset ccc
// would index; an empty `inScope` means a re-index at `to` reproduces the index built at `from`.
export async function inScopeChanges(
  project: string,
  ccc: string,
  from: string,
  to: string,
): Promise<ScopeDrift | null> {
  const diff = await capture(
    ["git", "-C", project, "diff", "--name-only", "-z", from, to],
    project,
  );
  if (diff === null) return null;
  const changed = diff.split("\0").filter((p) => p !== "");
  if (changed.length === 0) return { changed: 0, inScope: [] };
  const python = cccPython(ccc);
  if (python === null) return null;
  const out = await capture(
    [python, join(import.meta.dir, "ccc_scope.py"), project],
    project,
    JSON.stringify(changed),
  );
  if (out === null) return null;
  try {
    const inScope: unknown = JSON.parse(out);
    return Array.isArray(inScope) &&
      inScope.every((p): p is string => typeof p === "string")
      ? { changed: changed.length, inScope }
      : null;
  } catch {
    return null;
  }
}
