// Consumer: owner/agent. deps prunes obsolete bin links owned by this checkout.
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
import { jsonOf, z } from "../agents/hooks/zod.ts";

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

async function ownedRepoBins(
  root: string,
  binDir: string,
): Promise<Array<{ name: string; path: string; dangling: boolean }> | Error> {
  const dir = await info(binDir);
  if (dir instanceof Error) return dir;
  if (dir === null) return [];
  const repo = await realpath(root);
  const owned: Array<{ name: string; path: string; dangling: boolean }> = [];
  for (const name of await readdir(binDir)) {
    const path = join(binDir, name);
    const entry = await info(path);
    if (entry instanceof Error) return entry;
    if (entry?.isSymbolicLink() !== true) continue;
    const target = await targetPath(path);
    if (target instanceof Error) return target;
    if (
      target === undefined ||
      (target !== repo && !target.startsWith(`${repo}${sep}`))
    )
      continue;
    const live = await info(path, true);
    if (live instanceof Error) return live;
    owned.push({ name, path, dangling: live === null });
  }
  return owned;
}

export async function danglingRepoBins(
  root: string,
  binDir: string,
): Promise<string[] | Error> {
  const owned = await ownedRepoBins(root, binDir);
  if (owned instanceof Error) return owned;
  return owned
    .filter((bin) => bin.dangling)
    .map((bin) => bin.path)
    .toSorted();
}

async function readDeclaredBins(root: string): Promise<Set<string> | Error> {
  const result = await attempt(() =>
    Bun.file(join(root, "package.json")).text(),
  );
  if (!result.ok) return new Error(errorMessage(result.error));
  const parsed = jsonOf(
    z.looseObject({
      bin: z.record(z.string(), z.string()),
    }),
  ).safeParse(result.value);
  if (!parsed.success)
    return new Error(
      `invalid package.json bin declaration: ${parsed.error.message}`,
    );
  return new Set(Object.keys(parsed.data.bin));
}

export async function pruneRepoBins(
  root: string,
  binDir: string,
): Promise<string[] | Error> {
  const declaredBins = await readDeclaredBins(root);
  if (declaredBins instanceof Error) return declaredBins;
  const owned = await ownedRepoBins(root, binDir);
  if (owned instanceof Error) return owned;
  const removed = owned
    .filter((bin) => bin.dangling || !declaredBins.has(bin.name))
    .map((bin) => bin.path)
    .toSorted();
  for (const path of removed) {
    await unlink(path);
    process.stdout.write(`[deps] removed obsolete repo bin: ${path}\n`);
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
