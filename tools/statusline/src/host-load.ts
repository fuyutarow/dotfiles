import { renderUnavailable, unavailable } from "./ansi.ts";
import { memReading, type MemReading } from "./host-model.ts";
import { sysRow, formatBytes, type HostLoad } from "./host-display.ts";
export type { MemReading } from "./host-model.ts";
export type { HostLoad } from "./host-display.ts";
// Host load — CPU · RAM · VRAM · Disk — read and rendered as the statusline's Sys row. Consumers:
// tools/statusline/src/statusline.ts (row 5) and `s` in zsh/aliases.zsh (one row, now).
// GPU data comes exclusively from tools/shared/src/gpu-sampler.ts state.
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { cpus, totalmem } from "node:os";
import { err, fromThrowable, ok, type Result } from "neverthrow";
import {
  diskReadingsAsync,
  IS_WSL,
  tmpfsReading,
  tmpReadingsAsync,
} from "./storage.ts";
import { cgroupMemory } from "./cgroup-memory.ts";
import { z } from "./zod.ts";
import { sampleCccIndexing } from "./ccc-indexing.ts";
import {
  gpuReadFromState,
  readGpuState,
  type GpuState,
} from "@dotfiles/shared/src/gpu-samples.ts";
import {
  ENRICHMENT_TIMEOUT_MS,
  execAsyncBounded,
  execAsyncRenderBounded,
  readJson,
  readJsonAsync,
  within,
  writeCache,
  writeCacheAsync,
} from "./bounded.ts";

const HOME = process.env["HOME"] ?? "";

// Shared shape for a "used/total" memory-style reading (RAM, VRAM): both the fraction string
// AND the percentage, since render() needs the percentage to threshold-color the segment the
// same way every other percentage in this file is colored (pctFmt) — a plain fraction alone
// cannot drive that.
// GPU observations belong to the shared owner. Rendering never launches a sampler.
function vramFromState(
  state: GpuState | undefined,
): Result<MemReading, string> {
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
    return err(`⚠ GPU stalled since ${time} JST · gpu-sampler --check`);
  }
  const result = gpuReadFromState(
    state?.paused === true
      ? { ...state, unresponsiveSince: undefined, why: undefined }
      : state,
  );
  if (!result.ok) return err(result.why);
  const d = result.value;
  const reading = memReading(d.memUsedGiB, d.memTotalGiB);
  return reading === undefined
    ? err("stale (invalid GPU memory)")
    : ok({
        ...reading,
        gpuAvg15: d.avg15Pct,
        gpuSamples15: d.samples15,
      });
}
// Host RAM, Linux only (reads /proc/meminfo — instant, no subprocess). MemAvailable (not
// MemFree) is what "used" is measured against: it already accounts for reclaimable page cache,
// which MemFree does not, so MemFree would read as chronically "almost full" on a healthy box.
// macOS host RAM: `vm_stat` (a few ms, no privileges) for the page counts, os.totalmem() for the
// size. "Used" is Activity Monitor's Memory Used — app memory (anonymous minus purgeable pages) +
// wired + compressed — NOT total minus "Pages free": macOS keeps free pages near zero by caching
// files, so that would read as chronically full, the same trap MemFree is on Linux. Not `top -l 1`:
// its PhysMem "used" counts that file cache too, and it costs a full process-table pass.
export const VmStatPage = z.string().regex(/^\d+$/u).transform(Number);
export async function macRam(): Promise<Result<MemReading, string>> {
  return (
    await execAsyncRenderBounded(
      "vm_stat",
      "vm_stat",
      [],
      ENRICHMENT_TIMEOUT_MS,
    )
  )
    .mapErr((f) => f.why)
    .andThen((raw) => {
      const size = raw.match(/page size of (\d+) bytes/u)?.[1];
      const pages = (label: string): number | undefined => {
        const line = raw.split("\n").find((l) => l.startsWith(`${label}:`));
        const v = VmStatPage.safeParse(
          line?.split(/\s+/u).pop()?.replace(/\.$/u, ""),
        );
        return v.success ? v.data : undefined;
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
        return err("vm_stat output unparsable");
      const usedBytes =
        (wired + compressed + Math.max(0, anonymous - purgeable)) *
        Number(size);
      const GiB = 1024 ** 3;
      const reading = memReading(usedBytes / GiB, totalmem() / GiB);
      return reading !== undefined
        ? ok(reading)
        : err("vm_stat output unparsable");
    });
}
/** A small kernel file's text, or undefined when it does not exist here (cgroup-memory's reader). */
const readIfPresent = (path: string): string | undefined =>
  fromThrowable(() => readFileSync(path, "utf8"))().unwrapOr(undefined);
// macOS has no /proc: see macRam().
export async function ramFrac(): Promise<Result<MemReading, string>> {
  if (process.platform === "darwin") return macRam();
  return fromThrowable(
    () => readFileSync("/proc/meminfo", "utf8"),
    () => "no /proc/meminfo",
  )().andThen((raw) => {
    let totalKb: number | undefined;
    let availKb: number | undefined;
    for (const line of raw.split("\n")) {
      if (line.startsWith("MemTotal:")) totalKb = Number(line.split(/\s+/u)[1]);
      else if (line.startsWith("MemAvailable:"))
        availKb = Number(line.split(/\s+/u)[1]);
      if (totalKb !== undefined && availKb !== undefined) break;
    }
    if (totalKb === undefined || availKb === undefined)
      return err("meminfo lacks MemTotal/MemAvailable");
    // Inside a container /proc/meminfo is the HOST; the cgroup limit is what this box can use
    // (lib/cgroup-memory.ts says how Vast read 42% at the brink of an OOM kill). Marked "cgroup".
    const GiB = 1024 ** 3;
    const cg = cgroupMemory(readIfPresent, totalKb * 1024);
    if (cg !== undefined) {
      const capped = memReading(cg.usedBytes / GiB, cg.limitBytes / GiB);
      return capped !== undefined
        ? ok({ ...capped, frac: `${capped.frac} cgroup` })
        : err("cgroup memory unparsable");
    }
    const usedKb = totalKb - availKb;
    const reading = memReading(usedKb / 1024 / 1024, totalKb / 1024 / 1024);
    return reading !== undefined ? ok(reading) : err("meminfo unparsable");
  });
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
export function macCpuSample(): Result<CpuSample, string> {
  const cores = cpus();
  if (cores.length === 0) return err("os.cpus() returned no cores");
  let total = 0;
  let idle = 0;
  for (const { times } of cores) {
    total += times.user + times.nice + times.sys + times.idle + times.irq;
    idle += times.idle;
  }
  return total > 0 ? ok({ total, idle }) : err("os.cpus() counters are zero");
}
export function readCpuSample(): Result<CpuSample, string> {
  if (process.platform === "darwin") return macCpuSample();
  return fromThrowable(
    () => readFileSync("/proc/stat", "utf8"),
    () => "no /proc/stat",
  )().andThen((raw) => {
    const line = raw.split("\n").find((l) => l.startsWith("cpu "));
    if (line === undefined || line === "")
      return err("/proc/stat has no cpu line");
    const fields = line.trim().split(/\s+/u).slice(1).map(Number);
    const idle = (fields[3] ?? 0) + (fields[4] ?? 0);
    const total = fields.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
    return Number.isFinite(idle) && total > 0
      ? ok({ total, idle })
      : err("/proc/stat cpu line unparsable");
  });
}
export function cpuPct(): Result<number, string> {
  const sampled = readCpuSample();
  if (sampled.isErr()) return err(sampled.error); // no /proc (mac) / malformed line
  const sample = sampled.value;
  const now = Temporal.Now.instant().epochMilliseconds;
  const prev = readJson(CPU_CACHE, CpuSampleSchema); // undefined: no usable baseline file
  // Best-effort write of THIS render's sample for the NEXT render to diff against, unconditional
  // on whether this render itself can show a value — same "write regardless, return what we
  // have" shape as agentName()'s cache-miss path above. EXCEPT a baseline younger than
  // CPU_BASELINE_MIN_MS is kept: the file is shared by every session, so overwriting it each
  // render shrank the window to the gap since ANOTHER session's render (a few ms -> a coarse 0%
  // or 100%).
  const keep =
    prev?.at !== undefined && within(prev.at, now, CPU_BASELINE_MIN_MS);
  if (!keep) {
    writeCache(CPU_CACHE, { ...sample, at: now });
  }
  if (prev === undefined) return err("no earlier sample to diff against"); // first render on this host
  // A baseline with no timestamp (pre-2026-10-03 file), from the future (clock stepped back) or
  // older than CPU_BASELINE_MAX_MS would be an average over some other period than "now".
  if (prev.at === undefined || !within(prev.at, now, CPU_BASELINE_MAX_MS))
    return err("no earlier sample from the last 60s");
  const dTotal = sample.total - prev.total;
  const dIdle = sample.idle - prev.idle;
  // dTotal<=0 means no jiffies elapsed between two renders (or a counter reset) -> a division
  // here would be by ~0 or negative, not a real rate; say so rather than show a bogus number.
  if (dTotal <= 0) return err("no ticks since the last sample");
  return ok(Math.max(0, Math.min(100, (1 - dIdle / dTotal) * 100)));
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
  const cpu = cpuPct().match(
    (value) => `${Math.round(value)}%`,
    (why) => renderUnavailable(unavailable(why)),
  );
  const ram = (await ramFrac()).match(
    (value) => value.frac,
    (why) => renderUnavailable(unavailable(why)),
  );
  const tmp = (await tmpfsReading()).match(
    (value) =>
      `${formatBytes(value.availableBytes)} free · ${value.freeInodes}i`,
    (why) => renderUnavailable(unavailable(why)),
  );
  return { cpu, ram, tmp };
}

/** Async render-path sample; host readings run independently and retain explicit unknowns. */
export async function readHostLoadAsync(): Promise<Omit<HostLoad, "disks">> {
  const [cpu, ram, vram, tmp] = await Promise.all([
    cpuPctAsync(),
    ramFracAsync(),
    vramGatedAsync(),
    tmpReadingsAsync(),
  ]);
  return { cpuPct: cpu, ram, vram, tmp };
}
async function readCpuSampleAsync(): Promise<Result<CpuSample, string>> {
  if (process.platform === "darwin") return macCpuSample();
  const raw = await readFile("/proc/stat", "utf8").catch(() => null);
  if (raw === null) return err("no /proc/stat");
  const line = raw.split("\n").find((part) => part.startsWith("cpu "));
  if (line === undefined || line === "")
    return err("/proc/stat has no cpu line");
  const fields = line.trim().split(/\s+/u).slice(1).map(Number);
  const idle = (fields[3] ?? 0) + (fields[4] ?? 0);
  const total = fields.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  return Number.isFinite(idle) && total > 0
    ? ok({ total, idle })
    : err("/proc/stat cpu line unparsable");
}
async function cpuPctAsync(): Promise<Result<number, string>> {
  const sampled = await readCpuSampleAsync();
  if (sampled.isErr()) return err(sampled.error);
  const sample = sampled.value;
  const now = Temporal.Now.instant().epochMilliseconds;
  const prev = await readJsonAsync(CPU_CACHE, CpuSampleSchema);
  const keep =
    prev?.at !== undefined && within(prev.at, now, CPU_BASELINE_MIN_MS);
  if (!keep) await writeCacheAsync(CPU_CACHE, { ...sample, at: now });
  if (prev === undefined) return err("no earlier sample to diff against");
  if (prev.at === undefined || !within(prev.at, now, CPU_BASELINE_MAX_MS))
    return err("no earlier sample from the last 60s");
  const dTotal = sample.total - prev.total;
  const dIdle = sample.idle - prev.idle;
  if (dTotal <= 0) return err("no ticks since the last sample");
  return ok(Math.max(0, Math.min(100, (1 - dIdle / dTotal) * 100)));
}
async function ramFracAsync(): Promise<Result<MemReading, string>> {
  if (process.platform === "darwin") {
    const rawResult = await execAsyncBounded("vm_stat", "vm_stat", [], 2000);
    if (rawResult.isErr()) return err(rawResult.error.why);
    const raw = rawResult.value;
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
      return err("vm_stat output unparsable");
    const usedBytes =
      (wired + compressed + Math.max(0, anonymous - purgeable)) * Number(size);
    const reading = memReading(usedBytes / 1024 ** 3, totalmem() / 1024 ** 3);
    return reading === undefined
      ? err("vm_stat output unparsable")
      : ok(reading);
  }
  const raw = await readFile("/proc/meminfo", "utf8").catch(() => null);
  if (raw === null) return err("no /proc/meminfo");
  let totalKb: number | undefined;
  let availKb: number | undefined;
  for (const line of raw.split("\n")) {
    if (line.startsWith("MemTotal:")) totalKb = Number(line.split(/\s+/u)[1]);
    else if (line.startsWith("MemAvailable:"))
      availKb = Number(line.split(/\s+/u)[1]);
    if (totalKb !== undefined && availKb !== undefined) break;
  }
  if (totalKb === undefined || availKb === undefined)
    return err("meminfo lacks MemTotal/MemAvailable");
  const cgPaths = [
    "/sys/fs/cgroup/memory.max",
    "/sys/fs/cgroup/memory.current",
    "/sys/fs/cgroup/memory.stat",
    "/sys/fs/cgroup/memory/memory.limit_in_bytes",
    "/sys/fs/cgroup/memory/memory.usage_in_bytes",
    "/sys/fs/cgroup/memory/memory.stat",
  ];
  const cgTexts = await Promise.all(
    cgPaths.map((path) => readFile(path, "utf8").catch(() => null)),
  );
  const cgMap = new Map<string, string>();
  cgTexts.forEach((text, index) => {
    const path = cgPaths[index];
    if (text !== null && path !== undefined) cgMap.set(path, text);
  });
  const cg = cgroupMemory((path) => cgMap.get(path), totalKb * 1024);
  if (cg !== undefined) {
    const capped = memReading(
      cg.usedBytes / 1024 ** 3,
      cg.limitBytes / 1024 ** 3,
    );
    return capped === undefined
      ? err("cgroup memory unparsable")
      : ok({ ...capped, frac: `${capped.frac} cgroup` });
  }
  const reading = memReading(
    (totalKb - availKb) / 1024 / 1024,
    totalKb / 1024 / 1024,
  );
  return reading === undefined ? err("meminfo unparsable") : ok(reading);
}
async function vramFracAsync(): Promise<Result<MemReading, string>> {
  const state = await readGpuState();
  const reading = vramFromState(state);
  if (reading.isErr()) return reading;
  const cccIndexing = await sampleCccIndexing({
    cachePath: `${HOME}/.cache/claude/statusline-ccc.json`,
  });
  return ok({ ...reading.value, cccIndexing });
}
async function vramGatedAsync(): Promise<
  Result<MemReading, string> | undefined
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
