import { mock } from "bun:test";
import * as cp from "node:child_process";
import * as fs from "node:fs/promises";
import * as syncFs from "node:fs";

function forbidden(): never {
  process.stderr.write("FORBIDDEN_PROCESS_OR_NETWORK\n");
  process.exit(97);
}
Bun.spawn = forbidden;
Bun.spawnSync = forbidden;
Bun.write = forbidden;
globalThis.fetch = Object.assign(forbidden, { preconnect: forbidden });
await mock.module("node:child_process", () => ({
  ...cp,
  spawn: forbidden,
  spawnSync: forbidden,
  exec: forbidden,
  execSync: forbidden,
  execFile: forbidden,
  execFileSync: forbidden,
  fork: forbidden,
}));
await mock.module("node:fs/promises", () => ({
  ...fs,
  writeFile: forbidden,
  appendFile: forbidden,
  rename: forbidden,
  mkdir: forbidden,
  unlink: forbidden,
  rm: forbidden,
}));
await mock.module("node:fs", () => ({
  ...syncFs,
  writeFileSync: forbidden,
  appendFileSync: forbidden,
  renameSync: forbidden,
  mkdirSync: forbidden,
  unlinkSync: forbidden,
  rmSync: forbidden,
}));
