import { openSync, readSync, closeSync, statSync } from "node:fs";
import { join } from "node:path";
import { err, fromThrowable, ok, type Result } from "neverthrow";
import { stateDir } from "./dispatch-state.ts";
import { jsonOf, z } from "./zod.ts";

const USAGE = z.looseObject({
  input_tokens: z.number().nonnegative().optional(),
  output_tokens: z.number().nonnegative().optional(),
});
const PICK = z.looseObject({
  jev: z
    .looseObject({ response: z.looseObject({ usage: USAGE }).optional() })
    .optional(),
});
const RUN = z.looseObject({
  kind: z.literal("run"),
  started_at: z.string(),
  pick: PICK,
});
const TAIL_BYTES = 256 * 1024;
const MAX_TAIL_BYTES = 8 * 1024 * 1024;
const WINDOW_SECONDS = 7 * 24 * 60 * 60;

export type JevUsage = { tokens: number };

function parseTail(
  path: string,
  size: number,
  length: number,
  cutoff: number,
  now: number,
): number {
  const fd = openSync(path, "r");
  const buffer = Buffer.alloc(length);
  const read = fromThrowable(() =>
    readSync(fd, buffer, 0, length, size - length),
  )();
  closeSync(fd);
  if (read.isErr()) return 0;
  const lines = buffer.toString("utf8").split("\n");
  if (length < size) lines.shift();
  let tokens = 0;
  for (const line of lines) {
    const parsed = jsonOf(RUN).safeParse(line);
    if (!parsed.success) continue;
    const at = fromThrowable(
      () =>
        Temporal.Instant.from(parsed.data.started_at).epochMilliseconds / 1000,
    )().unwrapOr(Number.NaN);
    if (!Number.isFinite(at) || at < cutoff || at > now) continue;
    const usage = parsed.data.pick.jev?.response?.usage;
    tokens += (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);
  }
  return tokens;
}

/** Read the seven-day Jev token total from the bounded tail of the router run log. */
export function readJevUsage(
  now = Math.floor(Temporal.Now.instant().epochMilliseconds / 1000),
): Result<JevUsage | undefined, string> {
  const path = join(stateDir(), "runs.jsonl");
  const stat = fromThrowable(() => statSync(path))();
  if (stat.isErr() || !stat.value.isFile()) return ok(undefined);
  const info = stat.value;
  const maxLength = Math.min(info.size, MAX_TAIL_BYTES);
  const result = fromThrowable(() => {
    const lengths = new Set([
      Math.min(info.size, TAIL_BYTES),
      Math.min(info.size, 512 * 1024),
      maxLength,
    ]);
    let total = 0;
    for (const length of lengths) {
      total = parseTail(path, info.size, length, now - WINDOW_SECONDS, now);
      if (total > 0 || length === maxLength) break;
    }
    return total;
  })();
  return result.isOk()
    ? ok({ tokens: result.value })
    : err("Jev usage unavailable");
}

export function jevUsageSegment(usage: JevUsage | undefined): string {
  if (usage === undefined || usage.tokens <= 0) return "";
  let value: string;
  if (usage.tokens >= 1_000_000)
    value = `${(usage.tokens / 1_000_000).toFixed(1).replace(/\.0$/u, "")}M`;
  else if (usage.tokens >= 1_000)
    value = `${(usage.tokens / 1_000).toFixed(1).replace(/\.0$/u, "")}K`;
  else value = String(usage.tokens);
  return `Jev ${value} tok`;
}
