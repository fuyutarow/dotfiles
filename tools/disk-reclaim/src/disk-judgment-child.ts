const emit = (value: string): void => {
  process.stdout.write(`${value}\n`);
};

import { lstat, statfs } from "node:fs/promises";
import { dirname } from "node:path";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import { loadConfig } from "./engine.ts";
import { judgment } from "./targets/judgment.ts";
import type { Context } from "./targets/index.ts";
import { judgmentAction } from "./disk-judgment-action.ts";

const fail = (message: string): never => {
  process.stderr.write(`${message}\n`);
  process.exit(4);
};
const loaded = loadConfig();
const config = loaded.config ?? fail(loaded.error ?? "config unavailable");
const ctx: Context = {
  mode: "run",
  explicit: true,
  targetName: "judgment",
  config,
  log: () => {},
};
const target = judgment;
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
const action = process.env["DISK_JUDGMENT_ACTION"];
if (action === undefined) {
  const candidates = await target.plan(ctx);
  const rows = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      fingerprint:
        candidate.path === null ? null : await identity(candidate.path),
    })),
  );
  emit(JSON.stringify(rows));
} else {
  const parsed = jsonOf(
    z.object({ id: z.string(), path: z.string(), fingerprint: z.string() }),
  ).safeParse(action);
  const request = parsed.success
    ? parsed.data
    : fail("invalid judgment action");
  emit(
    JSON.stringify(
      await judgmentAction(request, {
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
