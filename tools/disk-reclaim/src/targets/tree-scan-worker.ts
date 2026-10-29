import { lstat, readdir } from "node:fs/promises";
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
    let truncated = false;
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
    const visit = async (root: string): Promise<void> => {
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
      while (pending.length > 0) {
        // A bounded walk stops with a partial (lower-bound) size instead of walking a huge tree.
        if (
          event.data.maxEntries !== undefined &&
          entries >= event.data.maxEntries
        ) {
          truncated = true;
          return;
        }
        // Bound outstanding filesystem requests; serial awaits made large changed roots slow.
        const batch = pending.splice(Math.max(0, pending.length - 64));
        const measured = await Promise.all(
          batch.map(async (node) => {
            const stat = await lstat(node.path);
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
              };
            const names = directory ? await readdir(node.path) : [];
            return { node, allocated: stat.blocks * 512, names, cache };
          }),
        );
        for (const { node, allocated, names, cache } of measured)
          count(node, allocated, names, cache);
      }
    };
    visit(event.data.path).then(
      () => {
        self.postMessage({ kind: "done", entries, bytes, truncated }, []);
      },
      (error: unknown) => {
        self.postMessage({ kind: "error", message: String(error) }, []);
      },
    );
  },
);
