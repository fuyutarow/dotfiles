import { lstat, statfs } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import { loadConfig } from "./engine.ts";
import { createWorkspacesTarget } from "./targets/workspaces.ts";
import type { Context } from "./targets/index.ts";
import { workspacesAction } from "./disk-workspaces-action.ts";
import { stateDir } from "./receipt.ts";

const fail = (message: string): never => {
  process.stderr.write(`${message}\n`);
  process.exit(4);
};
const loaded = loadConfig();
const config = loaded.config ?? fail(loaded.error ?? "config unavailable");
const ctx: Context = {
  mode: "run",
  explicit: true,
  targetName: "workspaces",
  config,
  log: () => {},
  reportPlanError: (message) => fail(message),
  recordRecovery: (candidate, recovery) => {
    const dir = join(stateDir(), "disk-receipts");
    // sync-ok: the legacy callback must persist recovery before forget begins.
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    // sync-ok: the legacy callback must persist recovery before forget begins.
    writeFileSync(
      join(dir, `${crypto.randomUUID()}.json`),
      JSON.stringify({
        schema: "disk.workspace-recovery/1",
        candidate,
        recovery,
      }),
      { flag: "wx", mode: 0o600 },
    );
  },
};
const target = createWorkspacesTarget({
  fetch: process.env["DISK_WORKSPACES_FETCH"] === "1",
});
const availability = await target.available(ctx);
if (!availability.available)
  fail(availability.skip_reason ?? "workspaces unavailable");
const identity = async (path: string) => {
  const s = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    return fail(`workspace identity unavailable: ${String(error)}`);
  });
  if (s === null) return "missing";
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
const action = process.env["DISK_WORKSPACES_ACTION"];
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
    : fail("invalid workspaces action");
  console.log(
    JSON.stringify(
      await workspacesAction(request, {
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
