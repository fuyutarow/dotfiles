import { appendFile, mkdir, readFile } from "node:fs/promises";
import { availableParallelism, hostname, homedir, loadavg } from "node:os";
import { dirname, join } from "node:path";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";

const HISTORY_LIMIT = 9;
// Small/short runs mostly measure startup and incremental reuse, not bulk throughput.
export const MIN_PROCESSED_CHUNKS = 5_000;
export const MIN_ELAPSED_SECONDS = 10;
export const LOAD_PER_CPU_BAND = 0.5;

export function hostLoad() {
  return { startLoad1: loadavg()[0] ?? 0, nproc: availableParallelism() };
}

const MeasurementSchema = z.object({
  processedChunks: z.number().int().nonnegative(),
  fullRebuild: z.boolean(),
  workSource: z.literal("persisted-count-delta"),
  elapsedSeconds: z.number().positive(),
  startLoad1: z.number().nonnegative(),
  nproc: z.number().int().positive(),
  cccVersion: z.string().min(1),
});
export type IndexMeasurement = z.infer<typeof MeasurementSchema>;

export function processedWork(initial: number | undefined, completed: number) {
  return {
    processedChunks: Math.max(0, completed - (initial ?? completed)),
    fullRebuild: initial === 0,
    workSource: "persisted-count-delta" as const,
  };
}

export function indexRateFile(
  env: Record<string, string | undefined> = process.env,
  host = hostname(),
): string {
  const stateHome = env["XDG_STATE_HOME"] ?? join(homedir(), ".local/state");
  const hostKey = host.replaceAll(/[^a-zA-Z0-9._-]/gu, "_");
  return join(stateHome, "repo-retrieve", hostKey, "index-rates.jsonl");
}

export function median(values: number[]): number | null {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .filter((value) => value > 0)
    .toSorted((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  if (upper === undefined) return null;
  if (sorted.length % 2 !== 0) return upper;
  const lower = sorted[middle - 1];
  if (lower === undefined) return null;
  return (lower + upper) / 2;
}

export function selectIndexRate(content: string, current = hostLoad()) {
  const records = content.split("\n").flatMap((line, index) => {
    if (line.trim() === "") return [];
    const parsed = jsonOf(MeasurementSchema).safeParse(line);
    let reason: string | undefined;
    if (!parsed.success)
      reason = "legacy/invalid: missing work/load provenance";
    else if (!parsed.data.fullRebuild) reason = "incremental/unknown rebuild";
    else if (parsed.data.processedChunks < MIN_PROCESSED_CHUNKS)
      reason = `processedChunks < MIN_PROCESSED_CHUNKS=${MIN_PROCESSED_CHUNKS}`;
    else if (parsed.data.elapsedSeconds < MIN_ELAPSED_SECONDS)
      reason = `elapsedSeconds < MIN_ELAPSED_SECONDS=${MIN_ELAPSED_SECONDS}`;
    const comparable =
      parsed.success &&
      Math.abs(
        parsed.data.startLoad1 / parsed.data.nproc -
          current.startLoad1 / current.nproc,
      ) <= LOAD_PER_CPU_BAND;
    return [
      {
        id: index + 1,
        data: parsed.success ? parsed.data : undefined,
        reason,
        comparable,
      },
    ];
  });
  const eligible = records.filter((record) => record.reason === undefined);
  const comparable = eligible.filter((record) => record.comparable);
  const pool = comparable.length > 0 ? comparable : eligible;
  const selected = pool.slice(-HISTORY_LIMIT);
  const used = new Set(selected.map((record) => record.id));
  const rate = median(
    selected.flatMap(({ data }) =>
      data === undefined ? [] : [data.processedChunks / data.elapsedSeconds],
    ),
  );
  const details = records.map((record) => {
    if (used.has(record.id))
      return `#${record.id}=used(${record.data === undefined ? "?" : (record.data.processedChunks / record.data.elapsedSeconds).toFixed(3)} chunks/s)`;
    const reason =
      record.reason ??
      (comparable.length > 0 && !record.comparable
        ? `load outside LOAD_PER_CPU_BAND=${LOAD_PER_CPU_BAND}`
        : `older than latest ${HISTORY_LIMIT} qualifying records`);
    return `#${record.id}=excluded(${reason})`;
  });
  const selection =
    comparable.length > 0
      ? "comparable load"
      : "no comparable load; all qualifying loads";
  const detailReport = details.length === 0 ? "no records" : details.join("; ");
  return {
    rate,
    report: `RATE HISTORY: load=${current.startLoad1.toFixed(2)}/${current.nproc} CPUs; ${selection}; ${detailReport}; ${rate === null ? "configured fallback" : "median of used records"}`,
  };
}

export async function readIndexRate(
  path = indexRateFile(),
  current = hostLoad(),
) {
  return selectIndexRate(await readFile(path, "utf8").catch(() => ""), current);
}

export async function recordIndexRate(
  measurement: IndexMeasurement,
  path = indexRateFile(),
): Promise<void> {
  const parsed = MeasurementSchema.safeParse(measurement);
  if (
    !parsed.success ||
    measurement.processedChunks < MIN_PROCESSED_CHUNKS ||
    measurement.elapsedSeconds < MIN_ELAPSED_SECONDS
  )
    return;
  await mkdir(dirname(path), { recursive: true });
  await appendFile(
    path,
    `${JSON.stringify({ ...parsed.data, chunksPerSecond: measurement.processedChunks / measurement.elapsedSeconds, recordedAt: Temporal.Now.instant().toString() })}\n`,
  );
}
