import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { pad2 } from "../../src/prompt-stamp.ts";
import { readJsonlTail } from "@dotfiles/shared/src/jsonl.ts";
import { err, ok, type Result } from "neverthrow";
import { jsonOf, z } from "../../src/zod.ts";
import type { CodexRate } from "../../src/codex-rate.ts";
const LiveRateEvent = z.object({
  timestamp: z.iso.datetime({ offset: true }).optional(),
  type: z.literal("event_msg"),
  payload: z.object({
    type: z.literal("token_count"),
    rate_limits: z.object({
      primary: z.unknown().optional(),
      secondary: z.unknown().optional(),
      credits: z
        .object({
          has_credits: z.boolean().optional(),
          unlimited: z.boolean().optional(),
          balance: z.string().optional(),
        })
        .nullish(),
    }),
  }),
});
const LiveRateWindow = z.object({
  used_percent: z.number(),
  window_minutes: z.number(),
  resets_at: z.number().optional(),
});

/** Standalone rendering uses only a process-associated rollout, never the account store. */
export async function readLiveCodexRate(
  path?: string,
): Promise<Result<CodexRate | undefined, string>> {
  if (path === undefined) return ok(undefined);
  const tail = await readJsonlTail(path, 512 * 1024).catch(() => null);
  if (tail === null) return err("live Codex rollout unreadable");
  const now = Temporal.Now.instant().epochMilliseconds;
  for (const line of tail.text.split("\n").toReversed()) {
    if (!line.includes('"token_count"')) continue;
    const parsed = jsonOf(LiveRateEvent).safeParse(line);
    if (!parsed.success) continue;
    const at = parsed.data.timestamp;
    if (at === undefined) continue;
    const mtimeMs = Temporal.Instant.from(at).epochMilliseconds;
    if (mtimeMs > now || now - mtimeMs > 7 * 24 * 60 * 60 * 1000) continue;
    const limits = parsed.data.payload.rate_limits;
    const windows = [limits.primary, limits.secondary].flatMap((value) => {
      const window = LiveRateWindow.safeParse(value);
      if (!window.success) return [];
      return [
        {
          minutes: window.data.window_minutes,
          percent: window.data.used_percent,
          ...(window.data.resets_at === undefined
            ? {}
            : { reset: window.data.resets_at }),
        },
      ];
    });
    if (windows.length === 0) continue;
    const credit = limits.credits;
    const credits =
      credit?.has_credits === true &&
      credit.unlimited === false &&
      credit.balance !== undefined
        ? String(Math.round(Number(credit.balance)))
        : undefined;
    return ok({
      windows,
      mtimeMs,
      ...(credits === undefined ? {} : { credits }),
    });
  }
  return ok(undefined);
}

type TokenUsage = {
  input_tokens?: number | undefined;
  cached_input_tokens?: number | undefined;
  output_tokens?: number | undefined;
  reasoning_output_tokens?: number | undefined;
};
const TAIL_BYTES = 256 * 1024;
const MAX_TAIL_BYTES = 8 * 1024 * 1024;
const TOKEN_USAGE = z.object({
  input_tokens: z.number().nonnegative(),
  cached_input_tokens: z.number().nonnegative().optional(),
  output_tokens: z.number().nonnegative(),
  reasoning_output_tokens: z.number().nonnegative().optional(),
});
const TOKEN_COUNT = z.object({
  type: z.literal("event_msg"),
  payload: z.object({
    type: z.literal("token_count"),
    info: z.object({ total_token_usage: TOKEN_USAGE }),
  }),
});
async function selectUsageFromTail(
  path: string,
  size: number,
  length: number,
): Promise<TokenUsage | undefined> {
  await using fd = await open(path, "r");
  const buffer = Buffer.alloc(length);
  let bytesRead = 0;
  while (bytesRead < length) {
    const read = await fd.read(
      buffer,
      bytesRead,
      length - bytesRead,
      size - length + bytesRead,
    );
    if (read.bytesRead === 0) break;
    bytesRead += read.bytesRead;
  }
  const lines = buffer.subarray(0, bytesRead).toString("utf8").split("\n");
  if (length < size) lines.shift();
  for (const line of lines.toReversed()) {
    if (line.trim() === "") continue;
    const parsed = jsonOf(TOKEN_COUNT).safeParse(line);
    if (parsed.success) return parsed.data.payload.info.total_token_usage;
  }
  return undefined;
}

async function usageFromRollout(path: string): Promise<TokenUsage | null> {
  const info = await stat(path).catch(() => null);
  if (info === null || !info.isFile()) return null;
  const size = info.size;
  const maxLength = Math.min(size, MAX_TAIL_BYTES);
  const lengths = new Set([
    Math.min(size, TAIL_BYTES),
    Math.min(size, 512 * 1024),
    maxLength,
  ]);
  for (const length of lengths) {
    const usage = await selectUsageFromTail(path, size, length).catch(
      () => null,
    );
    if (usage !== null && usage !== undefined) return usage;
    if (length === maxLength) break;
  }
  return null;
}

/** Last cumulative token total for a Codex session, read from a bounded rollout tail. */
export async function readCodexUsage(
  root: string,
  session: string,
): Promise<TokenUsage | undefined> {
  const today = Temporal.Now.plainDateISO();
  const dates = [today, today.subtract({ days: 1 })];
  for (let offset = 2; offset <= 366; offset++)
    dates.push(today.subtract({ days: offset }));
  for (const day of dates) {
    const dir = join(root, String(day.year), pad2(day.month), pad2(day.day));
    const names = await readdir(dir).catch(() => []);
    const name = names.find(
      (item) =>
        item.startsWith("rollout-") && item.endsWith(`-${session}.jsonl`),
    );
    if (name === undefined) continue;
    const path = join(dir, name);
    const usage = await usageFromRollout(path);
    if (usage !== undefined && usage !== null) return usage;
  }
  return undefined;
}
