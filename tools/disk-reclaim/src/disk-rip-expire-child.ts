import { lstat, statfs } from "node:fs/promises";
import { homedir } from "node:os";
import { loadConfig } from "./engine.ts";
import { ripGraveyardRoot } from "./lib/graveyards.ts";
import { hasForegroundWaiter } from "./receipt.ts";
import { createRipExpiryTarget, safeScope } from "./targets/rip-expire.ts";
import { runRipExpiry } from "./disk-rip-expire-run.ts";
import type { Context } from "./targets/index.ts";

const fail = (message: string): never => {
  process.stderr.write(`${message}\n`);
  process.exit(4);
};
const loaded = loadConfig();
const config = loaded.config ?? fail(loaded.error ?? "config unavailable");
const root = ripGraveyardRoot(process.env, homedir());
if (!(await safeScope(root, process.env.DISK_RIP_ONLY)))
  fail("unverified graveyard scope");
const rootStat = await lstat(root);
if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
  fail("unverified graveyard root");
if (process.env.DISK_RIP_ONLY !== undefined)
  await lstat(process.env.DISK_RIP_ONLY);
let yielded = false;
const ctx: Context = {
  mode: "run",
  explicit: true,
  config,
  only: process.env.DISK_RIP_ONLY,
  log: (line) => {
    process.stderr.write(`${line}\n`);
  },
  yieldForegroundLock: async () => {
    yielded = await hasForegroundWaiter();
    return yielded;
  },
  foregroundLockYielded: () => yielded,
};
const measure = async () => {
  const s = await statfs(root);
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
const fingerprint = async (path: string) => {
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
console.log(
  JSON.stringify(
    await runRipExpiry({
      target: createRipExpiryTarget().target,
      context: ctx,
      fingerprint,
      measure,
      stopOnError: process.env.DISK_RIP_STOP === "1",
    }),
  ),
);
