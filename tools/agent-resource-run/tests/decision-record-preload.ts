// Test-only proc/cgroup fixture. No real GPU or scope is used.
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
await mock.module("node:fs/promises", () => ({
  ...fs,
  readFile: async (path: string, encoding: "utf8") => {
    if (path === "/proc/self/cgroup") {
      const receipt = jsonOf(z.object({ scope_unit: z.string() })).safeParse(
        process.env.AGENT_RESOURCE_ADMISSION_RECEIPT,
      );
      const scope = receipt.success ? receipt.data.scope_unit : "invalid";
      return `0::/fixture/${process.env.ARR_SCOPE_MISMATCH === "1" ? "outside" : scope}\n`;
    }
    if (path.startsWith("/sys/fs/cgroup/fixture/")) {
      if (path.endsWith("/memory.swap.max")) return "0";
      if (path.endsWith("/pids.peak")) return "1";
      if (path.endsWith("/memory.max"))
        return process.env.AGENT_RESOURCE_HOST_RAM_BYTES;
      if (path.endsWith("/memory.high")) {
        const receipt = jsonOf(
          z.object({ memory_high_bytes: z.number() }),
        ).safeParse(process.env.AGENT_RESOURCE_ADMISSION_RECEIPT);
        const requested = receipt.success ? receipt.data.memory_high_bytes : 0;
        return String(Math.floor(requested / 4096) * 4096);
      }
    }
    return read(map(path), encoding);
  },
  readdir: (path: string) =>
    directory(path === "/proc" ? join(root, "proc") : path),
  opendir: (path: string) => open(map(path)),
}));
