import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { attemptOr } from "../../shared/src/attempt.ts";
import { fromThrowable } from "neverthrow";
import {
  DEFAULT_JSONL_TAIL_BYTES,
  jsonlLines,
  readJsonlTail,
} from "../../shared/src/jsonl.ts";
import { dispatchStateDir } from "../../shared/src/dispatch-state.ts";
import { jsonOf, z } from "../../shared/src/zod.ts";
import type { HookContext } from "./runtime.ts";
import { projectCwd } from "./attribution.ts";
import { gpu } from "./conditions.ts";
import {
  GpuReadingSchema,
  GpuUtilSchema,
  LauncherRunsTodaySchema,
  MinutesSinceLastResultSchema,
  validated,
} from "./schemas.ts";

const LedgerRun = z.looseObject({
  kind: z.literal("run"),
  run_id: z.string().min(1),
  cwd: z.string().optional(),
  started_at: z.string().optional(),
  ended_at: z.string().optional(),
  result: z.enum(["delivered", "returned", "failed", "abandoned"]).optional(),
});
const LEDGER_BUDGET_MS = 1_000;
const MINUTES_MS = 60_000;

function instant(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = fromThrowable(
    () => Temporal.Instant.from(value),
    (error) => error,
  )();
  return parsed.isOk() && Number.isFinite(parsed.value.epochMilliseconds)
    ? parsed.value.epochMilliseconds
    : undefined;
}

async function ledgerRecords(): Promise<z.output<typeof LedgerRun>[]> {
  const dir = dispatchStateDir();
  const names = await readdir(dir).catch(() => []);
  const archives = names
    .filter((name) => /^runs-\d{4}-\d{2}-\d{2}\.jsonl$/u.test(name))
    .toSorted()
    .slice(-2);
  const files = [...archives, "runs.jsonl"].map((name) => join(dir, name));
  const rows = await Promise.all(
    files.map(async (path) => {
      const { text } = await readJsonlTail(
        path,
        DEFAULT_JSONL_TAIL_BYTES,
      ).catch(() => ({ text: "", startOffset: 0 }));
      return [...jsonlLines(text)].flatMap((line) => {
        const parsed = jsonOf(LedgerRun).safeParse(line);
        return parsed.success ? [parsed.data] : [];
      });
    }),
  );
  return rows.flat();
}

async function bounded<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((done) => {
    timer = setTimeout(() => {
      done(fallback);
    }, LEDGER_BUDGET_MS);
  });
  const value = await Promise.race([attemptOr(fn, fallback), timeout]);
  if (timer !== undefined) clearTimeout(timer);
  return value;
}

function insideProject(
  recordCwd: string | undefined,
  project: string,
): boolean {
  return projectCwd(recordCwd, resolve(project));
}

/** Count launcher run receipts started today in the host's local timezone. */
export function launcherRunsToday(
  _ctx: HookContext,
  options: { project: string },
): Promise<number> {
  return bounded(async () => {
    const today = Temporal.Now.zonedDateTimeISO().toPlainDate().toString();
    const ids = new Set<string>();
    for (const record of await ledgerRecords()) {
      const started = instant(record.started_at);
      if (
        started === undefined ||
        !insideProject(record.cwd, options.project) ||
        Temporal.Instant.fromEpochMilliseconds(started)
          .toZonedDateTimeISO(Temporal.Now.timeZoneId())
          .toPlainDate()
          .toString() !== today
      )
        continue;
      ids.add(record.run_id);
    }
    return validated(LauncherRunsTodaySchema, ids.size, 0);
  }, 0);
}

/** Minutes since the latest completed result for this project; null means none is recorded. */
export function minutesSinceLastResult(
  _ctx: HookContext,
  options: { project: string },
): Promise<number | null> {
  return bounded(async () => {
    const ended = (await ledgerRecords())
      .filter(
        (record) =>
          record.result !== undefined &&
          insideProject(record.cwd, options.project),
      )
      .flatMap((record) => {
        const value = instant(record.ended_at);
        return value === undefined ? [] : [value];
      });
    const latest = Math.max(...ended);
    const minutes = Number.isFinite(latest)
      ? Math.max(
          0,
          (Temporal.Now.instant().epochMilliseconds - latest) / MINUTES_MS,
        )
      : null;
    return validated(MinutesSinceLastResultSchema, minutes, null);
  }, null);
}

/** Current NVIDIA GPU utilization percentage; null when GPU sampling is unavailable. */
export async function gpuUtil(ctx: HookContext): Promise<number | null> {
  const reading = await gpu(ctx);
  const parsed = GpuReadingSchema.safeParse(reading);
  const value = parsed.success ? parsed.data.nowPct : null;
  return validated(GpuUtilSchema, value, null);
}
