import { createHash } from "node:crypto";
import {
  lstat,
  readdir,
  readFile,
  realpath,
  rename,
  writeFile,
} from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fromAsyncThrowable } from "neverthrow";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import { acquirePlanLock } from "../lib/plan-lock.ts";
import { defaultScanCacheDir } from "../lib/scan-cache.ts";
import type { Context } from "./index.ts";

export const BUILD_NAMES = new Set([
  "target",
  "node_modules",
  "build",
  "dist",
  ".venv",
]);
const Cursor = z.object({
  identity: z.string(),
  pending: z.array(
    z.object({ path: z.string(), depth: z.number().int().min(0).max(4) }),
  ),
  known: z.array(z.string()),
  seen: z.array(z.string()),
  failed: z.array(z.string()),
});
type Cursor = z.output<typeof Cursor>;
const within = (path: string, root: string) =>
  resolve(path) === path && (path === root || path.startsWith(`${root}/`));

async function loadCursor(
  file: string,
  root: string,
  identity: string,
): Promise<Cursor> {
  const fresh = {
    identity,
    pending: [{ path: root, depth: 0 }],
    known: [],
    seen: [],
    failed: [],
  };
  const read = await fromAsyncThrowable(() => readFile(file, "utf8"))();
  if (read.isErr()) return fresh;
  const parsed = jsonOf(Cursor).safeParse(read.value);
  if (!parsed.success || parsed.data.identity !== identity) return fresh;
  const state = parsed.data;
  const valid =
    state.pending.every(
      ({ path, depth }) =>
        within(path, root) &&
        (path === root ? 0 : relative(root, path).split("/").length) === depth,
    ) &&
    [...state.known, ...state.seen].every(
      (path) =>
        within(path, root) &&
        path !== root &&
        relative(root, path).split("/").length <= 5 &&
        BUILD_NAMES.has(path.split("/").at(-1) ?? ""),
    );
  return valid ? state : fresh;
}

async function saveCursor(file: string, state: Cursor): Promise<void> {
  const pending = `${file}.${process.pid}.tmp`;
  await writeFile(pending, JSON.stringify(state), { mode: 0o600 });
  await rename(pending, file);
}

function enqueueChildren(
  entry: Cursor["pending"][number],
  names: string[],
  state: Cursor,
  known: Set<string>,
  seen: Set<string>,
): void {
  for (const name of names) {
    const path = join(entry.path, name);
    if (BUILD_NAMES.has(name)) {
      known.add(path);
      seen.add(path);
    } else if (entry.depth < 4)
      state.pending.push({ path, depth: entry.depth + 1 });
  }
}

/** One cooperative discovery slice. Completed directories survive stage termination. */
export async function discoverBuilds(
  input: string,
  ctx: Context,
  limits: {
    directories?: number;
    milliseconds?: number;
    now?: () => number;
  } = {},
): Promise<string[]> {
  const root = await realpath(input);
  const stat = await lstat(root);
  const identity = `${stat.dev}:${stat.ino}`;
  const directory = join(
    ctx.scanCacheDir ?? defaultScanCacheDir(),
    "build-discovery",
    createHash("sha256").update(root).digest("hex"),
  );
  const file = join(directory, "cursor.json");
  const lock = await acquirePlanLock(directory);
  const state = await loadCursor(file, root, identity);
  if (!lock.ok) {
    ctx.reportPlanError?.(`build discovery deferred: ${lock.error}`, true);
    return state.known;
  }
  using _release = { [Symbol.dispose]: lock.release };
  if (state.pending.length === 0) {
    state.pending.push({ path: root, depth: 0 });
    state.failed = [];
  }
  const now = limits.now ?? (() => performance.now());
  const until = now() + (limits.milliseconds ?? 10_000);
  let visited = 0;
  const known = new Set(state.known);
  const seen = new Set(state.seen);
  while (
    state.pending.length > 0 &&
    visited < (limits.directories ?? 4096) &&
    now() < until &&
    ctx.signal?.aborted !== true
  ) {
    const entry = state.pending[0];
    if (entry === undefined) break;
    const children = await fromAsyncThrowable(async () => {
      const current = await lstat(entry.path);
      if (
        !current.isDirectory() ||
        current.dev !== stat.dev ||
        (await realpath(entry.path)) !== entry.path
      )
        return [];
      return readdir(entry.path, { withFileTypes: true });
    })();
    if (children.isErr()) {
      ctx.log(
        `build discovery skipped ${entry.path}: ${String(children.error)}`,
      );
      state.failed.push(entry.path);
    }
    // Dirent filtering avoids statting every file in package caches; never follow symlinks.
    const directories = children.isOk()
      ? children.value.filter((child) => child.isDirectory())
      : [];
    state.pending.shift();
    enqueueChildren(
      entry,
      directories.map((child) => child.name),
      state,
      known,
      seen,
    );
    visited++;
    state.known = [...known];
    state.seen = [...seen];
    if (state.pending.length === 0) {
      state.known = [...seen];
      state.seen = [];
    }
    await saveCursor(file, state);
  }
  const progress = `discovery visited=${visited} pending=${state.pending.length} known=${state.known.length}`;
  ctx.reportActivity?.("builds", progress);
  if (state.pending.length > 0)
    ctx.reportPlanError?.(`partial build ${progress}`, true);
  if (state.failed.length > 0)
    ctx.reportPlanError?.(
      `build discovery could not inspect ${state.failed.length} directories`,
      true,
    );
  return state.known;
}
