import { homedir } from "node:os";
import { join } from "node:path";
import { err, ok, type Result } from "neverthrow";
import { execAsyncWithin, readJsonAsync, writeCacheAsync } from "./bounded.ts";
import { z } from "./zod.ts";

export const RECOVER_UNITS = [
  "wsl-capacity-recover.service",
  "guest-capacity-recover.service",
] as const;

export const RecoverHealthSchema = z.object({
  at: z.number().int().nonnegative(),
  unit: z.string(),
  line: z.string(),
  reason: z.string(),
});
export type RecoverHealth = z.output<typeof RecoverHealthSchema>;

export const RECOVER_HEALTH_CACHE = join(
  process.env["HOME"] ?? homedir(),
  ".cache/claude/statusline/recover-health.json",
);
export const RECOVER_HEALTH_STALE_MS = 90_000;

const RecoverSnapshotSchema = z.object({
  capturedAt: z.number().int().nonnegative(),
  health: RecoverHealthSchema.nullable(),
});
const now = (): number => Temporal.Now.instant().epochMilliseconds;

/** Read owner health only; the sampler owns all refreshes. */
export async function readRecoverHealthAsync(): Promise<
  Result<RecoverHealth | undefined, string>
> {
  const snapshot = await readJsonAsync(
    RECOVER_HEALTH_CACHE,
    RecoverSnapshotSchema,
  );
  if (snapshot === undefined) return err("recover health unavailable");
  return ok(snapshot.health ?? undefined);
}

/** Called only by the timer-owned sampler. */
export async function refreshRecoverHealth(): Promise<void> {
  let health: RecoverHealth | undefined;
  for (const unit of RECOVER_UNITS) {
    const journal = await execAsyncWithin(
      "journalctl",
      "journalctl",
      [
        "--user",
        `--unit=${unit}`,
        "-n",
        "120",
        "--no-pager",
        "--output=short-iso-precise",
      ],
      2_000,
    );
    if (journal.isErr()) continue;
    const failure = recoverJournalFailure(unit, journal.value, {
      at: now(),
    });
    if (failure !== undefined) {
      health = failure;
      break;
    }
  }
  await writeCacheAsync(RECOVER_HEALTH_CACHE, {
    capturedAt: now(),
    health: health ?? null,
  });
}

type Run = { lines: string[]; start: string };

function runsFor(log: string, unit: string): Run[] {
  const lines = log.split("\n").filter((line) => line !== "");
  const starts = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.includes(`Starting ${unit}`));
  if (starts.length === 0)
    return lines.length === 0 ? [] : [{ lines, start: "" }];
  return starts.map(({ line: start, index }, position) => ({
    start,
    lines: lines.slice(index, starts[position + 1]?.index ?? lines.length),
  }));
}

function pressurePercent(line: string): number | undefined {
  const inodes = /before_inodes=(\d+)\/(\d+)/u.exec(line);
  const bytes = /before_bytes=([\d.]+)GiB\/([\d.]+)GiB/u.exec(line);
  const inodePct =
    inodes === null || Number(inodes[2]) === 0
      ? undefined
      : (Number(inodes[1]) / Number(inodes[2])) * 100;
  const bytePct =
    bytes === null || Number(bytes[2]) === 0
      ? undefined
      : (Number(bytes[1]) / Number(bytes[2])) * 100;
  return Math.max(inodePct ?? 0, bytePct ?? 0);
}

function zeroProgress(line: string, thresholdPercent: number): boolean {
  const reclaimed = /reclaimed_inodes=(\d+) reclaimed_bytes=([\d.]+)GiB/u.exec(
    line,
  );
  return (
    reclaimed !== null &&
    Number(reclaimed[1]) === 0 &&
    Number(reclaimed[2]) === 0 &&
    (pressurePercent(line) ?? 0) >= thresholdPercent
  );
}

function failureForLine(line: string): RecoverHealth | undefined {
  const base = { at: 0, unit: "", line };
  if (/\bFATAL:/u.test(line)) return { ...base, reason: "FATAL" };
  const timedOut = /\btimeout=true\b/u.test(line);
  const exit = /\bexit=(-?\d+)/u.exec(line)?.[1];
  if (/TMPFS_RECLAIM\b/u.test(line)) {
    if (timedOut) return { ...base, reason: "reclaim timed out" };
    if (exit !== undefined && Number(exit) !== 0)
      return { ...base, reason: `reclaim exited ${exit}` };
  }
  if (/start operation timed out|Failed with result 'timeout'/iu.test(line))
    return { ...base, reason: "unit timed out" };
  const result = /Failed with result '([^']+)'/u.exec(line)?.[1];
  if (result === undefined || result === "success") return undefined;
  return {
    ...base,
    reason:
      result === "exit-code"
        ? "unit exited non-zero"
        : `unit failed (${result})`,
  };
}

function runFailure(run: Run): RecoverHealth | undefined {
  for (const line of run.lines) {
    const failure = failureForLine(line);
    if (failure !== undefined) return failure;
  }
  return undefined;
}

/** Return a finding for the last failed run, or two consecutive zero-progress runs under pressure. */
export function recoverJournalFailure(
  unit: string,
  log: string,
  options: { thresholdPercent?: number; at?: number } = {},
): RecoverHealth | undefined {
  const runs = runsFor(log, unit);
  const latest = runs.at(-1);
  if (latest === undefined) return undefined;
  const failure = runFailure(latest);
  if (failure !== undefined)
    return { ...failure, at: options.at ?? now(), unit };

  const previous = runs.at(-2);
  const threshold = options.thresholdPercent ?? 80;
  const latestReclaim = latest.lines.filter((line) =>
    line.includes("TMPFS_RECLAIM "),
  );
  const previousReclaim =
    previous?.lines.filter((line) => line.includes("TMPFS_RECLAIM ")) ?? [];
  const currentLine = latestReclaim.at(-1);
  const priorLine = previousReclaim.at(-1);
  if (
    currentLine !== undefined &&
    priorLine !== undefined &&
    zeroProgress(currentLine, threshold) &&
    zeroProgress(priorLine, threshold)
  )
    return {
      at: options.at ?? now(),
      unit,
      line: currentLine,
      reason:
        "two consecutive reclaim runs made no progress under the warn line",
    };
  return undefined;
}

export function recoverHealthBadge(
  health: RecoverHealth | undefined,
  at = Temporal.Now.instant().epochMilliseconds,
): string | undefined {
  if (
    health === undefined ||
    at < health.at ||
    at - health.at > RECOVER_HEALTH_STALE_MS
  )
    return undefined;
  const shortUnit = health.unit.replace("-capacity-recover.service", "");
  return `Recover: ${shortUnit} ${health.reason}`;
}
