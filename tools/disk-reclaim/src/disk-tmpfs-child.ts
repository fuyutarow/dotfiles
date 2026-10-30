import { lstat, readdir, statfs } from "node:fs/promises";
import { fromAsyncThrowable } from "neverthrow";
import { dirname } from "node:path";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import { loadConfig } from "./engine.ts";
import { protectedReason } from "./lib/protected.ts";
import { collectProcesses } from "./lib/procs.ts";
import { createTmpfsTarget } from "./targets/tmpfs.ts";
import { cleanAction, cleanPreflight } from "./disk-clean-action.ts";
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
  only: process.env["DISK_TMPFS_ONLY"],
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
const action = process.env["DISK_TMPFS_ACTION"];
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
  const processes = collectProcesses({
    ignoreUnreadableProcs: config.ignore_unreadable_procs ?? [],
  });
  const rows = await Promise.all(
    candidates.map(async (candidate) => {
      if (candidate.verdict !== "RECLAIM" || candidate.path === null)
        return { candidate, fingerprint: null };
      const path = candidate.path;
      const checked = await fromAsyncThrowable(async () => {
        const fingerprint = await identity(path);
        const reason = protectedReason(path, {
          ownerTarget: "tmpfs",
          repoRoots: [...config.repo_roots, ...config.repos],
          protectedPaths: config.protected ?? [],
          ignoreUnreadableProcs: config.ignore_unreadable_procs ?? [],
          processes,
        });
        const sameDevice =
          (await lstat(path)).dev === (await lstat(dirname(path))).dev;
        const unchanged = (await identity(path)) === fingerprint;
        let verdict = "safe";
        let explanation = candidate.reason;
        if (reason !== null) {
          verdict = "keep";
          explanation = `protected: ${reason}`;
        }
        if (!sameDevice) {
          verdict = "unknown";
          explanation = "candidate filesystem measurement unavailable";
        }
        if (reason === "process paths are unknown") {
          verdict = "unknown";
          explanation = `protected: ${reason}`;
        }
        if (!unchanged) {
          verdict = "changed";
          explanation = "fingerprint changed";
        }
        return {
          candidate,
          fingerprint,
          preview: {
            verdict,
            reason: explanation,
          },
        };
      })();
      if (checked.isErr())
        return {
          candidate,
          fingerprint: null,
          preview: { verdict: "unknown", reason: String(checked.error) },
        };
      return checked.value;
    }),
  );
  console.log(JSON.stringify(rows));
} else {
  const parsed = jsonOf(
    z.object({
      id: z.string(),
      path: z.string(),
      fingerprint: z.string(),
      preview: z.boolean().optional(),
    }),
  ).safeParse(action);
  const request = parsed.success ? parsed.data : fail("invalid tmpfs action");
  console.log(
    JSON.stringify(
      await (request.preview === true ? cleanPreflight : cleanAction)(request, {
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
