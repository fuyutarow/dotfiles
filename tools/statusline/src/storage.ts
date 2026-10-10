import { readFileSync, statfsSync } from "node:fs";
import { statfs } from "node:fs/promises";
import { join } from "node:path";
import { err, fromThrowable, ok, type Result } from "neverthrow";
import { storageLine } from "../../shared/src/storage-headroom.ts";
import { z } from "./zod.ts";
import {
  execError,
  readJson,
  readJsonAsync,
  writeCache,
  writeCacheAsync,
} from "./bounded.ts";
import {
  DiskRateStateSchema,
  diskRateStatePath,
  updateDiskRates,
} from "./disk-rate.ts";
import { naSegment, roles } from "./ansi.ts";

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
  totalG: number | undefined;
  freeG: number | undefined;
  col: string; // green / yellow (below warn_gib) / red (below deny_gib)
  path?: string;
  rateGibPerMin?: number | undefined; // positive = filling, negative = freeing
  rateRedMinutes?: number | undefined;
  rateYellowMinutes?: number | undefined;
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
        rate_red_minutes: z.number().positive().optional(),
        rate_yellow_minutes: z.number().positive().optional(),
      }),
    )
    .optional(),
});
export interface DiskReadOptions {
  configPath?: string;
  statePath?: string;
  now?: number;
}
export function diskReadings(
  options: DiskReadOptions = {},
): Result<DiskEntry[], string> {
  const raw = fromThrowable(
    (): unknown =>
      Bun.TOML.parse(
        readFileSync(options.configPath ?? STORAGE_CONFIG, "utf8"),
      ),
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
    const totalG = (blocks * bsize) / 1024 ** 3;
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
      path,
      rateRedMinutes: d.rate_red_minutes,
      rateYellowMinutes: d.rate_yellow_minutes,
      usedG,
      totalG,
      freeG,
      col,
    });
  }
  const statePath = options.statePath ?? diskRateStatePath();
  const rated = updateDiskRates(
    out,
    readJson(statePath, DiskRateStateSchema),
    options.now ?? Temporal.Now.instant().epochMilliseconds,
  );
  writeCache(statePath, rated.state);
  return ok(rated.entries);
}
/** Async render-path disk read, so config and filesystem probes do not block rendering. */
export async function diskReadingsAsync(
  options: DiskReadOptions = {},
): Promise<Result<DiskEntry[], string>> {
  const text = await Bun.file(options.configPath ?? STORAGE_CONFIG)
    .text()
    .catch(() => null);
  if (text === null) return err("storage-headroom.toml unreadable");
  const raw = fromThrowable((): unknown => Bun.TOML.parse(text))();
  if (raw.isErr()) return err("storage-headroom.toml unreadable");
  const parsed = StorageConfigSchema.safeParse(raw.value);
  if (!parsed.success)
    return err("storage-headroom.toml has an unexpected shape");
  const drives = Object.values(parsed.data.drive ?? {});
  if (drives.length === 0) return err("no [drive.*] in storage-headroom.toml");
  const out: DiskEntry[] = [];
  for (const d of drives) {
    if (d.path === undefined) {
      out.push({ kind: "miss", label: "Disk", why: "drive entry has no path" });
      continue;
    }
    const path = d.path;
    const result = (await Promise.allSettled([statfs(path)]))[0];
    if (result?.status === "rejected") {
      const why = execError(result.reason).code ?? "statfs failed";
      const missing: DiskEntry[] =
        why === "ENOENT" && !IS_WSL
          ? []
          : [{ kind: "miss", label: diskLabel(path), why }];
      out.push(...missing);
      continue;
    }
    if (result?.status !== "fulfilled") {
      out.push({ kind: "miss", label: diskLabel(path), why: "statfs failed" });
      continue;
    }
    const { bsize, blocks, bfree, bavail } = result.value;
    const usedG = ((blocks - bfree) * bsize) / 1024 ** 3;
    const freeG = (bavail * bsize) / 1024 ** 3;
    const totalG = (blocks * bsize) / 1024 ** 3;
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
      path,
      rateRedMinutes: d.rate_red_minutes,
      rateYellowMinutes: d.rate_yellow_minutes,
      usedG,
      totalG,
      freeG,
      col,
    });
  }
  const statePath = options.statePath ?? diskRateStatePath();
  const rated = updateDiskRates(
    out,
    await readJsonAsync(statePath, DiskRateStateSchema),
    options.now ?? Temporal.Now.instant().epochMilliseconds,
  );
  await writeCacheAsync(statePath, rated.state);
  return ok(rated.entries);
}
export function diskSegment(d: DiskEntry): string {
  if (d.kind === "miss") return naSegment(d.label, d.why);
  if (d.freeG === undefined || !Number.isFinite(d.freeG) || d.freeG < 0)
    return roles.unavailable(d.label);
  const free = significant(d.freeG, 3);
  const total = d.totalG;
  const fraction =
    total !== undefined && Number.isFinite(total) && total > 0
      ? `/${significant(total, 3)}GiB (${Math.round((d.freeG / total) * 100)}%)`
      : "";
  let rate = "";
  const fill = d.rateGibPerMin;
  if (fill !== undefined && Number.isFinite(fill) && Math.abs(fill) >= 0.05) {
    rate = ` ${fill > 0 ? "↓" : "↑"}${significant(Math.abs(fill), 2)}GiB/min`;
  }
  return `${roles.label(d.label)} ${roles.value(`${free}GiB`, d.col)}${roles.secondary(`${fraction} free${rate}`)}`;
}

function significant(value: number, digits: number): string {
  if (value === 0) return "0";
  const rounded = Number(value.toPrecision(digits));
  const decimals = Math.max(
    0,
    digits - 1 - Math.floor(Math.log10(Math.abs(rounded))),
  );
  return rounded.toFixed(Math.min(decimals, 100));
}
