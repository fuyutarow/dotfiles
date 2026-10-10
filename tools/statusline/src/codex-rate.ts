import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { err, fromThrowable, ok, type Result } from "neverthrow";
import { jsonOf, maybe, z } from "./zod.ts";
import {
  clockHM,
  localFromEpochSec,
  nowEpochSec,
  pad2,
  stampMDHM,
} from "./prompt-stamp.ts";
import { paceColor, pctFmt, roles } from "./ansi.ts";
import type { TokenUsage } from "../../shared/src/dispatch-pricing.ts";

const WINDOW = z.object({
  used_percent: maybe(z.number()),
  window_minutes: maybe(z.number()),
  resets_at: maybe(z.number()),
});
const RATE = z.object({
  limit_id: maybe(z.string()),
  primary: maybe(WINDOW),
  secondary: maybe(WINDOW),
  credits: maybe(
    z.object({
      has_credits: maybe(z.boolean()),
      unlimited: maybe(z.boolean()),
      balance: maybe(z.string()),
    }),
  ),
});
const TOKEN_COUNT_EVENT = z.object({
  timestamp: maybe(z.string()),
  type: z.literal("event_msg"),
  payload: z.object({
    type: z.literal("token_count"),
    rate_limits: RATE,
  }),
});
type Window = { minutes: number; percent: number; reset?: number };
export type CodexRate = {
  windows: Window[];
  credits?: string;
  mtimeMs: number;
};
const TAIL_BYTES = 256 * 1024;
const MAX_TAIL_BYTES = 8 * 1024 * 1024;
const STALE_MS = 30 * 60 * 1000;
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

async function newestRollout(root: string): Promise<string | undefined> {
  const today = Temporal.Now.plainDateISO();
  for (let dayOffset = 0; dayOffset <= 366; dayOffset++) {
    const day = today.subtract({ days: dayOffset });
    const dir = join(root, String(day.year), pad2(day.month), pad2(day.day));
    const names = await readdir(dir).catch(() => []);
    const infos = await Promise.all(
      names
        .filter((name) => /^rollout-.*\.jsonl$/u.test(name))
        .map(async (name) => {
          const path = join(dir, name);
          const info = await stat(path).catch(() => null);
          return info !== null && info.isFile()
            ? { path, mtimeMs: info.mtimeMs }
            : undefined;
        }),
    );
    const newest = infos
      .filter((info) => info !== undefined)
      .toSorted((a, b) => b.mtimeMs - a.mtimeMs)[0];
    if (newest !== undefined) return newest.path;
  }
  return undefined;
}

async function rolloutForSession(
  root: string,
  session: string,
): Promise<string | undefined> {
  const today = Temporal.Now.plainDateISO();
  for (let offset = 0; offset <= 366; offset++) {
    const day = today.subtract({ days: offset });
    const dir = join(root, String(day.year), pad2(day.month), pad2(day.day));
    const names = await readdir(dir).catch(() => []);
    const name = names.find(
      (item) =>
        item.startsWith("rollout-") && item.endsWith(`-${session}.jsonl`),
    );
    if (name !== undefined) return join(dir, name);
  }
  return undefined;
}

function asWindow(
  value: z.output<typeof WINDOW> | undefined,
): Window | undefined {
  if (value?.used_percent === undefined) return undefined;
  if (value.window_minutes === undefined) return undefined;
  if (value.resets_at === undefined)
    return { minutes: value.window_minutes, percent: value.used_percent };
  return {
    minutes: value.window_minutes,
    percent: value.used_percent,
    reset: value.resets_at,
  };
}

// Async file operations let the dataframe's source deadline win even on slow storage.
async function selectRateAsync(path: string, size: number, length: number) {
  const fd = await open(path, "r");
  const buffer = Buffer.alloc(length);
  const read = await fd.read(buffer, 0, length, size - length).then(
    (value) => ok(value),
    (error: unknown) => err(error),
  );
  await fd.close();
  if (read.isErr()) return err("codex rate unavailable");
  const lines = buffer
    .subarray(0, read.value.bytesRead)
    .toString("utf8")
    .split("\n");
  if (length < size) lines.shift();
  for (const line of lines.toReversed()) {
    const parsed = jsonOf(TOKEN_COUNT_EVENT).safeParse(line);
    if (parsed.success) return ok(parsed.data);
  }
  return ok(undefined);
}

export async function readCodexRate(
  root = join(process.env.HOME ?? "", ".codex", "sessions"),
  session?: string,
): Promise<Result<CodexRate | undefined, string>> {
  const path =
    session === undefined
      ? await newestRollout(root)
      : await rolloutForSession(root, session);
  if (path === undefined) return ok(undefined);
  const info = await stat(path).catch(() => null);
  if (info === null) return err("codex rate unavailable");
  let selected: z.output<typeof TOKEN_COUNT_EVENT> | undefined;
  const maxLength = Math.min(info.size, MAX_TAIL_BYTES);
  const readResult = await (async () => {
    const lengths = new Set([
      Math.min(info.size, TAIL_BYTES),
      Math.min(info.size, 512 * 1024),
      maxLength,
    ]);
    for (const length of lengths) {
      const result = await selectRateAsync(path, info.size, length);
      if (result.isErr()) return false;
      selected = result.value;
      if (selected !== undefined || length === maxLength) break;
    }
    return true;
  })().catch(() => false);
  if (!readResult) return err("codex rate unavailable");
  if (selected === undefined) return ok(undefined);
  const rate = selected.payload.rate_limits;
  const timestamp = selected.timestamp;
  const eventTime =
    timestamp === undefined
      ? undefined
      : fromThrowable(
          () => Temporal.Instant.from(timestamp).epochMilliseconds,
        )().unwrapOr(undefined);
  const mtimeMs =
    eventTime === undefined ? info.mtimeMs : Math.min(info.mtimeMs, eventTime);
  const windows = [asWindow(rate.primary), asWindow(rate.secondary)].filter(
    (item) => item !== undefined,
  );
  const balance = rate.credits?.balance;
  let credits: string | undefined;
  if (
    rate.credits?.has_credits === true &&
    rate.credits.unlimited === false &&
    balance !== undefined
  )
    credits = String(Math.round(Number(balance)));
  if (windows.length === 0 && credits === undefined) return ok(undefined);
  if (credits === undefined) return ok({ windows, mtimeMs });
  return ok({ windows, credits, mtimeMs });
}

function remaining(epoch: number, now: number): string {
  const seconds = Math.max(0, epoch - now);
  if (seconds >= 86400)
    return `${Math.floor(seconds / 86400)}d${Math.floor((seconds % 86400) / 3600)}h`;
  return `${Math.floor(seconds / 3600)}h${pad2(Math.floor((seconds % 3600) / 60))}m`;
}
export function codexRateSegment(
  rate: CodexRate | undefined,
  why?: string,
  now = nowEpochSec(),
): string {
  if (rate === undefined) {
    return roles.unavailable("codex", why);
  }
  const ageMs = Temporal.Now.instant().epochMilliseconds - rate.mtimeMs;
  if (ageMs > STALE_MS) return roles.unavailable("codex", "stale source");
  const parts = rate.windows.map((window) => {
    let label = `${window.minutes}m`;
    if (window.minutes === 300) label = "5h";
    if (window.minutes === 10080) label = "7d";
    const formatted = pctFmt(window.percent);
    const elapsed =
      window.reset === undefined || window.minutes <= 0
        ? undefined
        : Math.max(
            0,
            Math.min(
              100,
              (1 - Math.max(0, window.reset - now) / (window.minutes * 60)) *
                100,
            ),
          );
    let item = `${roles.label("codex")} ${roles.window(label)} ${roles.value(`${formatted.text}%`, paceColor(window.percent, elapsed))}`;
    if (window.reset !== undefined) {
      const local = localFromEpochSec(window.reset);
      let stamp = stampMDHM(local);
      if (window.minutes === 300) stamp = clockHM(local);
      item += ` ${roles.secondary(`⟳${stamp}(${remaining(window.reset, now)} ${Math.round(elapsed ?? 0)}%)`)}`;
    }
    return item;
  });
  if (parts.length === 0) return roles.unavailable("codex");
  return parts.join(roles.separator());
}
