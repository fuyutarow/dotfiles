import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { SessionStatus } from "../session-status.ts";
import { jsonlLines, readJsonlTail } from "../../../shared/src/jsonl.ts";
import {
  hashSettingsPrefix,
  readCodexSettingsEvents,
} from "./codex-settings-stream.ts";
import { jsonText, maybe, z } from "../zod.ts";

function settingText() {
  return maybe(z.string().trim().min(1)).catch(undefined);
}
const SETTING_TEXT = settingText();
const SESSION_META = z.object({
  type: z.literal("session_meta"),
  payload: z.object({
    id: maybe(z.string()),
    session_id: maybe(z.string()),
    cwd: maybe(z.string()),
    model: SETTING_TEXT,
    originator: maybe(z.string()),
  }),
});
const TOKEN_COUNT = z.object({
  type: z.literal("event_msg"),
  timestamp: maybe(z.string()),
  payload: z.object({
    type: z.literal("token_count"),
    info: z.object({
      last_token_usage: maybe(z.object({ input_tokens: maybe(z.number()) })),
      model_context_window: maybe(z.number()),
    }),
  }),
});
const TURN_CONTEXT = z.object({
  type: z.literal("turn_context"),
  payload: z.object({
    model: SETTING_TEXT,
    effort: SETTING_TEXT,
    reasoning_effort: SETTING_TEXT,
  }),
});
const THREAD_SETTINGS = z.object({
  type: z.literal("event_msg"),
  payload: z.object({
    type: z.literal("thread_settings_applied"),
    thread_settings: z.object({
      model: SETTING_TEXT,
      reasoning_effort: SETTING_TEXT,
    }),
  }),
});

const MAX_META_BYTES = 4 * 1024 * 1024;
const TAIL_BYTES = 512 * 1024;
const MAX_SETTINGS_CACHE = 32;
const SETTINGS_SOURCE_BUDGET_MS = 7500;
const SCAN_COMPLETE = z.object({
  type: z.literal("settings_scan_complete"),
  offset: z.number(),
  digest: z.string(),
});
const FINAL_LINE = z.object({ settings_final_line: z.literal(true) });
type Settings = { model: string | undefined; effort: string | undefined };
type SettingsCache = Settings & {
  ino: number;
  dev: number;
  size: number;
  offset: number;
  mtimeMs: number;
  ctimeMs: number;
  digest: string;
  complete: Settings;
};
const settingsCache = new Map<string, SettingsCache>();

// Cache discovery only. Settings and context must reflect appends and replacements
// immediately, including while this short-lived cross-process lookup is still fresh.
async function cachedRolloutLookup(
  _key: string,
  lookup: () => Promise<Awaited<ReturnType<typeof matchingRolloutOnDay>>>,
) {
  return lookup();
}

async function firstLine(path: string): Promise<string | null> {
  await using file = await open(path, "r");
  const chunks: Buffer[] = [];
  let offset = 0;
  while (offset < MAX_META_BYTES) {
    const chunk = Buffer.alloc(64 * 1024);
    const result = await file.read(chunk, 0, chunk.length, offset);
    if (result.bytesRead === 0) return null;
    const part = chunk.subarray(0, result.bytesRead);
    const newline = part.indexOf(10);
    if (newline >= 0) {
      chunks.push(part.subarray(0, newline));
      return Buffer.concat(chunks).toString("utf8");
    }
    chunks.push(part);
    offset += result.bytesRead;
  }
  return null;
}

async function metadata(path: string) {
  const line = await firstLine(path).catch(() => null);
  if (line === null) return null;
  const json = jsonText.safeParse(line);
  if (!json.success) return null;
  const parsed = SESSION_META.safeParse(json.data);
  return parsed.success ? parsed.data : null;
}

async function rolloutsInDay(dir: string) {
  const names = await readdir(dir).catch(() => []);
  const files = await Promise.all(
    names
      .filter((name) => name.startsWith("rollout-") && name.endsWith(".jsonl"))
      .map(async (name) => {
        const path = join(dir, name);
        const info = await stat(path).catch(() => null);
        return info?.isFile() === true ? { path, mtimeMs: info.mtimeMs } : null;
      }),
  );
  return files
    .filter((file) => file !== null)
    .toSorted((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, 100);
}

async function matchingRolloutOnDay(dir: string, cwd: string) {
  const candidates = await rolloutsInDay(dir);
  for (const candidate of candidates) {
    const meta = await metadata(candidate.path);
    if (meta?.payload.cwd === cwd && meta.payload.originator === "codex-tui")
      return { path: candidate.path, meta };
  }
  return null;
}

async function matchingRolloutByThreadOnDay(dir: string, threadId: string) {
  const names = await readdir(dir).catch(() => []);
  const candidates = await Promise.all(
    names
      .filter(
        (name) =>
          name.startsWith("rollout-") && name.endsWith(`-${threadId}.jsonl`),
      )
      .map(async (name) => {
        const path = join(dir, name);
        const info = await stat(path).catch(() => null);
        if (info?.isFile() !== true) return null;
        const meta = await metadata(path);
        return meta?.payload.originator === "codex-tui" &&
          (meta.payload.session_id === threadId || meta.payload.id === threadId)
          ? { path, meta, mtimeMs: info.mtimeMs }
          : null;
      }),
  );
  return (
    candidates
      .filter((candidate) => candidate !== null)
      .toSorted((a, b) => b.mtimeMs - a.mtimeMs)[0] ?? null
  );
}

async function matchingRollout(root: string, cwd: string) {
  const today = Temporal.Now.plainDateISO();
  for (let offset = 0; offset <= 366; offset++) {
    const day = today.subtract({ days: offset });
    const dir = join(
      root,
      String(day.year),
      String(day.month).padStart(2, "0"),
      String(day.day).padStart(2, "0"),
    );
    const match = await matchingRolloutOnDay(dir, cwd);
    if (match !== null) return match;
  }
  return null;
}

async function matchingRolloutByThread(root: string, threadId: string) {
  const today = Temporal.Now.plainDateISO();
  for (let offset = 0; offset <= 366; offset++) {
    const day = today.subtract({ days: offset });
    const dir = join(
      root,
      String(day.year),
      String(day.month).padStart(2, "0"),
      String(day.day).padStart(2, "0"),
    );
    const match = await matchingRolloutByThreadOnDay(dir, threadId);
    if (match !== null) return match;
  }
  return null;
}

async function matchingRolloutBySessionIdOnDay(dir: string, sessionId: string) {
  const candidates = await rolloutsInDay(dir);
  for (const candidate of candidates) {
    const meta = await metadata(candidate.path);
    if (
      meta?.payload.originator === "codex-tui" &&
      (meta.payload.session_id === sessionId || meta.payload.id === sessionId)
    )
      return { path: candidate.path, meta };
  }
  return null;
}

async function matchingRolloutBySessionIdInYear(
  root: string,
  sessionId: string,
  endDay: Temporal.PlainDate,
  dayCount: number,
) {
  for (let offset = 0; offset < dayCount; offset++) {
    const day = endDay.subtract({ days: offset });
    const dir = join(
      root,
      String(day.year),
      String(day.month).padStart(2, "0"),
      String(day.day).padStart(2, "0"),
    );
    const match = await matchingRolloutBySessionIdOnDay(dir, sessionId);
    if (match !== null) return match;
  }
  return null;
}

async function matchingRolloutBySessionId(root: string, sessionId: string) {
  const today = Temporal.Now.plainDateISO();
  const yearStart = Temporal.PlainDate.from({
    year: today.year,
    month: 1,
    day: 1,
  });
  const daysThisYear = today.since(yearStart).days + 1;
  const firstYearDays = Math.min(367, daysThisYear);
  const currentYearMatch = await matchingRolloutBySessionIdInYear(
    root,
    sessionId,
    today,
    firstYearDays,
  );
  if (currentYearMatch !== null) return currentYearMatch;
  const remainingDays = 367 - firstYearDays;
  if (remainingDays === 0) return null;
  const previousYearEnd = Temporal.PlainDate.from({
    year: today.year - 1,
    month: 12,
    day: 31,
  });
  return matchingRolloutBySessionIdInYear(
    root,
    sessionId,
    previousYearEnd,
    remainingDays,
  );
}

// Fold in file order, including /model settings between turn_context records. A head
// value is never a fallback across an unread gap: an unseen /model may supersede it.
function applySettings(previous: Settings, value: unknown): Settings {
  const turn = TURN_CONTEXT.safeParse(value);
  if (turn.success) {
    return {
      model: turn.data.payload.model ?? previous.model,
      effort:
        turn.data.payload.effort ??
        turn.data.payload.reasoning_effort ??
        previous.effort,
    };
  }
  const settings = THREAD_SETTINGS.safeParse(value);
  if (!settings.success) return previous;
  return {
    model: settings.data.payload.thread_settings.model ?? previous.model,
    effort:
      settings.data.payload.thread_settings.reasoning_effort ?? previous.effort,
  };
}

async function readSettings(
  path: string,
  legacyModel: string | undefined,
): Promise<Settings | undefined> {
  const deadline = performance.now() + SETTINGS_SOURCE_BUDGET_MS;
  let resolved: Settings | null | undefined = null;
  // One retry handles a source mutation during a scan without publishing mixed snapshots.
  for (
    let attempt = 0;
    attempt < 2 && performance.now() < deadline;
    attempt++
  ) {
    resolved = await readSettingsSnapshot(path, legacyModel, deadline);
    if (resolved !== null) break;
  }
  return resolved ?? undefined;
}

async function readSettingsSnapshot(
  path: string,
  legacyModel: string | undefined,
  deadline: number,
): Promise<Settings | null | undefined> {
  const info = await stat(path);
  const cached = settingsCache.get(path);
  const sameFile =
    cached !== undefined && cached.ino === info.ino && cached.dev === info.dev;
  if (
    sameFile &&
    cached.size === info.size &&
    cached.mtimeMs === info.mtimeMs &&
    cached.ctimeMs === info.ctimeMs
  )
    return cached;
  let start = 0;
  let prefix: Awaited<ReturnType<typeof hashSettingsPrefix>> = undefined;
  if (sameFile && info.size > cached.size) {
    prefix = await hashSettingsPrefix(path, cached.offset, deadline);
    if (prefix === undefined || prefix === null) return undefined;
    if (prefix.digest === cached.digest) start = cached.offset;
    else prefix = undefined;
  }
  let current: Settings = {
    model: start > 0 ? cached?.complete.model : legacyModel,
    effort: start > 0 ? cached?.complete.effort : undefined,
  };
  let complete = current;
  let scan: z.output<typeof SCAN_COMPLETE> | undefined;
  // A cold process must observe intervening /model changes throughout the file.
  for await (const event of readCodexSettingsEvents(
    path,
    info.size,
    deadline,
    start,
    prefix?.hash,
  )) {
    const finished = SCAN_COMPLETE.safeParse(event);
    if (finished.success) {
      scan = finished.data;
      continue;
    }
    current = applySettings(current, event);
    if (!FINAL_LINE.safeParse(event).success) complete = current;
  }
  if (scan === undefined) return undefined;
  const next = {
    ...current,
    ino: info.ino,
    dev: info.dev,
    size: info.size,
    offset: scan.offset,
    digest: scan.digest,
    complete,
    mtimeMs: info.mtimeMs,
    ctimeMs: info.ctimeMs,
  };
  const after = await stat(path);
  // Do not bind facts from a mixed read to a cache provenance snapshot.
  settingsCache.delete(path);
  if (
    after.ino === info.ino &&
    after.dev === info.dev &&
    after.size === info.size &&
    after.mtimeMs === info.mtimeMs &&
    after.ctimeMs === info.ctimeMs
  ) {
    settingsCache.set(path, next);
  } else return null;
  if (settingsCache.size > MAX_SETTINGS_CACHE) {
    const oldest = settingsCache.keys().next().value;
    if (oldest !== undefined) settingsCache.delete(oldest);
  }
  return current;
}

async function readSelectedSessionStatus(
  selected: Awaited<ReturnType<typeof matchingRolloutOnDay>>,
  cwd: string | undefined,
): Promise<SessionStatus | undefined> {
  if (selected === null) return undefined;
  const tail = await readJsonlTail(selected.path, TAIL_BYTES).catch(() => null);
  const settings = await readSettings(
    selected.path,
    selected.meta.payload.model,
  ).catch(() => null);
  const model = settings?.model;
  const effort = settings?.effort;
  let context: SessionStatus["context"];
  for (const line of jsonlLines(tail?.text ?? "")) {
    const json = jsonText.safeParse(line);
    if (!json.success) continue;
    const usage = TOKEN_COUNT.safeParse(json.data);
    if (!usage.success) continue;
    const window = usage.data.payload.info.model_context_window;
    const inputTokens = usage.data.payload.info.last_token_usage?.input_tokens;
    context = {
      inputTokens,
      usedPercent:
        window !== undefined && window > 0 && inputTokens !== undefined
          ? Math.min(100, (inputTokens / window) * 100)
          : undefined,
    };
  }
  return {
    cwd,
    sessionId: selected.meta.payload.session_id ?? selected.meta.payload.id,
    model: model === undefined ? undefined : { name: model },
    effort,
    context,
  };
}

/** Select the newest interactive TUI rollout for the cwd and normalize its current turn/context facts. */
export async function readCodexSessionStatus(
  cwd: string,
  root = join(process.env.HOME ?? "", ".codex", "sessions"),
): Promise<SessionStatus | undefined> {
  const selected = await cachedRolloutLookup(`cwd:${root}:${cwd}`, () =>
    matchingRollout(root, cwd),
  );
  if (selected !== null && selected.meta.payload.cwd !== cwd) return undefined;
  return readSelectedSessionStatus(selected, cwd);
}

/** Select an interactive TUI rollout by its thread ID from the rollout filename. */
export async function readCodexThreadStatus(
  threadId: string,
  root = join(process.env.HOME ?? "", ".codex", "sessions"),
): Promise<SessionStatus | undefined> {
  const selected = await cachedRolloutLookup(`thread:${root}:${threadId}`, () =>
    matchingRolloutByThread(root, threadId),
  );
  if (
    selected !== null &&
    selected.meta.payload.session_id !== threadId &&
    selected.meta.payload.id !== threadId
  )
    return undefined;
  return readSelectedSessionStatus(selected, selected?.meta.payload.cwd);
}

/** Reread one already-selected interactive session without selecting a newer cwd match. */
export async function readCodexPinnedSessionStatus(
  sessionId: string,
  root = join(process.env.HOME ?? "", ".codex", "sessions"),
): Promise<SessionStatus | undefined> {
  const selected = await matchingRolloutBySessionId(root, sessionId);
  return readSelectedSessionStatus(selected, selected?.meta.payload.cwd);
}
