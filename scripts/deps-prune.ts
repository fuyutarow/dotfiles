// Consumer: owner/agent. deps prunes only dangling bin links owned by this checkout.
// Zero-install, no argv boundary: safe after restoring deps on a fresh host.
import {
  lstat,
  readdir,
  readlink,
  realpath,
  stat,
  unlink,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, parse, relative, resolve, sep } from "node:path";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";
import { z } from "../agents/hooks/zod.ts";

async function info(path: string, follow = false) {
  const result = await attempt(() => (follow ? stat(path) : lstat(path)));
  if (result.ok) return result.value;
  const parsed = z.looseObject({ code: z.string() }).safeParse(result.error);
  if (parsed.success && ["ENOENT", "ENOTDIR"].includes(parsed.data.code))
    return null;
  return new Error(errorMessage(result.error));
}

// Resolve symlinked ancestors even when the final bin target has already been deleted.
async function targetPath(
  path: string,
  depth = 0,
): Promise<string | undefined | Error> {
  if (depth > 40) return undefined;
  const absolute = resolve(path);
  const root = parse(absolute).root;
  const parts = relative(root, absolute).split(sep);
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    const entry = await info(current);
    if (entry instanceof Error) return entry;
    if (entry?.isSymbolicLink() === true)
      return targetPath(
        resolve(
          dirname(current),
          await readlink(current),
          ...parts.slice(index + 1),
        ),
        depth + 1,
      );
  }
  return absolute;
}

export async function danglingRepoBins(
  root: string,
  binDir: string,
): Promise<string[] | Error> {
  const dir = await info(binDir);
  if (dir instanceof Error) return dir;
  if (dir === null) return [];
  const repo = await realpath(root);
  const dangling: string[] = [];
  for (const name of await readdir(binDir)) {
    const path = join(binDir, name);
    const entry = await info(path);
    if (entry instanceof Error) return entry;
    if (entry?.isSymbolicLink() !== true) continue;
    const live = await info(path, true);
    if (live instanceof Error) return live;
    if (live !== null) continue;
    const target = await targetPath(path);
    if (target instanceof Error) return target;
    if (target !== undefined && target.startsWith(`${repo}${sep}`))
      dangling.push(path);
  }
  return dangling;
}

export async function pruneRepoBins(
  root: string,
  binDir: string,
): Promise<string[] | Error> {
  const removed = await danglingRepoBins(root, binDir);
  if (removed instanceof Error) return removed;
  for (const path of removed) {
    await unlink(path);
    process.stdout.write(`[deps] removed dangling repo bin: ${path}\n`);
  }
  return removed;
}

if (import.meta.main) {
  const result = await attempt(() =>
    pruneRepoBins(
      join(import.meta.dir, ".."),
      join(
        process.env.BUN_INSTALL ?? join(process.env.HOME ?? homedir(), ".bun"),
        "bin",
      ),
    ),
  );
  const failure = result.ok
    ? result.value
    : new Error(errorMessage(result.error));
  if (failure instanceof Error) {
    process.stderr.write(`FATAL: deps bin pruning: ${failure.message}\n`);
    process.exitCode = 2;
  }
}
