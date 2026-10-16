import { appendFile, mkdir, readFile } from "node:fs/promises";
import { hostname, homedir } from "node:os";
import { dirname, join } from "node:path";
import { jsonOf, z } from "../../shared/src/zod.ts";

const HISTORY_LIMIT = 9;

export function indexRateFile(
  env: Record<string, string | undefined> = process.env,
  host = hostname(),
): string {
  const stateHome = env.XDG_STATE_HOME ?? join(homedir(), ".local/state");
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

export async function readIndexRate(
  path = indexRateFile(),
): Promise<number | null> {
  const content = await readFile(path, "utf8").catch(() => "");
  const rateSchema = jsonOf(
    z.object({ chunksPerSecond: z.number().positive() }),
  );
  const rates = content
    .split("\n")
    .filter(Boolean)
    .toReversed()
    .slice(0, HISTORY_LIMIT)
    .map((line) => rateSchema.safeParse(line))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data.chunksPerSecond);
  return median(rates);
}

export async function recordIndexRate(
  rate: number,
  elapsedSeconds: number,
  path = indexRateFile(),
): Promise<void> {
  if (!(rate > 0) || !(elapsedSeconds > 0)) return;
  await mkdir(dirname(path), { recursive: true });
  await appendFile(
    path,
    `${JSON.stringify({ chunksPerSecond: rate, elapsedSeconds, recordedAt: Temporal.Now.instant().toString() })}\n`,
  );
}
