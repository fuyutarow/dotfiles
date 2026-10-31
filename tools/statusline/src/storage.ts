import { readFile, statfs } from "node:fs/promises";
import { join } from "node:path";
import {
  err,
  fromAsyncThrowable,
  fromThrowable,
  ok,
  type Result,
} from "neverthrow";
import { z } from "./zod.ts";
import { execError, readJsonAsync, writeCacheAsync } from "./bounded.ts";
import {
  DiskRateStateSchema,
  diskRateStatePath,
  updateDiskRates,
} from "./disk-rate.ts";

// Drive paths come from agents/hooks/storage-headroom.toml. Free-space color thresholds are
// presentation rules in ansi.ts; the storage gate keeps its own enforcement thresholds. statfs is
// a syscall (no subprocess), cheap enough for every render. A drive whose path does not exist here
// (/mnt/c on macOS) is skipped, as the gate skips it.
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
  path?: string;
  rateGibPerMin?: number | undefined; // positive = filling, negative = freeing
  rateRedMinutes?: number | undefined;
  rateYellowMinutes?: number | undefined;
}
// "Disk C:" (a Windows drive under WSL, /mnt/<letter>), "Disk WSL" (the WSL guest root), or
// "Disk <path>" elsewhere — a bare "C:" or "/" beside CPU/RAM/VRAM did not say what it was.
export const IS_WSL =
  process.env["WSL_DISTRO_NAME"] !== undefined ||
  process.env["WSL_INTEROP"] !== undefined;
async function isWslAsync(): Promise<boolean> {
  if (IS_WSL) return true;
  const version = await readFile("/proc/version", "utf8").catch(() => "");
  return /microsoft/iu.test(version);
}
export function diskLabel(path: string, isWsl = IS_WSL): string {
  const m = path.match(/^\/mnt\/([a-z])$/u); // String.match: this file imports child_process (BG floor F4)
  if (m?.[1] !== undefined && m[1] !== "") return `Disk ${m[1].toUpperCase()}:`;
  if (path === "/" && isWsl) return "Disk WSL";
  return `Disk ${path}`;
}
// A drive that statfs could not read, shown as `<label> n/a (<why>)`.
export interface DiskMiss {
  kind: "miss";
  label: string;
  why: string;
}
export type DiskEntry = DiskReading | DiskMiss;
export interface TmpfsReading {
  availableBytes: number;
  freeInodes: number;
}

const TMPFS_MAGIC = 0x01021994;

/** Current free bytes and inodes on /tmp when it is a tmpfs filesystem. */
export async function tmpfsReading(
  path = "/tmp",
): Promise<Result<TmpfsReading, string>> {
  const stats = await fromAsyncThrowable(
    () => statfs(path, { bigint: true }),
    (error): string => execError(error).code ?? "statfs failed",
  )();
  if (stats.isErr()) return err(stats.error);
  if (Number(stats.value.type) !== TMPFS_MAGIC) return err("not tmpfs");
  return ok({
    availableBytes: Number(stats.value.bavail * stats.value.bsize),
    freeInodes: Number(stats.value.ffree),
  });
}

// /tmp, read by statfs. It is not a [drive.*] (no path), so it is not in the Disk list: both bytes
// and inodes are shown, because /tmp ran out of inodes (1,048,576) on 2026-10-15 while its bytes were
// 3% used, and a bytes-only line hid the failure.
export interface TmpReading {
  kind: "reading";
  label: string;
  freeG: number;
  totalG: number;
  inodeUsedPct: number | undefined; // undefined: this filesystem reports no inode count
}
// A statfs failure, or counts that cannot be a filesystem, is a miss that names itself, never a throw.
export type TmpEntry = TmpReading | DiskMiss;
export const TMP_PATH = "/tmp";
// The fields of node's StatsFs that the tmp reading uses.
export interface StatFsCounts {
  type?: number;
  bsize: number;
  blocks: number;
  bavail: number;
  files: number;
  ffree: number;
}
export function tmpEntry(
  counts: Result<StatFsCounts, string>,
  label = "tmp",
): TmpEntry {
  if (counts.isErr()) return { kind: "miss", label, why: counts.error };
  const { bsize, blocks, bavail, files, ffree } = counts.value;
  if (
    ![bsize, blocks, bavail].every((value) => Number.isFinite(value)) ||
    !(bsize > 0 && blocks > 0 && bavail >= 0 && bavail <= blocks)
  )
    return { kind: "miss", label, why: "statfs reported no capacity" };
  const inodesKnown =
    Number.isFinite(files) &&
    Number.isFinite(ffree) &&
    files > 0 &&
    ffree >= 0 &&
    ffree <= files;
  return {
    kind: "reading",
    label,
    freeG: (bavail * bsize) / 1024 ** 3,
    totalG: (blocks * bsize) / 1024 ** 3,
    inodeUsedPct: inodesKnown ? (100 * (files - ffree)) / files : undefined,
  };
}
// A stalled filesystem must not hold up a render. No subprocess and no sync statfs on this path.
async function boundedTmpStatfs(
  read: (path: string) => Promise<StatFsCounts>,
  path: string,
): Promise<Result<StatFsCounts, string>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Result<StatFsCounts, string>>((resolve) => {
    timer = setTimeout(() => {
      resolve(err("statfs timeout 150ms"));
    }, 150);
  });
  const pending = Promise.resolve()
    .then(() => read(path))
    .then(
      (value): Result<StatFsCounts, string> => ok(value),
      (reason: unknown): Result<StatFsCounts, string> =>
        err(execError(reason).code ?? "statfs failed"),
    );
  const counts = await Promise.race([pending, timeout]);
  clearTimeout(timer);
  return counts;
}
/** /tmp plus any configured drive that statfs identifies as tmpfs. */
export async function tmpReadingsAsync(
  configPath = STORAGE_CONFIG,
  read: (path: string) => Promise<StatFsCounts> = statfs,
): Promise<TmpEntry[]> {
  const config = await Bun.file(configPath)
    .text()
    .then(
      (text) =>
        fromThrowable((): unknown => Bun.TOML.parse(text))().unwrapOr(null),
      () => null,
    );
  const parsed = StorageConfigSchema.safeParse(config);
  const configured = parsed.success
    ? Object.values(parsed.data.drive ?? {})
    : [];
  const paths = new Set([
    TMP_PATH,
    ...configured.flatMap((drive) =>
      drive.path === undefined ? [] : [drive.path],
    ),
  ]);
  const entries = await Promise.all(
    [...paths].map(async (path) => {
      const counts = await boundedTmpStatfs(read, path);
      if (
        path !== TMP_PATH &&
        (counts.isErr() || counts.value.type !== 0x01021994)
      )
        return [];
      return [tmpEntry(counts, path === TMP_PATH ? "tmp" : `tmp ${path}`)];
    }),
  );
  return entries.flat();
}
// Bytes and inodes use the hook's use-percent thresholds. Unknown inode counts print n/a.
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
  resolveCache?: boolean;
}
/** Async render-path disk read, so config and filesystem probes do not block rendering. */
export async function diskReadingsAsync(
  options: DiskReadOptions = {},
  isWslOverride?: boolean,
): Promise<Result<DiskEntry[], string>> {
  const isWsl = isWslOverride ?? (await isWslAsync());
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
    const result = await statfs(path).then(
      (value) => ({ ok: true as const, value }),
      (reason: unknown) => ({
        ok: false as const,
        why: execError(reason).code ?? "statfs failed",
      }),
    );
    if (!result.ok && !(result.why === "ENOENT" && !isWsl)) {
      out.push({
        kind: "miss",
        label: diskLabel(path, isWsl),
        why: result.why,
      });
    }
    if (!result.ok) {
      continue;
    }
    const { bsize, blocks, bfree, bavail } = result.value;
    const usedG = ((blocks - bfree) * bsize) / 1024 ** 3;
    const freeG = (bavail * bsize) / 1024 ** 3;
    const totalG = (blocks * bsize) / 1024 ** 3;
    out.push({
      kind: "reading",
      label: diskLabel(path, isWsl),
      path,
      rateRedMinutes: d.rate_red_minutes,
      rateYellowMinutes: d.rate_yellow_minutes,
      usedG,
      totalG,
      freeG,
    });
  }
  const statePath = options.statePath ?? diskRateStatePath();
  const rated = updateDiskRates(
    out,
    await readJsonAsync(statePath, DiskRateStateSchema, options.resolveCache),
    options.now ?? Temporal.Now.instant().epochMilliseconds,
  );
  await writeCacheAsync(statePath, rated.state, options.resolveCache);
  return ok(rated.entries);
}
