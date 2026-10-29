import { lstat, readdir, readlink, statfs } from "node:fs/promises";
import { dirname, join } from "node:path";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import { loadConfig } from "./engine.ts";
import { createCccIndexDbTarget } from "./targets/ccc-index-db.ts";
import type { Context } from "./targets/index.ts";
import { cccIndexDbAction } from "./disk-ccc-index-db-action.ts";

const fail = (message: string): never => {
  process.stderr.write(`${message}\n`);
  process.exit(4);
};
const loaded = loadConfig();
const config = loaded.config ?? fail(loaded.error ?? "config unavailable");
const ctx: Context = {
  mode: "run",
  explicit: true,
  targetName: "ccc-index-db",
  config,
  log: () => {},
  reportPlanError: fail,
};
const target = createCccIndexDbTarget();
const identity = async (path: string): Promise<string> => {
  const s = await lstat(path);
  const children =
    s.isDirectory() && !s.isSymbolicLink()
      ? await Promise.all(
          (await readdir(path))
            .toSorted()
            .map(async (name) => [name, await identity(join(path, name))]),
        )
      : [];
  return JSON.stringify([
    s.dev,
    s.ino,
    s.mode,
    s.uid,
    s.size,
    s.mtimeMs,
    s.ctimeMs,
    s.isSymbolicLink() ? await readlink(path) : null,
    children,
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
const action = process.env.DISK_CCC_INDEX_DB_ACTION;
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
    z.object({ id: z.string(), path: z.string(), fingerprint: z.string() }),
  ).safeParse(action);
  const request = parsed.success
    ? parsed.data
    : fail("invalid ccc-index-db action");
  console.log(
    JSON.stringify(
      await cccIndexDbAction(request, {
        target,
        context: ctx,
        identity,
        device: async (path) => (await lstat(path)).dev,
        measure,
        fail,
      }),
    ),
  );
}
