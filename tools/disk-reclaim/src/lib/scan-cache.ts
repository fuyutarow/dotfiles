import { createHash, randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fromThrowable, jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import type { Context } from "../targets/index.ts";

const Entry = z.object({ key: z.string(), value: z.unknown() });
export const MAX_SCAN_CACHE_ENTRIES = 2048;
const scanSignal = new AsyncLocalStorage<AbortSignal | undefined>();
export const withScanSignal = <T>(
  signal: AbortSignal | undefined,
  work: () => T,
): T => scanSignal.run(signal, work);
const stamp = (entry: string) => {
  const stat = lstatSync(entry);
  return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs];
};

/** Deliberately shallow: no recursive IO on a cache hit. Sizes are estimates. */
export function changeKey(path: string, onProbe?: () => void): string {
  const own = lstatSync(path);
  onProbe?.();
  return JSON.stringify([
    stamp(path),
    own.isDirectory() && !own.isSymbolicLink()
      ? readdirSync(path)
          .toSorted()
          .map((name) => {
            const signature = stamp(join(path, name));
            onProbe?.();
            return [name, signature];
          })
      : [],
  ]);
}

type CacheContext = Pick<Context, "mode" | "scanCacheDir" | "log"> & {
  onProbe?: (() => void) | undefined;
};
export function defaultScanCacheDir(): string {
  const declared = process.env.XDG_CACHE_HOME;
  return join(
    (declared === "" ? undefined : declared) ?? join(homedir(), ".cache"),
    "disk-reclaim",
  );
}

export function scanCache(
  path: string,
  kind: string,
  ctx?: CacheContext,
  extraPaths: string[] = [],
) {
  const enabled = ctx?.mode === "plan";
  const currentKey = () =>
    JSON.stringify([
      changeKey(path, ctx?.onProbe),
      ...extraPaths.map((extra) =>
        fromThrowable(() => changeKey(extra))().unwrapOr(null),
      ),
    ]);
  const key = enabled ? fromThrowable(currentKey)().unwrapOr(null) : null;
  const cacheRoot = ctx?.scanCacheDir ?? defaultScanCacheDir();
  const dir = join(cacheRoot, "scan-cache");
  const file = join(
    dir,
    `${createHash("sha256")
      .update(`${kind}:${resolve(path)}`)
      .digest("hex")}.json`,
  );
  const read =
    key === null
      ? null
      : fromThrowable(() => readFileSync(file, "utf8"))().unwrapOr(null);
  const entry = read === null ? null : jsonOf(Entry).safeParse(read);
  const value =
    entry?.success === true && entry.data.key === key
      ? entry.data.value
      : undefined;
  return {
    value,
    save: (result: unknown) => {
      if (key === null) return;
      const written = fromThrowable(() => {
        // A changing root must never publish a reusable completed measurement.
        if (currentKey() !== key) return;
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        const temporary = `${file}.${randomUUID()}`;
        using cleanup = new DisposableStack();
        cleanup.defer(() => {
          rmSync(temporary, { force: true });
        });
        writeFileSync(temporary, JSON.stringify({ key, value: result }), {
          mode: 0o600,
        });
        renameSync(temporary, file);
        evictOldEntries(dir);
      })();
      if (written.isErr())
        ctx?.log(`scan cache unavailable: ${String(written.error)}`);
    },
  };
}

function evictOldEntries(dir: string): void {
  const entries = fromThrowable(() =>
    readdirSync(dir, { withFileTypes: true }).filter(
      (entry) => entry.isFile() && entry.name.endsWith(".json"),
    ),
  )();
  if (entries.isErr() || entries.value.length <= MAX_SCAN_CACHE_ENTRIES) return;
  const sorted = fromThrowable(() =>
    entries.value
      .map((entry) => {
        const path = join(dir, entry.name);
        return { path, mtimeMs: statSync(path).mtimeMs };
      })
      .toSorted((left, right) => {
        if (left.mtimeMs === right.mtimeMs)
          return left.path.localeCompare(right.path);
        return left.mtimeMs < right.mtimeMs ? -1 : 1;
      }),
  )();
  if (sorted.isErr()) return;
  const keep = Math.floor(MAX_SCAN_CACHE_ENTRIES * 0.75);
  for (const entry of sorted.value.slice(0, sorted.value.length - keep))
    fromThrowable(() => {
      rmSync(entry.path, { force: true });
    })();
}

export function cachedDiscovery(
  path: string,
  kind: string,
  ctx: Context,
  discover: () => string[],
): string[] {
  const cache = scanCache(path, kind, ctx);
  const found = z.array(z.string()).safeParse(cache.value);
  if (found.success) {
    ctx.reportActivity?.(ctx.targetName ?? kind, `cache hit discovery ${path}`);
    return found.data;
  }
  ctx.reportActivity?.(ctx.targetName ?? kind, `discovering ${path}`);
  const rows = discover();
  cache.save(rows);
  return rows;
}

export function checkScanDeadline(ctx?: Context): void {
  (ctx?.signal ?? scanSignal.getStore())?.throwIfAborted();
}
