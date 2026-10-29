import { lstat, readdir, statfs } from "node:fs/promises";
import { dirname } from "node:path";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import { loadConfig } from "./engine.ts";
import { protectedReason } from "./lib/protected.ts";
import { createTmpfsTarget } from "./targets/tmpfs.ts";
import { cleanAction } from "./disk-clean-action.ts";
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
  targetName: "tmpfs",
  config,
  only: process.env.DISK_TMPFS_ONLY,
  log: () => {},
};
const target = createTmpfsTarget();
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
const action = process.env.DISK_TMPFS_ACTION;
if (action === undefined) {
  const plan = await target.plan(ctx);
  const mounts = plan.filter((c) => c.id.startsWith("tmpfs-usage:"));
  await Promise.all(
    mounts.flatMap((mount) =>
      mount.path === null ? [] : [readdir(mount.path)],
    ),
  );
  if (mounts.length === 0 && !plan.some((c) => c.verdict === "KEEP"))
    fail("no verified accessible tmpfs mount");
  if (
    mounts.length > 0 &&
    ctx.only !== undefined &&
    !mounts.some(
      (m) =>
        m.path !== null &&
        (ctx.only === m.path || ctx.only?.startsWith(`${m.path}/`) === true),
    )
  )
    fail("requested scope is outside verified tmpfs mounts");
  const candidates = plan.filter((c) => !c.id.startsWith("tmpfs-usage:"));
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
  const request = parsed.success ? parsed.data : fail("invalid tmpfs action");
  console.log(
    JSON.stringify(
      await cleanAction(request, {
        target,
        context: ctx,
        identity,
        protection: (path) =>
          protectedReason(path, {
            ownerTarget: "tmpfs",
            repoRoots: [...config.repo_roots, ...config.repos],
            protectedPaths: config.protected ?? [],
            ignoreUnreadableProcs: config.ignore_unreadable_procs ?? [],
          }),
        device: async (path) => (await lstat(path)).dev,
        measure,
        fail,
        completedReason: "tmpfs removal completed",
      }),
    ),
  );
}
