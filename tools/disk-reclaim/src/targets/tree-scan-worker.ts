import { lstat, readdir } from "node:fs/promises";
import { fromAsyncThrowable } from "neverthrow";
import { join } from "node:path";
import { scanCache } from "../lib/scan-cache.ts";
import { z } from "@dotfiles/shared/src/zod.ts";

declare var self: Worker;

type ScanNode = {
  path: string;
  parent?: ScanNode;
  bytes: number;
  children: number;
  cache?: ReturnType<typeof scanCache> | undefined;
};
const quiet = (_message: string) => {};
const complete = (node: ScanNode): void => {
  // Preserve completed subdirectories if the parent later stops.
  node.cache?.save(node.bytes);
  const parent = node.parent;
  if (parent === undefined) return;
  parent.bytes += node.bytes;
  parent.children--;
  if (parent.children === 0) complete(parent);
};

self.addEventListener(
  "message",
  (
    event: MessageEvent<{
      path: string;
      cacheDir?: string;
      maxEntries?: number;
    }>,
  ) => {
    let entries = 0;
    const state = { truncated: false };
    let bytes = 0;
    let probes = 0;
    const onProbe = () => {
      probes++;
      if (probes % 128 === 0)
        self.postMessage({ kind: "activity", probes }, []);
    };
    const cacheContext =
      event.data.cacheDir === undefined
        ? undefined
        : {
            mode: "plan" as const,
            scanCacheDir: event.data.cacheDir,
            log: quiet,
            onProbe,
          };
    const visit = async (root: string): Promise<string | null> => {
      const pending: ScanNode[] = [{ path: root, bytes: 0, children: 0 }];
      const count = (
        node: ScanNode,
        allocated: number,
        names: string[],
        cache?: ReturnType<typeof scanCache>,
      ) => {
        entries++;
        bytes += allocated;
        node.bytes = allocated;
        node.children = names.length;
        node.cache = cache;
        for (const name of names)
          pending.push({
            path: join(node.path, name),
            parent: node,
            bytes: 0,
            children: 0,
          });
        if (names.length === 0) complete(node);
        if (entries % 128 === 0)
          self.postMessage({ kind: "progress", entries, bytes }, []);
      };
      const missing = (node: ScanNode, error: unknown) => {
        const parsed = z.object({ code: z.string() }).safeParse(error);
        if (
          !parsed.success ||
          parsed.data.code !== "ENOENT" ||
          node.parent === undefined
        )
          return {
            node,
            allocated: 0,
            names: [],
            cache: undefined,
            error: String(error),
          };
        state.truncated = true;
        for (
          let ancestor: ScanNode | undefined = node.parent;
          ancestor !== undefined;
          ancestor = ancestor.parent
        )
          ancestor.cache = undefined;
        return { node, allocated: 0, names: [], cache: undefined, error: null };
      };
      while (pending.length > 0) {
        // A bounded walk stops with a partial (lower-bound) size instead of walking a huge tree.
        if (
          event.data.maxEntries !== undefined &&
          entries >= event.data.maxEntries
        ) {
          state.truncated = true;
          return null;
        }
        // Bound outstanding filesystem requests; serial awaits made large changed roots slow.
        const batch = pending.splice(Math.max(0, pending.length - 64));
        const measured = await Promise.all(
          batch.map(async (node) => {
            const result = await fromAsyncThrowable(() => lstat(node.path))();
            if (result.isErr()) return missing(node, result.error);
            const stat = result.value;
            onProbe();
            const directory = stat.isDirectory() && !stat.isSymbolicLink();
            const cache =
              directory && cacheContext !== undefined
                ? scanCache(node.path, "allocated-v1", cacheContext)
                : undefined;
            const cached = z.number().nonnegative().safeParse(cache?.value);
            if (cached.success)
              return {
                node,
                allocated: cached.data,
                names: [],
                cache: undefined,
                error: null,
              };
            const names = await fromAsyncThrowable(() =>
              directory ? readdir(node.path) : Promise.resolve([]),
            )();
            if (names.isErr()) return missing(node, names.error);
            return {
              node,
              allocated: stat.blocks * 512,
              names: names.value,
              cache,
              error: null,
            };
          }),
        );
        const failure = measured.find((item) => item.error !== null);
        if (failure !== undefined) return failure.error;
        for (const { node, allocated, names, cache } of measured) {
          count(node, allocated, names, cache);
        }
      }
      return null;
    };
    visit(event.data.path).then(
      (error) => {
        if (error !== null) {
          self.postMessage({ kind: "error", message: error }, []);
          return;
        }
        self.postMessage(
          { kind: "done", entries, bytes, truncated: state.truncated },
          [],
        );
      },
      (error: unknown) => {
        self.postMessage({ kind: "error", message: String(error) }, []);
      },
    );
  },
);
