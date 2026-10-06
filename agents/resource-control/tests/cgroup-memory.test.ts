import { describe, expect, test } from "bun:test";
import { cgroupMemory } from "../lib/cgroup-memory.ts";

// cgroup-memory: a container's limit and working set, read from fixture files.
const GiB = 1024 ** 3;
const HOST = 503.5 * GiB;
const reader =
  (files: Record<string, string>) =>
  (path: string): string | undefined =>
    files[path];

describe("cgroupMemory", () => {
  test("v2 with a limit below the host: limit, and current minus inactive file (Vast, 2026-10-06)", () => {
    const read = reader({
      "/sys/fs/cgroup/memory.max": "183501848576\n",
      "/sys/fs/cgroup/memory.current": "183289466880\n",
      "/sys/fs/cgroup/memory.stat":
        "anon 174124761088\nfile 6868021248\ninactive_file 4927918080\n",
    });
    expect(cgroupMemory(read, HOST)).toEqual({
      limitBytes: 183501848576,
      usedBytes: 183289466880 - 4927918080,
      version: 2,
    });
  });

  test("v2 'max' and a limit at or above the host are no limit", () => {
    expect(
      cgroupMemory(
        reader({
          "/sys/fs/cgroup/memory.max": "max\n",
          "/sys/fs/cgroup/memory.current": "1\n",
        }),
        HOST,
      ),
    ).toBeUndefined();
    expect(
      cgroupMemory(
        reader({
          "/sys/fs/cgroup/memory.max": `${HOST}\n`,
          "/sys/fs/cgroup/memory.current": "1\n",
        }),
        HOST,
      ),
    ).toBeUndefined();
  });

  test("v1 limit and usage minus total_inactive_file", () => {
    const read = reader({
      "/sys/fs/cgroup/memory/memory.limit_in_bytes": `${16 * GiB}\n`,
      "/sys/fs/cgroup/memory/memory.usage_in_bytes": `${10 * GiB}\n`,
      "/sys/fs/cgroup/memory/memory.stat": `cache 1\ntotal_inactive_file ${2 * GiB}\n`,
    });
    expect(cgroupMemory(read, HOST)).toEqual({
      limitBytes: 16 * GiB,
      usedBytes: 8 * GiB,
      version: 1,
    });
  });

  test("no cgroup files (macOS, a bare host): undefined, so the caller keeps the host figure", () => {
    expect(cgroupMemory(reader({}), HOST)).toBeUndefined();
  });

  test("used never goes negative when inactive file exceeds the current count", () => {
    const read = reader({
      "/sys/fs/cgroup/memory.max": `${8 * GiB}\n`,
      "/sys/fs/cgroup/memory.current": `${1 * GiB}\n`,
      "/sys/fs/cgroup/memory.stat": `inactive_file ${2 * GiB}\n`,
    });
    expect(cgroupMemory(read, HOST)?.usedBytes).toBe(0);
  });
});
