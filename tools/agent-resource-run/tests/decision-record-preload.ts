// Test-only proc/cgroup fixture and virtual confirmation clock. No real GPU or scope.
import { expect, mock } from "bun:test";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { jsonOf, z } from "../../shared/src/zod.ts";
const read = fs.readFile;
const directory = fs.readdir;
const open = fs.opendir;
const root = process.env.ARR_RECORD_FIXTURE_ROOT;
if (root === undefined) expect.unreachable("missing record fixture root");
const map = (path: string) =>
  path.startsWith("/proc/") ? join(root, path.slice(1)) : path;
let clock = 0;
performance.now = () => clock;
Bun.sleep = async (duration) => {
  clock += Number(duration);
  if (clock === 27000 && process.env.ARR_RECORD_REPLACE_OWNER === "1")
    await fs.copyFile(
      join(root, "next-owner.json"),
      join(root, "gpu-owner.json"),
    );
};
await mock.module("node:fs/promises", () => ({
  ...fs,
  readFile: async (path: string, encoding: "utf8") => {
    if (path === "/proc/self/cgroup") {
      const receipt = jsonOf(z.object({ scope_unit: z.string() })).safeParse(
        process.env.AGENT_RESOURCE_ADMISSION_RECEIPT,
      );
      return `0::/fixture/${receipt.success ? receipt.data.scope_unit : "invalid"}\n`;
    }
    if (path.startsWith("/sys/fs/cgroup/fixture/")) {
      if (path.endsWith("/memory.swap.max")) return "0";
      if (path.endsWith("/pids.peak")) return "1";
      if (path.endsWith("/memory.max") || path.endsWith("/memory.high"))
        return process.env.AGENT_RESOURCE_HOST_RAM_BYTES;
    }
    return read(map(path), encoding);
  },
  readdir: (path: string) =>
    directory(path === "/proc" ? join(root, "proc") : path),
  opendir: (path: string) => open(map(path)),
}));
