// Shared, zero-dependency storage thresholds. The TOML remains the authority for drive policy.

import { mkdirSync, readFileSync, statfsSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rm, statfs, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fromThrowable, jsonOf, z } from "./zod.ts";

const GiB = 1024 ** 3;

export function storageLine(
  gibLine: number,
  pct: number,
  totalBytes: number | null,
): number {
  const absolute = gibLine * GiB;
  return totalBytes === null
    ? absolute
    : Math.min(absolute, (pct / 100) * totalBytes);
}

export type Drive = {
  label: string;
  path: string;
  deny_gib: number;
  deny_pct: number;
  warn_gib?: number;
  warn_pct?: number;
  stop_gib?: number;
  rate_red_minutes?: number;
  rate_yellow_minutes?: number;
  // Guest recovery declarations: only guest-capacity-recover reads them; the gate ignores them.
  name?: string;
  recover_gib?: number;
  recover_pct?: number;
  tmp_recover_pct?: number;
  reclaim_cargo_targets?: string[];
};

export type StorageMeasurement = { free: number; total: number | null };
export type DriveAssessment = {
  state: "ok" | "warn" | "deny";
  deny_line: number;
  warn_line: number | null;
  stop_line: number | null;
};

const ObjectSchema = z.record(z.string(), z.unknown());

export function nonNegative(
  value: unknown,
  where: string,
  errors: string[],
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    errors.push(
      `${where}: expected a non-negative number, got ${JSON.stringify(value)}`,
    );
    return 0;
  }
  return value;
}

function percent(value: unknown, where: string, errors: string[]): number {
  const n = nonNegative(value, where, errors);
  if (n > 100) {
    errors.push(
      `${where}: a percentage of the drive must be within 0..100, got ${n}`,
    );
    return 0;
  }
  return n;
}

export function nonEmptyString(
  value: unknown,
  where: string,
  errors: string[],
): string {
  if (typeof value !== "string" || value === "") {
    errors.push(`${where}: expected a non-empty string`);
    return "";
  }
  return value;
}

function parseDrive(name: string, value: unknown, errors: string[]): Drive {
  const where = `drive.${name}`;
  const parsed = ObjectSchema.safeParse(value);
  if (!parsed.success) {
    errors.push(`${where}: expected a table`);
    return { label: "", path: "", deny_gib: 0, deny_pct: 0 };
  }
  const table = parsed.data;
  const allowed = new Set([
    "label",
    "path",
    "deny_gib",
    "deny_pct",
    "warn_gib",
    "warn_pct",
    "stop_gib",
    "rate_red_minutes",
    "rate_yellow_minutes",
    "recover_gib",
    "recover_pct",
    "tmp_recover_pct",
    "reclaim_cargo_targets",
  ]);
  for (const key of Object.keys(table))
    if (!allowed.has(key)) errors.push(`${where}: unknown key '${key}'`);

  const label = nonEmptyString(table.label, `${where}.label`, errors);
  // Accepted for the statusline; enforcement still depends only on free-space thresholds.
  const durations: { rate_red_minutes?: number; rate_yellow_minutes?: number } =
    {};
  for (const key of ["rate_red_minutes", "rate_yellow_minutes"] as const) {
    if (table[key] === undefined) continue;
    const duration = z.number().positive().safeParse(table[key]);
    if (duration.success) durations[key] = duration.data;
    else
      errors.push(`${where}.${key}: expected a positive duration in minutes`);
  }
  const path = nonEmptyString(table.path, `${where}.path`, errors);
  const rawDeny = table.deny_gib;
  const denyGib = nonNegative(rawDeny, `${where}.deny_gib`, errors);
  const denyPct = percent(table.deny_pct, `${where}.deny_pct`, errors);
  const warnGib =
    table.warn_gib === undefined
      ? undefined
      : nonNegative(table.warn_gib, `${where}.warn_gib`, errors);
  const warnPct =
    table.warn_pct === undefined
      ? undefined
      : percent(table.warn_pct, `${where}.warn_pct`, errors);
  if ((warnGib === undefined) !== (warnPct === undefined))
    errors.push(
      `${where}: warn_gib and warn_pct go together (both or neither)`,
    );
  const recoverGib =
    table.recover_gib === undefined
      ? undefined
      : nonNegative(table.recover_gib, `${where}.recover_gib`, errors);
  const recoverPct =
    table.recover_pct === undefined
      ? undefined
      : percent(table.recover_pct, `${where}.recover_pct`, errors);
  if ((recoverGib === undefined) !== (recoverPct === undefined))
    errors.push(
      `${where}: recover_gib and recover_pct go together (both or neither)`,
    );
  const tmpRecoverPct =
    table.tmp_recover_pct === undefined
      ? undefined
      : percent(table.tmp_recover_pct, `${where}.tmp_recover_pct`, errors);
  const cargoTargets = z
    .array(z.string().min(1))
    .optional()
    .safeParse(table.reclaim_cargo_targets);
  if (!cargoTargets.success)
    errors.push(
      `${where}.reclaim_cargo_targets: expected an array of non-empty path strings`,
    );
  const stopGib =
    table.stop_gib === undefined
      ? undefined
      : nonNegative(table.stop_gib, `${where}.stop_gib`, errors);
  if (
    name === "host" &&
    typeof table.stop_gib === "number" &&
    typeof rawDeny === "number" &&
    rawDeny > 0 &&
    table.stop_gib >= rawDeny
  ) {
    errors.push(`${where}.stop_gib: must be below deny_gib`);
  }
  return {
    label,
    name,
    ...durations,
    ...(recoverGib === undefined ? {} : { recover_gib: recoverGib }),
    ...(recoverPct === undefined ? {} : { recover_pct: recoverPct }),
    ...(tmpRecoverPct === undefined ? {} : { tmp_recover_pct: tmpRecoverPct }),
    ...(cargoTargets.success && cargoTargets.data !== undefined
      ? { reclaim_cargo_targets: cargoTargets.data }
      : {}),
    path,
    deny_gib: denyGib,
    deny_pct: denyPct,
    ...(warnGib === undefined ? {} : { warn_gib: warnGib }),
    ...(warnPct === undefined ? {} : { warn_pct: warnPct }),
    ...(stopGib === undefined ? {} : { stop_gib: stopGib }),
  };
}

/** Read and validate only schema and [drive.*]; other TOML sections belong to other consumers. */
export function loadStorageHeadroom(path: string): {
  drives: Drive[];
  errors: string[];
} {
  const errors: string[] = [];
  const parsedToml = fromThrowable(
    (): unknown => Bun.TOML.parse(readFileSync(path, "utf8")),
    (error) => (error instanceof Error ? error.message : String(error)),
  )();
  if (parsedToml.isErr())
    return {
      drives: [],
      errors: [`cannot read or parse ${path}: ${parsedToml.error}`],
    };
  const raw = parsedToml.value;
  const rootResult = ObjectSchema.safeParse(raw);
  if (!rootResult.success)
    return { drives: [], errors: ["top level: expected a table"] };
  const root = rootResult.data;
  if (root.schema !== 1)
    errors.push(`schema: expected 1, got ${JSON.stringify(root.schema)}`);
  const rawDrivesResult = ObjectSchema.safeParse(root.drive);
  if (
    !rawDrivesResult.success ||
    Object.keys(rawDrivesResult.data).length === 0
  ) {
    errors.push("drive: expected at least one [drive.<name>] table");
    return { drives: [], errors };
  }
  const rawDrives = rawDrivesResult.data;
  if (!ObjectSchema.safeParse(rawDrives.host).success)
    errors.push("drive.host: required Windows host drive table");
  const drives = Object.entries(rawDrives).map(([name, drive]) =>
    parseDrive(name, drive, errors),
  );
  return { drives: errors.length === 0 ? drives : [], errors };
}

/** Match the gate's strict-below boundaries. stop_line is reported for recovery policy callers. */
export function assess(
  drive: Drive,
  measured: StorageMeasurement,
): DriveAssessment {
  const denyLine = storageLine(drive.deny_gib, drive.deny_pct, measured.total);
  const warnLine =
    drive.warn_gib === undefined || drive.warn_pct === undefined
      ? null
      : storageLine(drive.warn_gib, drive.warn_pct, measured.total);
  const stopLine = drive.stop_gib === undefined ? null : drive.stop_gib * GiB;
  let state: DriveAssessment["state"] = "ok";
  if (measured.free < denyLine) state = "deny";
  else if (warnLine !== null && measured.free < warnLine) state = "warn";
  return {
    state,
    deny_line: denyLine,
    warn_line: warnLine,
    stop_line: stopLine,
  };
}

/** Free bytes available to an unprivileged caller and filesystem capacity; null on statfs failure. */
export function measureStorage(path: string): StorageMeasurement | null {
  const cacheDir = join(
    homedir(),
    ".cache",
    "claude-hooks",
    "storage-headroom",
  );
  const cacheFile = join(
    cacheDir,
    `${new Bun.CryptoHasher("sha1").update(path).digest("hex")}.statfs.json`,
  );
  const now = Temporal.Now.instant().epochMilliseconds;
  const cached = fromThrowable(() => {
    const parsed = jsonOf(
      z.object({
        free: z.number().nonnegative(),
        total: z.number().nonnegative(),
        at: z.number(),
      }),
    ).safeParse(readFileSync(cacheFile, "utf8"));
    return parsed.success &&
      now >= parsed.data.at &&
      now - parsed.data.at <= 2_000
      ? { free: parsed.data.free, total: parsed.data.total }
      : null;
  })();
  if (cached.isOk() && cached.value !== null) return cached.value;
  const result = fromThrowable(() => statfsSync(path))();
  if (result.isErr()) return null;
  const measured = {
    free: result.value.bavail * result.value.bsize,
    total: result.value.blocks * result.value.bsize,
  };
  fromThrowable(() => {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify({ ...measured, at: now }));
  })();
  return measured;
}

// --- Guest recovery: pressure level and the once-per-episode queue --------------------------------
// The gate's inode deny line for tmpfs (tools/storage-headroom/src/decision.ts hard-codes 95).
export const TMP_PATH = "/tmp";
export const INODE_DENY_PERCENT = 95;

export type PressureLevel = "ok" | "warn" | "deny";

const LEVEL_RANK: Record<PressureLevel, number> = { ok: 0, warn: 1, deny: 2 };

/** tmpfs use of /tmp in percent: the larger of inode and byte use; null when unmeasurable. */
export async function measureTmpPercent(
  path = TMP_PATH,
): Promise<number | null> {
  return statfs(path).then(
    ({ files, ffree, blocks, bavail }) => {
      const inodes = files > 0 ? (1 - ffree / files) * 100 : 0;
      const bytes = blocks > 0 ? (1 - bavail / blocks) * 100 : 0;
      return Math.max(inodes, bytes);
    },
    () => null,
  );
}

/** Guest `/` pressure: `deny` below the deny line, `warn` below the recovery line (else warn line). */
export function drivePressure(
  drive: Drive,
  measured: StorageMeasurement,
): { level: PressureLevel; reason: string } {
  const lines = assess(drive, measured);
  if (lines.state === "deny")
    return {
      level: "deny",
      reason: `${drive.label} free ${measured.free} B, deny line ${lines.deny_line} B`,
    };
  // The recovery line is the unit's own: the gate's warn line also refuses launches, so it stays put.
  const warnLine =
    drive.recover_gib !== undefined && drive.recover_pct !== undefined
      ? storageLine(drive.recover_gib, drive.recover_pct, measured.total)
      : (lines.warn_line ?? lines.deny_line);
  if (measured.free < warnLine)
    return {
      level: "warn",
      reason: `${drive.label} free ${measured.free} B, recover line ${warnLine} B`,
    };
  return { level: "ok", reason: "" };
}

/** /tmp pressure from its tmpfs use percent against `tmp_recover_pct`. */
export function tmpPressure(
  recoverPct: number,
  usedPct: number,
): PressureLevel {
  if (usedPct >= INODE_DENY_PERCENT) return "deny";
  return usedPct >= recoverPct ? "warn" : "ok";
}

/**
 * The episode ledger: queue recovery when pressure starts and once more if it escalates warn→deny;
 * a quiet drive ends the episode. `previous` is the highest level queued in this episode.
 */
export function episodeStep(
  previous: PressureLevel | null,
  now: PressureLevel,
): { queue: boolean; next: PressureLevel | null } {
  if (now === "ok") return { queue: false, next: null };
  if (previous === null) return { queue: true, next: now };
  const next = LEVEL_RANK[now] > LEVEL_RANK[previous] ? now : previous;
  return { queue: next !== previous, next };
}

export function guestRecoveryStateDir(): string {
  return (
    process.env.GUEST_RECOVERY_STATE_DIR ??
    join(homedir(), ".local", "state", "guest-capacity-recover")
  );
}

function episodeFile(stateDir: string): string {
  return join(stateDir, "episode.json");
}

export async function readEpisode(
  stateDir: string,
): Promise<PressureLevel | null> {
  const text = await readFile(episodeFile(stateDir), "utf8").then(
    (value) => value,
    () => "",
  );
  const parsed = jsonOf(
    z.object({ level: z.enum(["warn", "deny"]) }),
  ).safeParse(text);
  return parsed.success ? parsed.data.level : null;
}

/** Record the episode level; `null` ends the episode. Failure to write only risks a repeat queue. */
export async function writeEpisode(
  stateDir: string,
  level: PressureLevel | null,
): Promise<void> {
  await Promise.try(async () => {
    if (level === null || level === "ok") {
      await rm(episodeFile(stateDir), { force: true });
      return;
    }
    await mkdir(stateDir, { recursive: true });
    await writeFile(
      episodeFile(stateDir),
      JSON.stringify({
        level,
        at: Temporal.Now.instant().epochMilliseconds,
      }),
    );
  }).then(
    () => {},
    () => {},
  );
}

export const GUEST_RECOVERY_UNIT = "guest-capacity-recover.service";

/** Queue the oneshot without waiting for it (bounded by GNU timeout). */
export async function startGuestRecovery(): Promise<boolean> {
  const proc = Bun.spawn(
    ["systemctl", "--user", "--no-block", "start", GUEST_RECOVERY_UNIT],
    {
      stdout: "ignore",
      stderr: "ignore",
      timeout: 3_000,
      killSignal: "SIGTERM",
    },
  );
  return (await proc.exited) === 0;
}

export type GuestProbes = {
  measure?: (
    path: string,
  ) => StorageMeasurement | null | Promise<StorageMeasurement | null>;
  tmpUse?: () => number | null | Promise<number | null>;
};

/** The declared guest drive, or null when the config is invalid or declares none. */
export function loadGuestDrive(configPath: string): Drive | null {
  const loaded = loadStorageHeadroom(configPath);
  if (loaded.errors.length > 0) return null;
  return loaded.drives.find((d) => d.name === "guest") ?? null;
}

/** Worst of guest `/` and the tmpfs use of /tmp, measured now. */
export async function guestPressure(
  guest: Drive,
  options: GuestProbes = {},
): Promise<PressureLevel> {
  const [m, used] = await Promise.all([
    (options.measure ?? measureStorage)(guest.path),
    guest.tmp_recover_pct === undefined
      ? null
      : (options.tmpUse ?? measureTmpPercent)(),
  ]);
  let level: PressureLevel = m === null ? "ok" : drivePressure(guest, m).level;
  if (used !== null && guest.tmp_recover_pct !== undefined) {
    const next = tmpPressure(guest.tmp_recover_pct, used);
    if (LEVEL_RANK[next] > LEVEL_RANK[level]) level = next;
  }
  return level;
}

/**
 * Judge guest `/` and the tmpfs drive declared in `configPath`, advance the episode ledger and
 * queue the recovery unit when it says so. Returns the worst level seen and whether it queued.
 */
export async function requestGuestRecovery(
  configPath: string,
  options: GuestProbes & {
    start?: () => boolean | Promise<boolean>;
    stateDir?: string;
  } = {},
): Promise<{ level: PressureLevel; queued: boolean }> {
  const guest = loadGuestDrive(configPath);
  if (guest === null) return { level: "ok", queued: false };
  const level = await guestPressure(guest, options);
  const stateDir = options.stateDir ?? guestRecoveryStateDir();
  const step = episodeStep(await readEpisode(stateDir), level);
  await writeEpisode(stateDir, step.next);
  const queued = step.queue && (await (options.start ?? startGuestRecovery)());
  return { level, queued };
}
