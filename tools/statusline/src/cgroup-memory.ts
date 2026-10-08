// The memory a process here may actually use when a cgroup caps it — a container's limit, not the
// host's RAM. /proc/meminfo inside a container reports the HOST: on Vast (2026-10-06) it said 503 GB
// with 307 GB available while the container's own limit was 171 GiB with 162 GiB of it anonymous
// memory, one step from an OOM kill. The statusline Sys row read 42% and agent-resource-run admitted
// against the host figure. Both now read this first.
//
// cgroup v2: memory.max ("max" = no limit), memory.current, memory.stat inactive_file.
// cgroup v1: memory/memory.limit_in_bytes, memory.usage_in_bytes, memory.stat total_inactive_file.
// "Used" is current minus inactive file cache (what the kernel can drop without OOM — the working
// set, as `docker stats` and Kubernetes count it). A limit at or above the host total is no limit.
// Zero-dep and pure over a file reader, so tests feed fixture text and nothing here throws.

export type CgroupMemory = {
  limitBytes: number;
  usedBytes: number;
  version: 1 | 2;
};
export type ReadText = (path: string) => string | undefined;

const ROOT = "/sys/fs/cgroup";

const int = (text: string | undefined): number | undefined => {
  const t = text?.trim();
  if (t === undefined || !/^\d+$/u.test(t)) return undefined;
  return Number(t);
};

const statField = (stat: string | undefined, key: string): number => {
  const line = stat?.split("\n").find((l) => l.startsWith(`${key} `));
  return int(line?.slice(key.length + 1)) ?? 0;
};

/** The cgroup's memory limit and working set, or undefined when no cgroup caps memory below the host. */
export function cgroupMemory(
  read: ReadText,
  hostTotalBytes: number,
): CgroupMemory | undefined {
  const v2Limit = read(`${ROOT}/memory.max`)?.trim();
  if (v2Limit !== undefined) {
    const limit = int(v2Limit); // "max" parses to undefined: unlimited
    const current = int(read(`${ROOT}/memory.current`));
    if (limit === undefined || current === undefined || limit >= hostTotalBytes)
      return undefined;
    const inactive = statField(read(`${ROOT}/memory.stat`), "inactive_file");
    return {
      limitBytes: limit,
      usedBytes: Math.max(0, current - inactive),
      version: 2,
    };
  }
  const limit = int(read(`${ROOT}/memory/memory.limit_in_bytes`));
  const usage = int(read(`${ROOT}/memory/memory.usage_in_bytes`));
  if (limit === undefined || usage === undefined || limit >= hostTotalBytes)
    return undefined;
  const inactive = statField(
    read(`${ROOT}/memory/memory.stat`),
    "total_inactive_file",
  );
  return {
    limitBytes: limit,
    usedBytes: Math.max(0, usage - inactive),
    version: 1,
  };
}
