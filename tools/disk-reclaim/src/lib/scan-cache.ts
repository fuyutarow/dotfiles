import { createHash, randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fromThrowable, jsonOf, z } from "../../../shared/src/zod.ts";
import { stateDir } from "../receipt.ts";
import type { Context } from "../targets/index.ts";

const Entry = z.object({ key: z.string(), value: z.unknown() });
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
  const dir = join(ctx?.scanCacheDir ?? stateDir(), "scan-cache");
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
        writeFileSync(temporary, JSON.stringify({ key, value: result }), {
          mode: 0o600,
        });
        renameSync(temporary, file);
      })();
      if (written.isErr())
        ctx?.log(`scan cache unavailable: ${String(written.error)}`);
    },
  };
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
