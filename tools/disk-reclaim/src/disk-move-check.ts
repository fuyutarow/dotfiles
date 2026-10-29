import { lstat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { collectProcesses } from "./lib/procs.ts";
import { removeTree } from "./lib/remove-tree.ts";
import { loadConfig } from "./engine.ts";
import { deleteApproved } from "./delete.ts";
import { fromAsyncThrowable } from "neverthrow";

// Runs in a killable child: neither an unresponsive filesystem nor a process scan
// may make the parent silently proceed after the request deadline.
async function checkMoveInner(path: string, graveyard: string) {
  const source = resolve(path);
  const destination = resolve(graveyard);
  const home = resolve(process.env.HOME ?? "/");
  if (
    source === "/" ||
    source === home ||
    destination === source ||
    destination.startsWith(`${source}${sep}`) ||
    source.startsWith(`${destination}${sep}`)
  )
    return { verdict: "deny", reason: "protected root or graveyard overlap" };
  let current = source;
  while (current !== dirname(current)) {
    if ((await lstat(current)).isSymbolicLink())
      return { verdict: "deny", reason: `symlink path refused: ${current}` };
    current = dirname(current);
  }
  if (!(await lstat(destination)).isDirectory())
    return { verdict: "unknown", reason: "graveyard is not a directory" };
  const loaded = loadConfig();
  if (loaded.config === null)
    return { verdict: "unknown", reason: loaded.error ?? "config unavailable" };
  const plan = await deleteApproved([source], {
    config: loaded.config,
    yes: false,
    graveyard: destination,
  });
  const row = plan.rows[0];
  if (row === undefined)
    return { verdict: "unknown", reason: "safety plan unavailable" };
  if (!row.allowed) {
    const failed = row.checks.filter((check) => !check.ok);
    const reason = failed.map((check) => check.detail).join("; ");
    return {
      verdict:
        reason.includes("unknown") || reason.includes("cannot inspect")
          ? "unknown"
          : "deny",
      reason,
    };
  }
  const processes = collectProcesses({
    uid: process.getuid?.() ?? -1,
    ignoreUnreadableProcs: loaded.config.ignore_unreadable_procs ?? [],
  });
  const open = processes.openPaths(source);
  if (open.open.length > 0)
    return { verdict: "deny", reason: "live process uses path" };
  if (open.unknown.length > 0)
    return {
      verdict: "unknown",
      reason: `process usage unknown: ${open.unknown.join("; ")}`,
    };
  const result = await removeTree(source, {
    uid: process.getuid?.() ?? -1,
    dryRun: true,
    measureFilesystem: false,
    protection: {
      processes,
      ownerTarget: "delete",
      repoRoots: [...loaded.config.repo_roots, ...loaded.config.repos],
      protectedPaths: loaded.config.protected ?? [],
    },
  });
  if (result.errors.length > 0)
    return {
      verdict: "unknown",
      reason: result.errors.map((e) => e.error).join("; "),
    };
  if (result.refused.length > 0) {
    const reason = result.refused.map((r) => r.reason).join("; ");
    return {
      verdict:
        reason.includes("unknown") || reason.includes("cannot inspect")
          ? "unknown"
          : "deny",
      reason,
    };
  }
  return { verdict: "safe", reason: "preflight passed" };
}
export async function checkMove(path: string, graveyard: string) {
  return (
    await fromAsyncThrowable(() => checkMoveInner(path, graveyard))()
  ).match(
    (result) => result,
    (error) => ({ verdict: "unknown", reason: String(error) }),
  );
}
