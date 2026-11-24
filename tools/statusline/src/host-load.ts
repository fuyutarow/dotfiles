import { renderUnavailable, unavailable } from "#src/ansi.ts";
import { memReading, type MemReading } from "#src/host-model.ts";
import { sysRow, formatBytes, type HostLoad } from "#src/host-display.ts";
export type { MemReading } from "#src/host-model.ts";
export type { HostLoad } from "#src/host-display.ts";
// Host load — CPU · RAM · VRAM · Disk — read and rendered as the statusline's Sys row. Consumers:
// tools/statusline/src/statusline.ts (row 5) and `s` in zsh/aliases.zsh (one row, now).
// GPU data comes exclusively from tools/shared/src/gpu-sampler.ts state.
import { readFile } from "node:fs/promises";
import { cpus, totalmem } from "node:os";
import { Result } from "@dotfiles/shared/src/result.ts";
import {
  diskReadingsAsync,
  IS_WSL,
  tmpfsReading,
  tmpReadingsAsync,
} from "#src/storage.ts";
import { cgroupMemory } from "#src/cgroup-memory.ts";
import { z } from "#src/zod.ts";
import { sampleCccIndexing } from "#src/ccc-indexing.ts";
import {
  gpuReadFromState,
  readGpuState,
  type GpuState,
} from "@dotfiles/shared/src/gpu-samples.ts";
import {
  execAsyncBounded,
  readJsonAsync,
  within,
  writeCacheAsync,
} from "#src/bounded.ts";
import {
  gpuStalled,
  missing,
  stale,
  toolFailed,
  unparsable,
  type ReadError,
} from "#src/errors.ts";

const HOME = process.env["HOME"] ?? "";

// Shared shape for a "used/total" memory-style reading (RAM, VRAM): both the fraction string
// AND the percentage, since render() needs the percentage to threshold-color the segment the
// same way every other percentage in this file is colored (pctFmt) — a plain fraction alone
// cannot drive that.
// GPU observations belong to the shared owner. Rendering never launches a sampler.
function vramFromState(
  state: GpuState | undefined,
): Result<MemReading, ReadError> {
  // A recorded failure is current evidence, even when the last good sample is old.
  // Pausing an admitted GPU job is intentional and must never become a stall alert.
  if (
    state !== undefined &&
    state.paused !== true &&
    state.why?.startsWith("probe paused:") !== true &&
    (state.unresponsiveSince !== undefined ||
      (state.consecutiveProbeMisses ?? 0) > 0)
  ) {
    const since = Temporal.Instant.fromEpochMilliseconds(
      state.unresponsiveSince ?? state.attemptAt,
    ).toZonedDateTimeISO("Asia/Tokyo");
    const time = `${String(since.hour).padStart(2, "0")}:${String(since.minute).padStart(2, "0")}`;
    return Result.err(gpuStalled(time));
  }
  const result = gpuReadFromState(
    state?.paused === true
      ? { ...state, unresponsiveSince: undefined, why: undefined }
      : state,
  );
  if (!result.ok) return Result.err(stale("gpu-sampler", result.why));
  const d = result.value;
  const reading = memReading(d.memUsedGiB, d.memTotalGiB);
  return reading === undefined
    ? Result.err(stale("gpu-sampler", "stale (invalid GPU memory)"))
    : Result.ok({
        ...reading,
        gpuNow: d.nowPct,
      });
}
// Host RAM. Linux reads /proc/meminfo (instant, no subprocess); MemAvailable (not MemFree) is
// what "used" is measured against, because it already accounts for reclaimable page cache, which
// MemFree does not, so MemFree would read as chronically "almost full" on a healthy box. A cgroup
// limit, when one applies, replaces the host total.
// macOS: `vm_stat` (a few ms, no privileges) for the page counts, os.totalmem() for the size.
// "Used" is Activity Monitor's Memory Used — app memory (anonymous minus purgeable pages) + wired +
// compressed — NOT total minus "Pages free": macOS keeps free pages near zero by caching files, so
// that would read as chronically full, the same trap MemFree is on Linux. Not `top -l 1`: its
// PhysMem "used" counts that file cache too, and it costs a full process-table pass.
const VmStatPage = z.string().regex(/^\d+$/u).transform(Number);
export function parseVmStat(
  raw: string,
  totalBytes: number,
): Result<MemReading, ReadError> {
  const size = raw.match(/page size of (\d+) bytes/u)?.[1];
  const pages = (label: string): number | undefined => {
    const line = raw.split("\n").find((part) => part.startsWith(`${label}:`));
    const value = VmStatPage.safeParse(
      line?.split(/\s+/u).pop()?.replace(/\.$/u, ""),
    );
    return value.success ? value.data : undefined;
  };
  const wired = pages("Pages wired down");
  const compressed = pages("Pages occupied by compressor");
  const anonymous = pages("Anonymous pages");
  const purgeable = pages("Pages purgeable");
  if (
    size === undefined ||
    wired === undefined ||
    compressed === undefined ||
    anonymous === undefined ||
    purgeable === undefined
  )
    return Result.err(unparsable("vm_stat output"));
  const usedBytes =
    (wired + compressed + Math.max(0, anonymous - purgeable)) * Number(size);
  const reading = memReading(usedBytes / 1024 ** 3, totalBytes / 1024 ** 3);
  return reading === undefined
    ? Result.err(unparsable("vm_stat output"))
    : Result.ok(reading);
}
const CGROUP_MEMORY_PATHS = [
  "/sys/fs/cgroup/memory.max",
  "/sys/fs/cgroup/memory.current",
  "/sys/fs/cgroup/memory.stat",
  "/sys/fs/cgroup/memory/memory.limit_in_bytes",
  "/sys/fs/cgroup/memory/memory.usage_in_bytes",
  "/sys/fs/cgroup/memory/memory.stat",
];
async function linuxRam(): Promise<Result<MemReading, ReadError>> {
  const raw = await readFile("/proc/meminfo", "utf8").catch(() => null);
  if (raw === null) return Result.err(missing("/proc/meminfo"));
  const kb = (label: string) =>
    raw
      .split("\n")
      .find((line) => line.startsWith(`${label}:`))
      ?.split(/\s+/u)[1];
  const totalText = kb("MemTotal");
  const availText = kb("MemAvailable");
  if (totalText === undefined || availText === undefined)
    return Result.err(
      unparsable("meminfo", "meminfo lacks MemTotal/MemAvailable"),
    );
  const totalKb = Number(totalText);
  const availKb = Number(availText);
  const texts = new Map<string, string>();
  const read = await Promise.all(
    CGROUP_MEMORY_PATHS.map((path) =>
      readFile(path, "utf8").then(
        (text) => [path, text] as const,
        () => null,
      ),
    ),
  );
  for (const entry of read) if (entry !== null) texts.set(entry[0], entry[1]);
  const cg = cgroupMemory((path) => texts.get(path), totalKb * 1024);
  if (cg !== undefined) {
    const capped = memReading(
      cg.usedBytes / 1024 ** 3,
      cg.limitBytes / 1024 ** 3,
    );
    return capped === undefined
      ? Result.err(unparsable("cgroup memory"))
      : Result.ok({ ...capped, frac: `${capped.frac} cgroup` });
  }
  const reading = memReading(
    (totalKb - availKb) / 1024 / 1024,
    totalKb / 1024 / 1024,
  );
  return reading === undefined
    ? Result.err(unparsable("meminfo"))
    : Result.ok(reading);
}
/** Host RAM for this platform: the one reader the Sys row, `s` and the metrics mode share. */
export async function readRam(): Promise<Result<MemReading, ReadError>> {
  if (process.platform !== "darwin") return linuxRam();
  const raw = await execAsyncBounded("vm_stat", "vm_stat", [], 2000);
  if (raw.isErr()) return Result.err(toolFailed("vm_stat", raw.error.why));
  return parseVmStat(raw.value, totalmem());
}

// One /proc/stat snapshot alone cannot give a CPU percentage — its counters are cumulative
// jiffies since boot, so a percentage needs the DELTA between two snapshots. Each statusline
// render is a fresh process (see this file's header note), so that second snapshot has to be
// the previous render's, kept on disk — same shape as AGENT_NAME_CACHE / RC_PROBE_CACHE above.
export const CPU_CACHE = `${HOME}/.cache/claude/statusline-cpu.json`;
export const CpuSampleSchema = z.object({
  total: z.number(),
  idle: z.number(),
  at: z.number().optional(), // epoch ms the sample was taken; only the cached baseline carries it
});
export type CpuSample = z.output<typeof CpuSampleSchema>;
export const CPU_BASELINE_MIN_MS = 2_000;
export const CPU_BASELINE_MAX_MS = 60_000;
// Aggregate "cpu  ..." line (not a per-core "cpu0 ..." line): user+nice+system+idle+iowait+
// irq+softirq+steal[+guest+guest_nice]. idle time is idle+iowait; total is the sum of every
// field. On macOS (no /proc) the same cumulative counters come from os.cpus() — libuv's
// host_processor_info, per-core ms since boot — summed over cores: no subprocess, and the same
// two-sample delta. Not `top -l 2`: its first sample is the since-boot average, so a real
// percentage costs a second sample ~1 s later (measured 1.9 s), most of ENRICHMENT_TIMEOUT_MS.
// The units differ (jiffies vs ms) but a host only ever diffs against its own kind.
function macCpuSample(): Result<CpuSample, ReadError> {
  const cores = cpus();
  if (cores.length === 0)
    return Result.err(unparsable("os.cpus()", "os.cpus() returned no cores"));
  let total = 0;
  let idle = 0;
  for (const { times } of cores) {
    total += times.user + times.nice + times.sys + times.idle + times.irq;
    idle += times.idle;
  }
  return total > 0
    ? Result.ok({ total, idle })
    : Result.err(unparsable("os.cpus()", "os.cpus() counters are zero"));
}
async function readCpuSample(): Promise<Result<CpuSample, ReadError>> {
  if (process.platform === "darwin") return macCpuSample();
  const raw = await readFile("/proc/stat", "utf8").catch(() => null);
  if (raw === null) return Result.err(missing("/proc/stat"));
  const line = raw.split("\n").find((part) => part.startsWith("cpu "));
  if (line === undefined || line === "")
    return Result.err(unparsable("/proc/stat", "/proc/stat has no cpu line"));
  const fields = line.trim().split(/\s+/u).slice(1).map(Number);
  const idle = (fields[3] ?? 0) + (fields[4] ?? 0);
  const total = fields.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  return Number.isFinite(idle) && total > 0
    ? Result.ok({ total, idle })
    : Result.err(unparsable("/proc/stat", "/proc/stat cpu line unparsable"));
}
export async function cpuPct(
  resolveCache = false,
): Promise<Result<number, ReadError>> {
  const sampled = await readCpuSample();
  if (sampled.isErr()) return sampled;
  const sample = sampled.value;
  const now = Temporal.Now.instant().epochMilliseconds;
  const prev = await readJsonAsync(CPU_CACHE, CpuSampleSchema, resolveCache);
  const keep =
    prev?.at !== undefined && within(prev.at, now, CPU_BASELINE_MIN_MS);
  if (!keep)
    await writeCacheAsync(CPU_CACHE, { ...sample, at: now }, resolveCache);
  if (prev === undefined)
    return Result.err(
      stale("cpu baseline", "no earlier sample to diff against"),
    );
  if (prev.at === undefined || !within(prev.at, now, CPU_BASELINE_MAX_MS))
    return Result.err(
      stale("cpu baseline", "no earlier sample from the last 60s"),
    );
  const dTotal = sample.total - prev.total;
  const dIdle = sample.idle - prev.idle;
  if (dTotal <= 0)
    return Result.err(stale("cpu baseline", "no ticks since the last sample"));
  return Result.ok(Math.max(0, Math.min(100, (1 - dIdle / dTotal) * 100)));
}
// Sys row: "CPU NN% · RAM NN% (X.X/Y.YG) · VRAM NN% (X.X/Y.YG) · Disk …" — each reading a value
// or `n/a (<why>)` — host resource usage, always its own row like Job (never folded into Rate, which is API budget, not host load). All three
// percentages share the same green/yellow/red pctFmt threshold as every other percentage in
// this file; the fraction rides alongside each, dimmed, as supporting detail — same
// percent-then-dim-detail shape rl5Segment/rl7Segment already use for their reset countdowns.
export interface HostMetrics {
  cpu: string;
  ram: string;
  tmp: string;
}

/** Plain host metrics shared with integrations that need the Sys row's CPU and RAM samplers. */
export async function readHostMetrics(): Promise<HostMetrics> {
  const cpu = (await cpuPct()).match({
    ok: (value) => `${Math.round(value)}%`,
    err: (error) => renderUnavailable(unavailable(error.message)),
  });
  const ram = (await readRam()).match({
    ok: (value) => value.frac,
    err: (error) => renderUnavailable(unavailable(error.message)),
  });
  const tmp = (await tmpfsReading()).match({
    ok: (value) =>
      `${formatBytes(value.availableBytes)} free · ${value.freeInodes}i`,
    err: (error) => renderUnavailable(unavailable(error.message)),
  });
  return { cpu, ram, tmp };
}

/** Async render-path sample; host readings run independently and retain explicit unknowns. */
export async function readHostLoadAsync(): Promise<Omit<HostLoad, "disks">> {
  const [cpu, ram, vram, tmp] = await Promise.all([
    cpuPct(true),
    readRam(),
    vramGatedAsync(),
    tmpReadingsAsync(),
  ]);
  return { cpuPct: cpu, ram, vram, tmp };
}
async function vramFracAsync(): Promise<Result<MemReading, ReadError>> {
  const state = await readGpuState();
  const reading = vramFromState(state);
  if (reading.isErr()) return reading;
  const cccIndexing = await sampleCccIndexing({
    cachePath: `${HOME}/.cache/claude/statusline-ccc.json`,
  });
  return Result.ok({ ...reading.value, cccIndexing });
}
async function vramGatedAsync(): Promise<
  Result<MemReading, ReadError> | undefined
> {
  if (
    !gpuSamplingSupported(
      process.platform,
      Bun.which("nvidia-smi", { PATH: process.env["PATH"] ?? "" }) !== null,
    )
  )
    return undefined;
  return vramFracAsync();
}
export function gpuSamplingSupported(
  platform: string,
  nvidiaOnPath: boolean,
): boolean {
  return platform !== "darwin" || nvidiaOnPath;
}
/** The Sys row exactly as the statusline prints it. */
// Standalone (`s`): render the available observations; cold or expired GPU state is explicit.
async function main(): Promise<void> {
  const tmp = await tmpReadingsAsync();
  process.stdout.write(
    `${sysRow({ ...(await readHostLoadAsync()), disks: await diskReadingsAsync({ resolveCache: false }, IS_WSL), tmp })}\n`,
  );
}

// JSON sampler mode is the process boundary for other tools: it exposes this file's existing
// CPU/RAM readers and storage.ts's tmpfs statfs reading without a second measurement path.
if (process.env["STATUSLINE_HOST_METRICS"] === "1") {
  process.stdout.write(`${JSON.stringify(await readHostMetrics())}\n`);
  process.exit(0);
}

if (import.meta.main) await main();
