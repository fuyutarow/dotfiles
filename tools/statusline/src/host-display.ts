import type { Result } from "neverthrow";
import { ESC, RST, pctFmt, roles } from "./ansi.ts";
import {
  fieldDisplay,
  observed,
  type DisplayFields,
  type FieldDisplay,
} from "./field-state.ts";
import type { DiskEntry, TmpEntry, TmpfsReading } from "./storage.ts";
import { diskSegment, tmpSegment } from "./storage-display.ts";
import type { MemReading } from "./host-model.ts";
import { cccBadge } from "./ccc-model.ts";
export const STALE_SHOW_S = 60;

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
const currentTmp: TmpEntry[] = [
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

export function formatBytes(bytes: number): string {
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

export function sysRow(
  h: HostLoad & { fields?: DisplayFields },
  field: FieldDisplay = fieldDisplay(h.fields),
): string {
  return `${ESC}[38;5;74mSys:${RST} ${sysSegment(h.cpuPct, h.ram, h.vram, h.disks, h.tmp, field, h.tmpfs)}`;
}
