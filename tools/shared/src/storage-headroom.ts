// Shared, zero-dependency storage thresholds. The TOML remains the authority for drive policy.

import { readFileSync, statfsSync } from "node:fs";
import { fromThrowable, z } from "./zod.ts";

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
};

export type StorageMeasurement = { free: number; total: number | null };
export type DriveAssessment = {
  state: "ok" | "warn" | "deny";
  deny_line: number;
  warn_line: number | null;
  stop_line: number | null;
};

const ObjectSchema = z.record(z.string(), z.unknown());

function nonNegative(value: unknown, where: string, errors: string[]): number {
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

function nonEmptyString(
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
  ]);
  for (const key of Object.keys(table))
    if (!allowed.has(key)) errors.push(`${where}: unknown key '${key}'`);

  const label = nonEmptyString(table.label, `${where}.label`, errors);
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
  const result = fromThrowable(() => statfsSync(path))();
  if (result.isErr()) return null;
  return {
    free: result.value.bavail * result.value.bsize,
    total: result.value.blocks * result.value.bsize,
  };
}
