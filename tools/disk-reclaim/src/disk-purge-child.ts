import { lstat, statfs } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import { loadConfig } from "./engine.ts";
import { protectedReason } from "./lib/protected.ts";
import { purge } from "./targets/purge.ts";
import { readHeadroom } from "./storage.ts";
import { purgeAction } from "./disk-purge-action.ts";
import type { Context } from "./targets/index.ts";

const fail = (message: string): never => {
  process.stderr.write(`${message}\n`);
  process.exit(4);
};
const loaded = loadConfig();
const config = loaded.config ?? fail(loaded.error ?? "config unavailable");
const ctx: Context = {
  mode: "run",
  explicit: true,
  targetName: "purge",
  config,
  only: process.env["DISK_PURGE_ONLY"],
  underPressure: process.env["DISK_PURGE_UNDER_PRESSURE"] === "1",
  headroom: readHeadroom(),
  log: (message) => {
    process.stderr.write(`${message}\n`);
  },
};
const identity = async (path: string) => {
  const s = await lstat(path);
  return JSON.stringify([
    s.dev,
    s.ino,
    s.mode,
    s.uid,
    s.size,
    s.mtimeMs,
    s.ctimeMs,
  ]);
};
const measure = async (path: string) => {
  const s = await statfs(dirname(path));
  return {
    time: Temporal.Now.instant().toString(),
    source: "statfs",
    mount: null,
    filesystem: null,
    available_bytes: s.bavail * s.bsize,
    free_inodes: s.ffree,
    error: null,
  };
};
const action = process.env["DISK_PURGE_ACTION"];
if (action === undefined) {
  const candidates = await purge.plan(ctx);
  // Restore records must remain available while their payloads are rechecked.
  candidates.sort(
    (a, b) =>
      Number(basename(a.path ?? "") === ".record") -
      Number(basename(b.path ?? "") === ".record"),
  );
  const rows = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      fingerprint:
        candidate.verdict === "RECLAIM" && candidate.path !== null
          ? await identity(candidate.path)
          : null,
    })),
  );
  console.log(JSON.stringify(rows));
} else {
  const parsed = jsonOf(
    z.object({ id: z.string(), path: z.string(), fingerprint: z.string() }),
  ).safeParse(action);
  const request = parsed.success ? parsed.data : fail("invalid purge action");
  console.log(
    JSON.stringify(
      await purgeAction(request, {
        target: purge,
        context: ctx,
        identity,
        protection: (path) =>
          protectedReason(path, {
            ownerTarget: "purge",
            repoRoots: [...config.repo_roots, ...config.repos],
            protectedPaths: config.protected ?? [],
            ignoreUnreadableProcs: config.ignore_unreadable_procs ?? [],
          }),
        device: async (path) => (await lstat(path)).dev,
        measure,
        fail,
        completedReason: "purge removal completed",
      }),
    ),
  );
}
