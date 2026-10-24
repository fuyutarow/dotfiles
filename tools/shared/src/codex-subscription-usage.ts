import { open, opendir, stat, type FileHandle } from "node:fs/promises";
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
const CREDIT_EVENT = z.object({
  timestamp: z.iso.datetime({ offset: true }),
  type: z.literal("event_msg"),
  payload: z.object({
    type: z.literal("token_count"),
    rate_limits: z.object({
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
const CREDIT_HISTORY_DAYS = 8;
const CREDIT_HISTORY_DIRECTORY_COUNT = CREDIT_HISTORY_DAYS + 3;
const MAX_CREDIT_HISTORY_FILES = 32;
const MAX_CREDIT_HISTORY_METADATA_FILES_PER_DAY = 1024;
const MAX_CREDIT_HISTORY_DIRECTORY_ENTRIES = 1024;
const MAX_CREDIT_HISTORY_FILE_BYTES = 256 * 1024;
const MAX_CREDIT_HISTORY_BYTES = 4 * 1024 * 1024;
const MAX_CREDIT_BASELINE_TAIL_BYTES = 4 * 1024 * 1024;
const MAX_CREDIT_FORWARD_FILE_BYTES = 32 * 1024 * 1024;
const MAX_CREDIT_FORWARD_BYTES = 64 * 1024 * 1024;
const CREDIT_SCAN_CHUNK_BYTES = 256 * 1024;
const MAX_CREDIT_SCAN_LINE_BYTES = 64 * 1024;
export const CREDIT_DELTA_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_ACCOUNT_RATE_FILES = 64;
const MAX_ACCOUNT_RATE_FILE_BYTES = 16 * 1024 * 1024;
const MAX_ACCOUNT_RATE_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_ACCOUNT_RATE_DIRECTORY_ENTRIES = 1024;
const ACCOUNT_RATE_READ_CHUNK_BYTES = 256 * 1024;
const MAX_ACCOUNT_RATE_LINE_BYTES = 8 * 1024 * 1024;
const ACCOUNT_RATE_DAYS = 16;
const ACCOUNT_RATE_DIRECTORY_COUNT = ACCOUNT_RATE_DAYS + 3;
export type CodexAccountRate = {
  windows: { minutes: number; percent: number; reset?: number }[];
  credits?: string | undefined;
  creditChange?: { delta: number; spanMs: number } | undefined;
  creditMemo?: CodexCreditMemo | undefined;
  mtimeMs: number;
};
export type CodexCreditMemo = {
  baseline: { at: number; balance: number };
  computedAt: number;
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
  const credit = limits.credits;
  const creditBalance = Number(credit?.balance);
  const credits =
    credit?.has_credits === true &&
    credit.unlimited === false &&
    credit.balance !== undefined &&
    Number.isFinite(creditBalance)
      ? String(Math.round(creditBalance))
      : undefined;
  if (windows.length === 0 && credits === undefined) return undefined;
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
  byteLimit: number,
) {
  const fd = await open(path, "r").catch(() => null);
  if (fd === null) return { failed: true, bytesRead: 0 };
  await using handle = fd;
  let end = Math.min(size, byteLimit);
  let suffix = "";
  let discard = false;
  let fallback: Reading | undefined;
  let bytesRead = 0;
  while (end > 0) {
    const start = Math.max(0, end - ACCOUNT_RATE_READ_CHUNK_BYTES);
    const buffer = await readBlock(handle, start, end);
    if (buffer === null) return { failed: true, bytesRead };
    bytesRead += buffer.length;
    const lines = buffer.toString("utf8").split("\n");
    const hasNewline = lines.length > 1;
    const last = lines.pop() ?? "";
    if (!discard) lines.push(last + suffix);
    // The first line may start in the preceding chunk. Never parse a partial line.
    suffix = start > 0 ? (lines.shift() ?? "") : "";
    discard =
      (discard && !hasNewline) || suffix.length > MAX_ACCOUNT_RATE_LINE_BYTES;
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
    if (selected !== undefined)
      return { reading: selected, failed: false, bytesRead };
    end = start;
  }
  return { reading: fallback, failed: false, bytesRead };
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
  byteLimit: number,
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
    return { reading: cached.reading, failed: false, bytesRead: 0 };
  const result = await readRollout(
    source.path,
    source.size,
    source.mtimeMs,
    nowMs,
    maxAgeMs,
    byteLimit,
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

async function boundedDirectoryNames(path: string, limit: number) {
  const names: string[] = [];
  const directory = await opendir(path).catch(() => null);
  if (directory === null) return names;
  for await (const entry of directory) {
    names.push(entry.name);
    if (names.length >= limit) break;
  }
  return names;
}

async function rolloutPaths(root: string, nowMs: number): Promise<string[]> {
  const files: string[] = [];
  const today = Temporal.Instant.fromEpochMilliseconds(nowMs)
    .toZonedDateTimeISO("UTC")
    .toPlainDate();
  for (let index = 0; index < ACCOUNT_RATE_DIRECTORY_COUNT; index++) {
    const day = today.subtract({ days: index - 1 });
    const dir = join(
      root,
      String(day.year),
      padDatePart(day.month),
      padDatePart(day.day),
    );
    const names = await boundedDirectoryNames(
      dir,
      MAX_ACCOUNT_RATE_DIRECTORY_ENTRIES,
    );
    const candidates = names
      .filter((name) => name.startsWith("rollout-") && name.endsWith(".jsonl"))
      .toSorted((a, b) => b.localeCompare(a))
      .slice(0, MAX_ACCOUNT_RATE_FILES - files.length);
    files.push(...candidates.map((name) => join(dir, name)));
    if (files.length >= MAX_ACCOUNT_RATE_FILES) break;
  }
  return files;
}

type CreditSample = { at: number; balance: number | undefined };
type RolloutSource = {
  path: string;
  mtimeMs: number;
  size: number;
  startedAtMs: number;
};
const FiniteCreditSample = z.object({ at: z.number(), balance: z.number() });

async function creditRolloutsForDay(
  root: string,
  day: Temporal.PlainDate,
  remaining: number,
): Promise<RolloutSource[]> {
  const dir = join(
    root,
    String(day.year),
    padDatePart(day.month),
    padDatePart(day.day),
  );
  const names = await boundedDirectoryNames(
    dir,
    MAX_CREDIT_HISTORY_DIRECTORY_ENTRIES,
  );
  const paths = names
    .filter((name) => name.startsWith("rollout-") && name.endsWith(".jsonl"))
    .toSorted((a, b) => b.localeCompare(a))
    .slice(0, remaining)
    .map((name) => join(dir, name));
  const sources = await Promise.all(
    paths.map(async (path) => {
      const info = await stat(path).catch(() => null);
      const stamp = path.match(
        /rollout-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/u,
      );
      const dayStartMs = day.toZonedDateTime("UTC").epochMilliseconds;
      const startedAtMs =
        stamp === null
          ? dayStartMs
          : fromThrowable(
              () =>
                Temporal.Instant.from(
                  `${stamp[1]}T${stamp[2]}:${stamp[3]}:${stamp[4]}Z`,
                ).epochMilliseconds,
            )().unwrapOr(dayStartMs);
      return info !== null && info.isFile()
        ? {
            path,
            mtimeMs: info.mtimeMs,
            size: info.size,
            startedAtMs,
          }
        : null;
    }),
  );
  return sources.filter((source) => source !== null);
}

function creditSampleFromLine(
  line: string,
  nowMs: number,
): CreditSample | undefined {
  if (!line.includes('"token_count"')) return undefined;
  const parsed = jsonOf(CREDIT_EVENT).safeParse(line);
  if (!parsed.success) return undefined;
  const credit = parsed.data.payload.rate_limits.credits;
  const rawBalance = Number(credit?.balance);
  const balance =
    credit?.has_credits === true &&
    credit.unlimited === false &&
    credit.balance !== undefined &&
    Number.isFinite(rawBalance)
      ? rawBalance
      : undefined;
  const at = fromThrowable(
    () => Temporal.Instant.from(parsed.data.timestamp).epochMilliseconds,
  )().unwrapOr(undefined);
  if (
    at === undefined ||
    at > nowMs ||
    nowMs - at > CREDIT_HISTORY_DAYS * 24 * 60 * 60 * 1000
  )
    return undefined;
  return { at, balance };
}

type CreditScan = {
  pending: Buffer;
  discard: boolean;
  baseline: CreditSample | undefined;
  crossed: boolean;
};

function scanCreditChunk(buffer: Buffer, scan: CreditScan, nowMs: number) {
  const cutoff = nowMs - CREDIT_DELTA_WINDOW_MS;
  let start = 0;
  for (
    let end = buffer.indexOf(10);
    end !== -1;
    end = buffer.indexOf(10, start)
  ) {
    const part = buffer.subarray(start, end);
    const line =
      !scan.discard &&
      scan.pending.length + part.length <= MAX_CREDIT_SCAN_LINE_BYTES
        ? Buffer.concat([scan.pending, part]).toString("utf8")
        : "";
    scan.pending = Buffer.alloc(0);
    scan.discard = false;
    start = end + 1;
    const sample = creditSampleFromLine(line, nowMs);
    if (sample === undefined) continue;
    if (sample.at > cutoff) {
      scan.crossed = true;
      return;
    }
    if (
      sample.balance !== undefined &&
      (scan.baseline === undefined || sample.at > scan.baseline.at)
    )
      scan.baseline = sample;
  }
  const rest = buffer.subarray(start);
  scan.discard ||=
    scan.pending.length + rest.length > MAX_CREDIT_SCAN_LINE_BYTES;
  scan.pending = scan.discard
    ? Buffer.alloc(0)
    : Buffer.concat([scan.pending, rest]);
}

async function creditBaselineFromRollout(
  handle: FileHandle,
  size: number,
  length: number,
  nowMs: number,
  signal?: AbortSignal,
) {
  // Accept a baseline only after crossing the cutoff or reaching EOF.
  // A capped prefix cannot establish the newest pre-cutoff sample.
  const scan: CreditScan = {
    pending: Buffer.alloc(0),
    discard: false,
    baseline: undefined,
    crossed: false,
  };
  let bytesRead = 0;
  while (bytesRead < length && !scan.crossed) {
    signal?.throwIfAborted();
    const buffer = await readBlock(
      handle,
      bytesRead,
      Math.min(length, bytesRead + CREDIT_SCAN_CHUNK_BYTES),
    );
    if (buffer === null) return { samples: [], bytesRead: length };
    bytesRead += buffer.length;
    scanCreditChunk(buffer, scan, nowMs);
  }
  if (!scan.crossed && length < size) return { samples: [], bytesRead };
  if (!scan.crossed) scanCreditChunk(Buffer.from("\n"), scan, nowMs);
  return {
    samples: scan.baseline === undefined ? [] : [scan.baseline],
    bytesRead,
  };
}

async function creditSamplesFromRollout(
  source: RolloutSource,
  nowMs: number,
  byteBudget: number,
  forward = false,
  signal?: AbortSignal,
): Promise<{ samples: CreditSample[]; bytesRead: number }> {
  const length = Math.min(
    source.size,
    forward ? MAX_CREDIT_FORWARD_FILE_BYTES : MAX_CREDIT_HISTORY_FILE_BYTES,
    byteBudget,
  );
  if (length <= 0) return { samples: [], bytesRead: 0 };
  const fd = await open(source.path, "r").catch(() => null);
  if (fd === null) return { samples: [], bytesRead: 0 };
  await using handle = fd;
  if (forward)
    return await creditBaselineFromRollout(
      handle,
      source.size,
      length,
      nowMs,
      signal,
    );
  const buffer = Buffer.alloc(length);
  const result = await handle
    .read(buffer, 0, length, source.size - length)
    .catch(() => null);
  if (result === null) return { samples: [], bytesRead: 0 };
  const lines = buffer
    .subarray(0, result.bytesRead)
    .toString("utf8")
    .split("\n");
  if (length < source.size) lines.shift();
  const samples: CreditSample[] = [];
  for (const line of lines) {
    const sample = creditSampleFromLine(line, nowMs);
    if (sample !== undefined) samples.push(sample);
  }
  return { samples, bytesRead: result.bytesRead };
}

async function readCreditHistory(
  root: string,
  nowMs: number,
  recentOnly = false,
  signal?: AbortSignal,
): Promise<Pick<CodexAccountRate, "credits" | "creditChange" | "creditMemo">> {
  const today = Temporal.Instant.fromEpochMilliseconds(nowMs)
    .toZonedDateTimeISO("UTC")
    .toPlainDate();
  const sources: RolloutSource[] = [];
  const days = recentOnly
    ? []
    : await Promise.all(
        Array.from({ length: CREDIT_HISTORY_DIRECTORY_COUNT }, (_, index) =>
          creditRolloutsForDay(
            root,
            today.subtract({ days: index - 1 }),
            MAX_CREDIT_HISTORY_METADATA_FILES_PER_DAY,
          ),
        ),
      );
  sources.push(...days.flat());
  // The fast path preserves CR1's 32-file discovery instead of statting history.
  const recentDirectoryCount = recentOnly ? CREDIT_HISTORY_DIRECTORY_COUNT : 0;
  for (let index = 0; index < recentDirectoryCount; index++) {
    sources.push(
      ...(await creditRolloutsForDay(
        root,
        today.subtract({ days: index - 1 }),
        MAX_CREDIT_HISTORY_FILES - sources.length,
      )),
    );
    if (sources.length >= MAX_CREDIT_HISTORY_FILES) break;
  }
  signal?.throwIfAborted();
  sources.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const samples: CreditSample[] = [];
  let remainingBytes = MAX_CREDIT_HISTORY_BYTES;
  for (const source of sources.slice(0, MAX_CREDIT_HISTORY_FILES)) {
    signal?.throwIfAborted();
    const result = await creditSamplesFromRollout(
      source,
      nowMs,
      remainingBytes,
    );
    samples.push(...result.samples);
    remainingBytes -= result.bytesRead;
    if (remainingBytes <= 0) break;
  }
  const cutoff = nowMs - CREDIT_DELTA_WINDOW_MS;
  // Recent sessions must not consume the slots reserved for cutoff candidates.
  // Closed files need only their tails; files from a day touching/before the
  // cutoff whose mtime is later may span it and need a bounded forward scan.
  const closed = recentOnly
    ? []
    : sources.filter((source) => source.mtimeMs <= cutoff);
  remainingBytes = MAX_CREDIT_BASELINE_TAIL_BYTES;
  for (const source of closed.slice(0, MAX_CREDIT_HISTORY_FILES)) {
    signal?.throwIfAborted();
    const result = await creditSamplesFromRollout(
      source,
      nowMs,
      remainingBytes,
    );
    samples.push(...result.samples);
    remainingBytes -= result.bytesRead;
    if (remainingBytes <= 0) break;
  }
  const spanning = recentOnly
    ? []
    : sources.filter(
        (source) => source.startedAtMs <= cutoff && source.mtimeMs > cutoff,
      );
  remainingBytes = MAX_CREDIT_FORWARD_BYTES;
  for (const source of spanning.slice(0, MAX_CREDIT_HISTORY_FILES)) {
    signal?.throwIfAborted();
    const result = await creditSamplesFromRollout(
      source,
      nowMs,
      remainingBytes,
      true,
      signal,
    );
    samples.push(...result.samples);
    remainingBytes -= result.bytesRead;
    if (remainingBytes <= 0) break;
  }
  signal?.throwIfAborted();
  samples.sort((a, b) => a.at - b.at);
  const latest = samples.at(-1);
  if (latest === undefined || latest.balance === undefined)
    return { credits: undefined, creditChange: undefined };
  const finiteSamples = samples.flatMap((sample) => {
    const parsed = FiniteCreditSample.safeParse(sample);
    return parsed.success ? [parsed.data] : [];
  });
  if (finiteSamples.length === 1)
    return { credits: String(Math.round(latest.balance)) };
  const baseline = finiteSamples
    .toReversed()
    .find((sample) => sample.at <= cutoff);
  const covered = baseline ?? finiteSamples.at(0);
  if (covered === undefined || covered === latest)
    return { credits: String(Math.round(latest.balance)) };
  return {
    credits: String(Math.round(latest.balance)),
    creditChange: {
      delta: Math.round(latest.balance) - Math.round(covered.balance),
      spanMs:
        baseline === undefined
          ? latest.at - covered.at
          : CREDIT_DELTA_WINDOW_MS,
    },
    ...(baseline === undefined || recentOnly
      ? {}
      : { creditMemo: { baseline, computedAt: nowMs } }),
  };
}

/** Expensive bounded history refresh; only the sampler schedules this operation. */
export async function readCodexCreditBaseline(
  root: string,
  nowMs: number,
  signal?: AbortSignal,
) {
  return (await readCreditHistory(root, nowMs, false, signal)).creditMemo;
}

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

/** One account usage reader for agx and statusline, independent of the active session.
 * New empty rollouts cannot erase an earlier usage event. Event time determines freshness;
 * Sources are visited newest-first by mtime; appended events are read from the end.
 */
export async function readCodexSubscriptionUsage(
  root: string,
  nowMs: number,
  maxAgeMs: number,
  recentOnly = false,
): Promise<{
  rate?: CodexAccountRate;
  window?: SubscriptionUsageWindow;
  reason: string;
}> {
  const creditHistory = await readCreditHistory(root, nowMs, recentOnly);
  const paths = await rolloutPaths(root, nowMs);
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
  let remainingBytes = MAX_ACCOUNT_RATE_TOTAL_BYTES;
  for (const candidate of candidates) {
    if (remainingBytes <= 0) break;
    const result = await readCachedRollout(
      candidate,
      nowMs,
      maxAgeMs,
      Math.min(MAX_ACCOUNT_RATE_FILE_BYTES, remainingBytes),
    );
    remainingBytes -= result.bytesRead;
    failed ||= result.failed;
    const reading = result.reading;
    if (reading === undefined) continue;
    fallback ??= reading;
    if (reading.window !== undefined)
      return {
        ...reading,
        rate: { ...reading.rate, ...creditHistory },
        reason: "fresh Codex 7d rollout rate event",
      };
  }
  let reason = "no fresh Codex 7d rate event in rollout sources";
  if (candidates.length === 0) reason = "no fresh Codex rollout source";
  else if (failed) reason = "Codex rollout read failed";
  return {
    ...(fallback === undefined
      ? {}
      : { rate: { ...fallback.rate, ...creditHistory } }),
    reason,
  };
}
