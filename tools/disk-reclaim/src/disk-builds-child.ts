import { lstat, statfs } from "node:fs/promises";
import { dirname } from "node:path";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import { loadConfig } from "./engine.ts";
import { createBuildsTarget } from "./targets/builds.ts";
import type { Context } from "./targets/index.ts";
import { buildsAction, buildsPreflight } from "./disk-builds-action.ts";

const fail = (message: string): never => {
  process.stderr.write(`${message}\n`);
  process.exit(4);
};
const loaded = loadConfig();
const config = loaded.config ?? fail(loaded.error ?? "config unavailable");
const ctx: Context = {
  mode: "run",
  explicit: true,
  targetName: "builds",
  config,
  log: () => {},
};
const target = createBuildsTarget(undefined, undefined, { includeOwned: true });
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
const action = process.env["DISK_BUILDS_ACTION"];
if (action === undefined) {
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
  const parsed = jsonOf(
    z.object({
      id: z.string(),
      path: z.string(),
      fingerprint: z.string(),
      preview: z.boolean().optional(),
    }),
  ).safeParse(action);
  const request = parsed.success ? parsed.data : fail("invalid builds action");
  console.log(
    JSON.stringify(
      await (request.preview === true ? buildsPreflight : buildsAction)(
        request,
        {
          target,
          context: ctx,
          identity,
          device: async (path) => (await lstat(path)).dev,
          measure,
          fail,
        },
      ),
    ),
  );
}
