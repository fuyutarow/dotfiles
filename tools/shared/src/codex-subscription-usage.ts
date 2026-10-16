import { open, readdir, stat, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { fromThrowable, jsonOf, z } from "./zod.ts";
import type { SubscriptionUsageWindow } from "./subscription-usage.ts";

const Window = z.object({
  used_percent: z.number(),
  window_minutes: z.number(),
  resets_at: z.number().optional(),
});
const Event = z.object({
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
export type CodexAccountRate = {
  windows: { minutes: number; percent: number; reset?: number }[];
  credits?: string;
  mtimeMs: number;
};
type Reading = { rate: CodexAccountRate; window?: SubscriptionUsageWindow };

function fromLine(
  line: string,
  mtimeMs: number,
  nowMs: number,
  maxAgeMs: number,
): Reading | undefined {
  // Most rollout bytes are assistant output, not usage. Avoid decoding that output.
  if (!line.includes('"token_count"')) return undefined;
  const event = jsonOf(Event).safeParse(line);
  if (!event.success) return undefined;
  const timestamp = event.data.timestamp;
  const eventTime =
    timestamp === undefined
      ? Math.floor(mtimeMs)
      : fromThrowable(
          () => Temporal.Instant.from(timestamp).epochMilliseconds,
        )().unwrapOr(undefined);
  if (eventTime === undefined || eventTime > nowMs) return undefined;
  const measuredAt = Math.min(Math.floor(mtimeMs), eventTime);
  if (nowMs - measuredAt > maxAgeMs) return undefined;
  const limits = event.data.payload.rate_limits;
  const windows = [limits.primary, limits.secondary].flatMap((candidate) => {
    const parsed = Window.safeParse(candidate);
    if (!parsed.success) return [];
    const value = parsed.data;
    return [
      {
        minutes: value.window_minutes,
        percent: value.used_percent,
        ...(value.resets_at === undefined ? {} : { reset: value.resets_at }),
      },
    ];
  });
  if (windows.length === 0) return undefined;
  const credit = limits.credits;
  const credits =
    credit?.has_credits === true &&
    credit.unlimited === false &&
    credit.balance !== undefined
      ? String(Math.round(Number(credit.balance)))
      : undefined;
  const rate = {
    windows,
    mtimeMs: measuredAt,
    ...(credits === undefined ? {} : { credits }),
  };
  const weekly = windows.find(
    (window) =>
      window.minutes === 10080 &&
      window.reset !== undefined &&
      window.reset * 1000 > nowMs,
  );
  if (weekly?.reset === undefined) return { rate };
  return {
    rate,
    window: {
      used_percent: weekly.percent,
      resets_at: weekly.reset,
      window_seconds: 604800,
      measured_at: measuredAt,
    },
  };
}

async function readBlock(handle: FileHandle, start: number, end: number) {
  const buffer = Buffer.alloc(end - start);
  let offset = 0;
  while (offset < buffer.length) {
    const read = await handle
      .read(buffer, offset, buffer.length - offset, start + offset)
      .catch(() => null);
    if (read === null || read.bytesRead === 0) return null;
    offset += read.bytesRead;
  }
  return buffer;
}

function selectLines(
  lines: string[],
  mtimeMs: number,
  nowMs: number,
  maxAgeMs: number,
) {
  let fallback: Reading | undefined;
  for (const line of lines.toReversed()) {
    const reading = fromLine(line, mtimeMs, nowMs, maxAgeMs);
    if (reading === undefined) continue;
    fallback ??= reading;
    if (reading.window !== undefined) return { fallback, selected: reading };
  }
  return { fallback, selected: undefined };
}

// Walk backwards in bounded chunks, including beyond the former 8 MiB tail cap.
// Carry only one bounded line; oversized assistant records cannot be usage events.
async function readRollout(
  path: string,
  size: number,
  mtimeMs: number,
  nowMs: number,
  maxAgeMs: number,
) {
  const fd = await open(path, "r").catch(() => null);
  if (fd === null) return { failed: true };
  await using handle = fd;
  let end = size;
  let suffix = "";
  let discard = false;
  let fallback: Reading | undefined;
  while (end > 0) {
    const start = Math.max(0, end - 256 * 1024);
    const buffer = await readBlock(handle, start, end);
    if (buffer === null) return { failed: true };
    const lines = buffer.toString("utf8").split("\n");
    const hasNewline = lines.length > 1;
    const last = lines.pop() ?? "";
    if (!discard) lines.push(last + suffix);
    // The first line may start in the preceding chunk. Never parse a partial line.
    suffix = start > 0 ? (lines.shift() ?? "") : "";
    discard = (discard && !hasNewline) || suffix.length > 8 * 1024 * 1024;
    if (discard) suffix = "";
    const { selected, fallback: found } = selectLines(
      lines,
      mtimeMs,
      nowMs,
      maxAgeMs,
    );
    if (
      found !== undefined &&
      (fallback === undefined || found.rate.mtimeMs > fallback.rate.mtimeMs)
    )
      fallback = found;
    if (selected !== undefined) return { reading: selected, failed: false };
    end = start;
  }
  return { reading: fallback, failed: false };
}

type Source = { path: string; size: number; mtimeMs: number };
const readings = new Map<
  string,
  { mtimeMs: number; size: number; reading: Reading }
>();
const MAX_CACHED_SOURCES = 256;

async function readCachedRollout(
  source: Source,
  nowMs: number,
  maxAgeMs: number,
) {
  const cached = readings.get(source.path);
  const window = cached?.reading.window;
  if (
    cached?.mtimeMs === source.mtimeMs &&
    cached.size === source.size &&
    window !== undefined &&
    window.measured_at <= nowMs &&
    nowMs - window.measured_at <= maxAgeMs &&
    window.resets_at !== null &&
    window.resets_at * 1000 > nowMs
  )
    return { reading: cached.reading, failed: false };
  const result = await readRollout(
    source.path,
    source.size,
    source.mtimeMs,
    nowMs,
    maxAgeMs,
  );
  // Cache successful weekly facts only: a future or absent event must be reconsidered.
  if (result.reading?.window !== undefined) {
    if (readings.size >= MAX_CACHED_SOURCES) readings.clear();
    readings.set(source.path, {
      mtimeMs: source.mtimeMs,
      size: source.size,
      reading: result.reading,
    });
  }
  return result;
}

async function rolloutPaths(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  const directories: Promise<string[]>[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) directories.push(rolloutPaths(path));
    else if (
      entry.isFile() &&
      entry.name.startsWith("rollout-") &&
      entry.name.endsWith(".jsonl")
    )
      files.push(path);
  }
  return files.concat((await Promise.all(directories)).flat());
}

/** One account usage reader for agx and statusline, independent of the active session.
 * New empty rollouts cannot erase an earlier usage event. Event time determines freshness;
 * Sources are visited newest-first by mtime; appended events are read from the end.
 */
export async function readCodexSubscriptionUsage(
  root: string,
  nowMs: number,
  maxAgeMs: number,
): Promise<{
  rate?: CodexAccountRate;
  window?: SubscriptionUsageWindow;
  reason: string;
}> {
  const paths = await rolloutPaths(root);
  const candidates: Source[] = [];
  // Bound concurrent metadata reads rather than serially waiting on thousands of old files.
  for (let offset = 0; offset < paths.length; offset += 8192) {
    const batch = await Promise.all(
      paths.slice(offset, offset + 8192).map((path) =>
        stat(path).then(
          (info) =>
            info.isFile() && nowMs - info.mtimeMs <= maxAgeMs
              ? { path, size: info.size, mtimeMs: info.mtimeMs }
              : null,
          () => null,
        ),
      ),
    );
    candidates.push(...batch.filter((value) => value !== null));
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  let fallback: Reading | undefined;
  let failed = false;
  for (const candidate of candidates) {
    const result = await readCachedRollout(candidate, nowMs, maxAgeMs);
    failed ||= result.failed;
    const reading = result.reading;
    if (reading === undefined) continue;
    fallback ??= reading;
    if (reading.window !== undefined)
      return { ...reading, reason: "fresh Codex 7d rollout rate event" };
  }
  let reason = "no fresh Codex 7d rate event in rollout sources";
  if (candidates.length === 0) reason = "no fresh Codex rollout source";
  else if (failed) reason = "Codex rollout read failed";
  return { ...(fallback === undefined ? {} : { rate: fallback.rate }), reason };
}
