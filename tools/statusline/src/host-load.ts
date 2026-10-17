// Host load — CPU · RAM · VRAM · Disk — read and rendered as the statusline's Sys row. Consumers:
// tools/statusline/src/statusline.ts (row 5) and `s` in zsh/aliases.zsh (one row, now).
// GPU data comes exclusively from tools/shared/src/gpu-sampler.ts state.
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { cpus, totalmem } from "node:os";
import { err, fromThrowable, ok, type Result } from "neverthrow";
import {
  diskReadings,
  diskSegment,
  tmpfsReading,
  tmpReadingsAsync,
  tmpSegment,
  type DiskEntry,
  type TmpEntry,
  type TmpfsReading,
} from "./storage.ts";
import { cgroupMemory } from "./cgroup-memory.ts";
import { z } from "./zod.ts";
import { CccIndexSchema, cccBadge, sampleCccIndexing } from "./ccc-indexing.ts";
import {
  gpuStatePath,
  GpuStateSchema,
  gpuReadFromState,
  readGpuState,
  type GpuState,
} from "../../shared/src/gpu-samples.ts";
import { ESC, RST, pctFmt, roles } from "./ansi.ts";
import {
  fieldDisplay,
  observed,
  type DisplayFields,
  type FieldDisplay,
} from "./field-state.ts";
import {
  ENRICHMENT_TIMEOUT_MS,
  execAsyncBounded,
  execBounded,
  readJson,
  readJsonAsync,
  within,
  writeCache,
  writeCacheAsync,
} from "./bounded.ts";

const HOME = process.env.HOME ?? "";

// Shared shape for a "used/total" memory-style reading (RAM, VRAM): both the fraction string
// AND the percentage, since render() needs the percentage to threshold-color the segment the
// same way every other percentage in this file is colored (pctFmt) — a plain fraction alone
// cannot drive that.
export const MemReadingSchema = z.object({
  frac: z.string(), // e.g. "16.2/54.9G"
  pct: z.number(), // used/total*100, unrounded — pctFmt() rounds at render time
  gpuAvg15: z.number().nullable().optional(),
  gpuSamples15: z.number().optional(),
  cccIndexing: CccIndexSchema.optional(),
  // Set only when this is the last GOOD sample served because the fresh one failed (VRAM only):
  // how old it is and why the fresh one failed. render() prints it, so an old number is never
  // shown as if it were current.
  stale: z.object({ secs: z.number(), why: z.string() }).optional(),
});
export type MemReading = z.output<typeof MemReadingSchema>;
export function memReading(
  usedG: number,
  totalG: number,
): MemReading | undefined {
  if (!Number.isFinite(usedG) || !Number.isFinite(totalG) || totalG <= 0)
    return undefined;
  return {
    // used right-aligned to the total's width, so 9.6/170.9 and 19.6/170.9 take the same columns
    frac: `${usedG.toFixed(1).padStart(totalG.toFixed(1).length)}/${totalG.toFixed(1)}G`,
    pct: (usedG / totalG) * 100,
  };
}

// GPU observations belong to the shared owner. Rendering never launches a sampler.
export const STALE_SHOW_S = 60;
function vramFromState(
  state: GpuState | undefined,
): Result<MemReading, string> {
  const result = gpuReadFromState(state);
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
// A Mac with no nvidia-smi has no discrete VRAM to read: Apple silicon's GPU shares the RAM the
// row already shows. That is "does not exist", which the EXPLICIT-ABSENCE law keeps silent. On
// Linux a missing nvidia-smi stays n/a — there it is a broken GPU box, not a GPU-less one.
export function vramGated(): Result<MemReading, string> | undefined {
  const vram = vramFrac();
  const absent =
    process.platform === "darwin" &&
    vram.isErr() &&
    vram.error === "no nvidia-smi";
  return absent ? undefined : vram;
}
export function vramFrac(): Result<MemReading, string> {
  return vramFromState(readJson(gpuStatePath(), GpuStateSchema));
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
export function macRam(): Result<MemReading, string> {
  return execBounded("vm_stat", "vm_stat", [], ENRICHMENT_TIMEOUT_MS)
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
export function ramFrac(): Result<MemReading, string> {
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
export function memSegment(
  label: string,
  m: MemReading,
  includeGpu = true,
): string {
  const { text: pct, col } = pctFmt(m.pct);
  let seg = `${roles.label(label)} ${roles.value(`${pct}%`, col)} ${roles.secondary(`(${m.frac})`)}`;
  if (includeGpu && m.gpuAvg15 !== undefined && m.gpuAvg15 !== null)
    seg += ` ${roles.secondary(`GPU≈${Math.round(m.gpuAvg15)}%/15m n=${m.gpuSamples15 ?? 0}`)}`;
  const badge = cccBadge(
    m.cccIndexing,
    Temporal.Now.instant().epochMilliseconds,
  );
  if (label === "VRAM" && badge !== undefined)
    seg += ` ${roles.secondary(badge)}`;
  // A number old enough to mislead carries supporting detail: `stale`, its age, and why.
  // Under STALE_SHOW_S it is not marked (owner ruling 2026-10-05): with the bar refreshing every 5 s
  // and one session sampling for all, a reading tens of seconds old is the normal case, and the
  // marker there was noise that buried the cases that matter.
  if (m.stale !== undefined && m.stale.secs >= STALE_SHOW_S)
    seg += ` ${roles.secondary(`stale ${m.stale.secs}s (${m.stale.why})`)}`;
  return seg;
}
// Disks: WHICH filesystems and at what free space they turn yellow/red are not decided here —
// Every reading is a Result: ok renders the value, err renders `<label> n/a (<why>)` — see the
// EXPLICIT-ABSENCE law at the top. The row therefore always carries CPU, RAM and VRAM.
// Host-wide snapshot shared by the Sys renderer and transcript snapshot renderer in this process.
// Updated by the async host read before either renders; never performs I/O during formatting.
let currentTmp: TmpEntry[] = [
  { kind: "miss", label: "tmp", why: "not sampled" },
];
export function sysSegment(
  cpu: Result<number, string>,
  ram: Result<MemReading, string>,
  vram: Result<MemReading, string> | undefined,
  disks: Result<DiskEntry[], string>,
  tmp: TmpEntry[] = currentTmp,
  field: FieldDisplay = fieldDisplay(),
  tmpfs?: Result<TmpfsReading, string>,
): string {
  let gpu: string | undefined;
  let gpuWhy = "no GPU sample";
  let gpuAge = 0;
  if (vram?.isErr() === true) gpuWhy = vram.error;
  if (vram?.isOk() === true) {
    const m = vram.value;
    if (m.gpuAvg15 !== undefined && m.gpuAvg15 !== null)
      gpu = roles.secondary(
        `GPU≈${Math.round(m.gpuAvg15)}%/15m n=${m.gpuSamples15 ?? 0}`,
      );
    gpuAge = (m.stale?.secs ?? 0) * 1000;
  }
  const parts: string[] = [
    cpu.match(
      (v) => {
        const { text: pct, col } = pctFmt(v);
        return field(
          "cpu",
          "CPU",
          observed(`${roles.label("CPU")} ${roles.value(`${pct}%`, col)}`),
        );
      },
      (why) => field("cpu", "CPU", observed(undefined, why)),
    ),
    ram.match(
      (m) =>
        field(
          "ram",
          "RAM",
          observed(
            memSegment("RAM", m),
            undefined,
            (m.stale?.secs ?? 0) * 1000,
          ),
        ),
      (why) => field("ram", "RAM", observed(undefined, why)),
    ),
    ...(vram === undefined
      ? []
      : [
          vram.match(
            (m) =>
              field(
                "vram",
                "VRAM",
                observed(
                  memSegment("VRAM", m, false),
                  undefined,
                  (m.stale?.secs ?? 0) * 1000,
                ),
              ),
            (why) => field("vram", "VRAM", observed(undefined, why)),
          ),
        ]),
    ...(vram === undefined
      ? []
      : [field("gpu", "GPU", observed(gpu, gpuWhy, gpuAge))]),
    ...(tmpfs === undefined
      ? []
      : [
          field(
            "tmpfs",
            "tmpfs",
            tmpfs.match(
              (reading) =>
                observed(
                  `tmpfs ${formatBytes(reading.availableBytes)} free · ${reading.freeInodes}i`,
                ),
              (why) => observed(undefined, why),
            ),
          ),
        ]),
    ...disks.match(
      (ds) =>
        ds.map((disk) => {
          let value: string | undefined;
          let why = "invalid free space reading";
          if (disk.kind === "miss") why = disk.why;
          else if (
            disk.freeG !== undefined &&
            Number.isFinite(disk.freeG) &&
            disk.freeG >= 0
          )
            value = diskSegment(disk);
          return field(`disk:${disk.label}`, disk.label, observed(value, why));
        }),
      (why) => [field("disks", "Disk", observed(undefined, why))],
    ),
    ...tmp.map((entry) =>
      field(
        `tmp:${entry.label}`,
        entry.label,
        entry.kind === "miss"
          ? observed(undefined, entry.why)
          : observed(tmpSegment(entry)),
      ),
    ),
  ];
  return parts.join(roles.separator());
}

/** Every Sys reading, each a value or the reason it could not be taken (EXPLICIT-ABSENCE). */
export interface HostLoad {
  cpuPct: Result<number, string>;
  ram: Result<MemReading, string>;
  vram: Result<MemReading, string> | undefined; // undefined: this host has no discrete VRAM
  disks: Result<DiskEntry[], string>;
  tmpfs?: Result<TmpfsReading, string> | undefined;
  tmp?: TmpEntry[] | undefined;
}

export interface HostMetrics {
  cpu: string;
  ram: string;
  tmp: string;
}

/** Plain host metrics shared with integrations that need the Sys row's CPU and RAM samplers. */
export async function readHostMetrics(): Promise<HostMetrics> {
  const cpu = cpuPct().match(
    (value) => `${Math.round(value)}%`,
    () => "n/a",
  );
  const ram = ramFrac().match(
    (value) => value.frac,
    () => "n/a",
  );
  const tmp = (await tmpfsReading()).match(
    (value) =>
      `${formatBytes(value.availableBytes)} free · ${value.freeInodes}i`,
    () => "n/a",
  );
  return { cpu, ram, tmp };
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "n/a";
  if (bytes < 1024) return `${bytes}B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = "B";
  for (const next of units) {
    value /= 1024;
    unit = next;
    if (value < 1024) break;
  }
  return `${Number(value.toFixed(2))}${unit}`;
}

// Sync host-load API remains for the standalone `s` command; statusline uses readHostLoadAsync.
export function readHostLoad(): HostLoad {
  return {
    cpuPct: cpuPct(),
    ram: ramFrac(),
    vram: vramGated(),
    disks: diskReadings(),
  };
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
  const reading = vramFromState(await readGpuState());
  if (reading.isErr()) return reading;
  const cccIndexing = await sampleCccIndexing({
    cachePath: `${HOME}/.cache/claude/statusline-ccc.json`,
  });
  return ok({ ...reading.value, cccIndexing });
}
async function vramGatedAsync(): Promise<
  Result<MemReading, string> | undefined
> {
  const vram = await vramFracAsync();
  return process.platform === "darwin" &&
    vram.isErr() &&
    vram.error === "no nvidia-smi"
    ? undefined
    : vram;
}
/** The Sys row exactly as the statusline prints it. */
export function sysRow(
  h: HostLoad & { fields?: DisplayFields },
  field: FieldDisplay = fieldDisplay(h.fields),
): string {
  return `${ESC}[38;5;74mSys:${RST} ${sysSegment(h.cpuPct, h.ram, h.vram, h.disks, h.tmp, field, h.tmpfs)}`;
}

// Standalone (`s`): render the available observations; cold or expired GPU state is explicit.
async function main(): Promise<void> {
  currentTmp = await tmpReadingsAsync();
  process.stdout.write(
    `${sysRow({ ...(await readHostLoadAsync()), disks: diskReadings() })}\n`,
  );
}

// JSON sampler mode is the process boundary for other tools: it exposes this file's existing
// CPU/RAM readers and storage.ts's tmpfs statfs reading without a second measurement path.
if (process.env.STATUSLINE_HOST_METRICS === "1") {
  process.stdout.write(`${JSON.stringify(await readHostMetrics())}\n`);
  process.exit(0);
}

if (import.meta.main) await main();
