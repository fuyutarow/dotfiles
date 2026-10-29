import { lstat, statfs } from "node:fs/promises";
import { dirname } from "node:path";
import { loadConfig } from "./engine.ts";
import { protectedReason } from "./lib/protected.ts";
import { createCleanTarget } from "./targets/clean.ts";
import type { Context } from "./targets/index.ts";
import { cleanBunProbe } from "./disk-clean-bun.ts";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import { cleanAction } from "./disk-clean-action.ts";

const fail = (message: string): never => {
  process.stderr.write(`${message}\n`);
  process.exit(4);
};
const loaded = loadConfig();
const config = loaded.config ?? fail(loaded.error ?? "config unavailable");
const ctx: Context = {
  mode: "run",
  explicit: true,
  targetName: "clean",
  config,
  log: () => {},
};
const target = createCleanTarget(undefined, undefined, async (home) => {
  const timeout =
    Number(process.env.DISK_CLEAN_DEADLINE) -
    Temporal.Now.instant().epochMilliseconds -
    500;
  if (timeout <= 0) return fail("deadline expired before Bun cache cleanup");
  const result = await cleanBunProbe(home, timeout);
  if (result.timedOut || result.exit === null)
    return fail("Bun cache cleanup termination unavailable or timed out");
  if (result.exit !== 0) return fail(`Bun cache cleanup failed: ${result.err}`);
  return true;
});
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
async function act(action: string) {
  const parsed = jsonOf(
    z.object({ id: z.string(), path: z.string(), fingerprint: z.string() }),
  ).safeParse(action);
  const request = parsed.success ? parsed.data : fail("invalid clean action");
  return cleanAction(request, {
    target,
    context: ctx,
    identity,
    protection: (path) =>
      protectedReason(path, {
        ownerTarget: "clean",
        repoRoots: [...ctx.config.repo_roots, ...ctx.config.repos],
        protectedPaths: ctx.config.protected ?? [],
        ignoreUnreadableProcs: ctx.config.ignore_unreadable_procs ?? [],
      }),
    device: async (path) => (await lstat(path)).dev,
    measure,
    fail,
  });
}
if (process.env.DISK_CLEAN_ACTION === undefined) {
  const candidates = await target.plan(ctx);
  const rows = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      fingerprint:
        candidate.path === null ? null : await identity(candidate.path),
    })),
  );
  console.log(JSON.stringify(rows));
} else {
  console.log(JSON.stringify(await act(process.env.DISK_CLEAN_ACTION)));
}
