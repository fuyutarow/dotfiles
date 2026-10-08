// Applied equally to OLD and NEW subprocesses: deterministic clock and host syscall fixtures.
import { mock } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";

const fixed = Temporal.Instant.from("2026-10-08T12:34:00Z");
Temporal.Now.instant = () => fixed;
Temporal.Now.timeZoneId = () => "UTC";
Temporal.Now.zonedDateTimeISO = () => fixed.toZonedDateTimeISO("UTC");

const realRead = fs.readFileSync;
await mock.module("node:fs", () => ({
  ...fs,
  readFileSync: (path: fs.PathOrFileDescriptor, options?: unknown) => {
    const name = String(path);
    if (name === "/proc/stat") return "cpu  100 0 100 800 0 0 0 0\n";
    if (name === "/proc/meminfo")
      return "MemTotal: 16777216 kB\nMemAvailable: 8388608 kB\n";
    if (name === "/proc/version") return "Linux fixture\n";
    if (name.startsWith("/sys/fs/cgroup/")) return "max\n";
    // Real reads keep their normal overloads; the port passes only utf8 or no options.
    return options === "utf8" ? realRead(path, "utf8") : realRead(path);
  },
  statfsSync: () => ({
    bsize: 4096,
    blocks: 1048576,
    bfree: 524288,
    bavail: 524288,
  }),
}));
await mock.module("node:os", () => ({
  ...os,
  hostname: () => "fixture-host",
  totalmem: () => 16 * 1024 ** 3,
  cpus: () => [{ times: { user: 100, nice: 0, sys: 100, idle: 800, irq: 0 } }],
}));
