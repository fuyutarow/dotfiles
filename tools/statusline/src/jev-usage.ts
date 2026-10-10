import { open, stat } from "node:fs/promises";
import { join } from "node:path";
import { err, fromThrowable, ok, type Result } from "neverthrow";
import { stateDir } from "./dispatch-state.ts";
import { jsonOf, z } from "./zod.ts";
import { formatCostUsd } from "../../shared/src/dispatch-pricing.ts";
import { loadRoster } from "../../../agents/models/roster.ts";

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

export type JevUsage = { costUsd: number | undefined };

async function parseTail(
  path: string,
  size: number,
  length: number,
  cutoff: number,
  now: number,
): Promise<{ input: number; output: number; known: boolean } | null> {
  const fd = await open(path, "r");
  const buffer = Buffer.alloc(length);
  const read = await fd.read(buffer, 0, length, size - length).then(
    (value) => ok(value),
    (error: unknown) => err(error),
  );
  await fd.close();
  if (read.isErr()) return null;
  const lines = buffer
    .subarray(0, read.value.bytesRead)
    .toString("utf8")
    .split("\n");
  if (length < size) lines.shift();
  let input = 0;
  let output = 0;
  let known = false;
  for (const line of lines) {
    const parsed = jsonOf(RUN).safeParse(line);
    if (!parsed.success) continue;
    const at = fromThrowable(
      () =>
        Temporal.Instant.from(parsed.data.started_at).epochMilliseconds / 1000,
    )().unwrapOr(Number.NaN);
    if (!Number.isFinite(at) || at < cutoff || at > now) continue;
    const usage = parsed.data.pick.jev?.response?.usage;
    if (usage?.input_tokens === undefined && usage?.output_tokens === undefined)
      continue;
    known = true;
    input += usage?.input_tokens ?? 0;
    output += usage?.output_tokens ?? 0;
  }
  return { input, output, known };
}

/** Read the seven-day Jev token total from the bounded tail of the router run log. */
export async function readJevUsage(
  now = Math.floor(Temporal.Now.instant().epochMilliseconds / 1000),
  path = join(stateDir(), "runs.jsonl"),
): Promise<Result<JevUsage | undefined, string>> {
  const info = await stat(path).catch(() => null);
  if (info === null || !info.isFile()) return ok(undefined);
  const maxLength = Math.min(info.size, MAX_TAIL_BYTES);
  const result = await (async () => {
    const lengths = new Set([
      Math.min(info.size, TAIL_BYTES),
      Math.min(info.size, 512 * 1024),
      maxLength,
    ]);
    let total = { input: 0, output: 0, known: false };
    for (const length of lengths) {
      const parsed = await parseTail(
        path,
        info.size,
        length,
        now - WINDOW_SECONDS,
        now,
      );
      if (parsed === null) return null;
      total = parsed;
      if (total.known || length === maxLength) break;
    }
    return total;
  })().catch(() => null);
  if (result === null) return err("Jev usage unavailable");
  if (!result.known) return ok(undefined);
  const prices = await loadRoster();
  if (!prices.ok) return err("Jev price unavailable");
  const jev = prices.value.auto.jev;
  const costUsd =
    jev.price_per_mtok_input === undefined ||
    jev.price_per_mtok_output === undefined
      ? undefined
      : (result.input * jev.price_per_mtok_input +
          result.output * jev.price_per_mtok_output) /
        1_000_000;
  return ok({
    costUsd,
  });
}

export function jevUsageSegment(
  usage: JevUsage | undefined,
  why?: string,
): string {
  if (usage?.costUsd === undefined)
    return `Jev n/a${why === undefined ? "" : ` (${why})`}`;
  const cost = formatCostUsd(usage.costUsd);
  return `Jev 7d spend ${cost}`;
}
