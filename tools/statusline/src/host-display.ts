import type { Result } from "@dotfiles/shared/src/result.ts";
import {
  ESC,
  RST,
  pctFmt,
  roles,
  renderUnavailable,
  unavailable,
} from "#src/ansi.ts";
import {
  fieldDisplay,
  observed,
  type DisplayFields,
  type FieldDisplay,
} from "#src/field-state.ts";
import type { DiskEntry, TmpEntry, TmpfsReading } from "#src/storage.ts";
import { diskSegment, tmpSegment } from "#src/storage-display.ts";
import type { MemReading } from "#src/host-model.ts";
import type { ReadError } from "#src/errors.ts";
import { cccBadge } from "#src/ccc-model.ts";
export const STALE_SHOW_S = 60;

function gpuSegment(m: MemReading): string {
  if (m.gpuNow === undefined)
    return roles.unavailable("GPU", unavailable("no GPU sample"));
  const { text, col } = pctFmt(m.gpuNow);
  return `${roles.label("GPU")} ${roles.value(`${text}%`, col)}`;
}

export function memSegment(
  label: string,
  m: MemReading,
  includeGpu = true,
): string {
  const { text: pct, col } = pctFmt(m.pct);
  let seg = `${roles.label(label)} ${roles.value(`${pct}%`, col)} ${roles.secondary(`(${m.frac})`)}`;
  if (includeGpu && m.gpuNow !== undefined) seg += ` ${gpuSegment(m)}`;
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
function gpuObservation(vram: Result<MemReading, ReadError>) {
  return vram.match({
    ok: (m) => {
      const utilization = gpuSegment(m);
      return observed(
        `${utilization}${roles.separator()}${memSegment("VRAM", m, false)}`,
        undefined,
        (m.stale?.secs ?? 0) * 1000,
      );
    },
    // A stall is an alert drawn in place of the reading, not a quiet n/a.
    err: (error) =>
      error._tag === "GpuStalled"
        ? observed(roles.value(error.message, "167"))
        : observed(undefined, error.message),
  });
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
  cpu: Result<number, ReadError>,
  ram: Result<MemReading, ReadError>,
  vram: Result<MemReading, ReadError> | undefined,
  disks: Result<DiskEntry[], ReadError>,
  tmp: TmpEntry[] = currentTmp,
  field: FieldDisplay = fieldDisplay(),
  tmpfs?: Result<TmpfsReading, ReadError>,
): string {
  const parts: string[] = [
    cpu.match({
      ok: (v) => {
        const { text: pct, col } = pctFmt(v);
        return field(
          "cpu",
          "CPU",
          observed(`${roles.label("CPU")} ${roles.value(`${pct}%`, col)}`),
        );
      },
      err: (error) => field("cpu", "CPU", observed(undefined, error.message)),
    }),
    ram.match({
      ok: (m) =>
        field(
          "ram",
          "RAM",
          observed(
            memSegment("RAM", m),
            undefined,
            (m.stale?.secs ?? 0) * 1000,
          ),
        ),
      err: (error) => field("ram", "RAM", observed(undefined, error.message)),
    }),
    ...(vram === undefined ? [] : [field("gpu", "GPU", gpuObservation(vram))]),
    ...(tmpfs === undefined
      ? []
      : [
          field(
            "tmpfs",
            "tmpfs",
            tmpfs.match({
              ok: (reading) =>
                observed(
                  `tmpfs ${formatBytes(reading.availableBytes)} free · ${reading.freeInodes}i`,
                ),
              err: (error) => observed(undefined, error.message),
            }),
          ),
        ]),
    ...disks.match({
      ok: (ds) =>
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
      err: (error) => [
        field("disks", "Disk", observed(undefined, error.message)),
      ],
    }),
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
  cpuPct: Result<number, ReadError>;
  ram: Result<MemReading, ReadError>;
  vram: Result<MemReading, ReadError> | undefined; // undefined: this host has no discrete VRAM
  disks: Result<DiskEntry[], ReadError>;
  tmpfs?: Result<TmpfsReading, ReadError> | undefined;
  tmp?: TmpEntry[] | undefined;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0)
    return renderUnavailable(unavailable("invalid byte count"));
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
