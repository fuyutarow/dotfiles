import { readFileSync, statfsSync } from "node:fs";
import { join } from "node:path";
import { err, fromThrowable, ok, type Result } from "neverthrow";
import { storageLine } from "../../shared/src/storage-headroom.ts";
import { z } from "./zod.ts";
import { execError } from "./bounded.ts";
import { DIM, ESC, RST, naSegment, pctFmt } from "./ansi.ts";

// they are read from agents/hooks/storage-headroom.toml ([drive.*]: path, deny_gib, warn_gib),
// the same file the storage gate enforces, so the bar and the gate can never disagree about a
// threshold. statfs is a syscall (no subprocess), cheap enough for every render. A drive whose
// path does not exist here (/mnt/c on macOS) is skipped, as the gate skips it.
export const STORAGE_CONFIG = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "agents",
  "hooks",
  "storage-headroom.toml",
);
export interface DiskReading {
  kind: "reading"; // discriminant: DiskEntry is told apart by this tag, not by probing for a key
  label: string; // "Disk C:", "Disk WSL", or "Disk <path>" — see diskLabel
  usedG: number;
  totalG: number;
  freeG: number;
  col: string; // green / yellow (below warn_gib) / red (below deny_gib)
}
// "Disk C:" (a Windows drive under WSL, /mnt/<letter>), "Disk WSL" (the WSL guest root), or
// "Disk <path>" elsewhere — a bare "C:" or "/" beside CPU/RAM/VRAM did not say what it was.
export const IS_WSL = fromThrowable(() =>
  /microsoft/iu.test(readFileSync("/proc/version", "utf8")),
)().unwrapOr(false);
export function diskLabel(path: string): string {
  const m = path.match(/^\/mnt\/([a-z])$/u); // String.match: this file imports child_process (BG floor F4)
  if (m?.[1] !== undefined && m[1] !== "") return `Disk ${m[1].toUpperCase()}:`;
  if (path === "/" && IS_WSL) return "Disk WSL";
  return `Disk ${path}`;
}
// A drive that statfs could not read, shown as `<label> n/a (<why>)`.
export interface DiskMiss {
  kind: "miss";
  label: string;
  why: string;
}
export type DiskEntry = DiskReading | DiskMiss;
// err = the drive list itself could not be read, so WHICH disks to show is unknown.
// Only the keys this file reads; the gate's own keys (label, stop_gib, ...) are not its business.
export const StorageConfigSchema = z.object({
  drive: z
    .record(
      z.string(),
      z.object({
        path: z.string().optional(),
        deny_gib: z.number().optional(),
        deny_pct: z.number().optional(),
        warn_gib: z.number().optional(),
        warn_pct: z.number().optional(),
      }),
    )
    .optional(),
});
export function diskReadings(): Result<DiskEntry[], string> {
  const raw = fromThrowable(
    (): unknown => Bun.TOML.parse(readFileSync(STORAGE_CONFIG, "utf8")),
    () => "storage-headroom.toml unreadable",
  )();
  if (raw.isErr()) return err(raw.error);
  const parsed = StorageConfigSchema.safeParse(raw.value);
  if (!parsed.success)
    return err("storage-headroom.toml has an unexpected shape");
  const drives = Object.values(parsed.data.drive ?? {});
  // The config says WHICH disks to show: an empty list is the config failing to say, not "no disks".
  if (drives.length === 0) return err("no [drive.*] in storage-headroom.toml");
  const out: DiskEntry[] = [];
  for (const d of drives) {
    if (d.path === undefined) {
      out.push({
        kind: "miss",
        label: "Disk",
        why: "drive entry has no path",
      });
      continue;
    }
    const path = d.path;
    const st = fromThrowable(
      () => statfsSync(path),
      (e): string => execError(e).code ?? "statfs failed",
    )();
    // ENOENT off WSL: this OS has no such drive (/mnt/c on macOS) — nothing to show. Under WSL
    // /mnt/c is the host drive the storage gate exists to protect, so a missing mount is a drive
    // that could not be read, like any other failure: shown as n/a.
    if (st.isErr() && st.error === "ENOENT" && !IS_WSL) continue;
    if (st.isErr()) {
      out.push({ kind: "miss", label: diskLabel(path), why: st.error });
      continue;
    }
    const { bsize, blocks, bfree, bavail } = st.value;
    const usedG = ((blocks - bfree) * bsize) / 1024 ** 3;
    const freeG = (bavail * bsize) / 1024 ** 3;
    const totalG = usedG + freeG; // df's Use% denominator (reserved blocks excluded)
    // The storage-headroom gate (agents/hooks/enforce-storage-headroom.ts), on its own measure: free =
    // bavail, size = blocks. The gate validates that each _pct is present; this reader is not the
    // authority, so a missing share leaves the absolute size alone (100% of the drive never undercuts).
    const free = bavail * bsize;
    const size = blocks * bsize;
    const line = (gib: number | undefined, pct: number | undefined): number =>
      gib === undefined ? 0 : storageLine(gib, pct ?? 100, size);
    let col = "38;5;71";
    if (free < line(d.warn_gib, d.warn_pct)) col = "38;5;178";
    if (free < line(d.deny_gib, d.deny_pct)) col = "38;5;167";
    out.push({
      kind: "reading",
      label: diskLabel(path),
      usedG,
      totalG,
      freeG,
      col,
    });
  }
  return ok(out);
}
export function diskSegment(d: DiskEntry): string {
  if (d.kind === "miss") return naSegment(d.label, d.why);
  const pct = pctFmt((d.usedG / d.totalG) * 100).text;
  const total = String(Math.round(d.totalG));
  const used = String(Math.round(d.usedG)).padStart(total.length);
  return `${d.label} ${ESC}[${d.col}m${pct}%${RST} ${DIM}(${used}/${total}G)${RST}`;
}
