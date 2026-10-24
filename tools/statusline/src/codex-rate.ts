import { open, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { readJsonlTail } from "../../shared/src/jsonl.ts";
import { err, fromThrowable, ok, type Result } from "neverthrow";
import { jsonOf, z } from "./zod.ts";
import { pad2 } from "./prompt-stamp.ts";
import type { TokenUsage } from "../../shared/src/dispatch-pricing.ts";
import type {
  CodexAccountRate,
  CodexCreditMemo,
} from "../../shared/src/codex-subscription-usage.ts";
import { CREDIT_DELTA_WINDOW_MS } from "../../shared/src/codex-subscription-usage.ts";

export type CodexRate = CodexAccountRate;
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
const CODEX_EXEC_CALL = z.object({
  timestamp: z.string().optional(),
  type: z.literal("response_item"),
  payload: z.object({
    type: z.literal("function_call"),
    name: z.string(),
    arguments: z.string(),
  }),
});
const CODEX_CUSTOM_CALL = z.object({
  timestamp: z.string().optional(),
  type: z.literal("response_item"),
  payload: z.object({
    type: z.literal("custom_tool_call"),
    name: z.string(),
    input: z.string(),
  }),
});
const CODEX_SESSION_META = z.object({
  type: z.literal("session_meta"),
  payload: z.object({
    id: z.string().optional(),
    session_id: z.string().optional(),
    cwd: z.string().optional(),
    timestamp: z.string().optional(),
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

async function rolloutSessionMeta(path: string) {
  await using fd = await open(path, "r");
  const buffer = Buffer.alloc(64 * 1024);
  const read = await fd.read(buffer, 0, buffer.length, 0);
  const newline = buffer.subarray(0, read.bytesRead).indexOf(10);
  const firstLine = buffer
    .subarray(0, newline < 0 ? read.bytesRead : newline)
    .toString("utf8");
  const parsed = jsonOf(CODEX_SESSION_META).safeParse(firstLine);
  return parsed.success ? parsed.data.payload : undefined;
}

/** Recover a missing vendor id only when cwd and start time identify one rollout. */
export async function resolveCodexSession(
  root: string,
  cwd: string,
  startedAt: string,
): Promise<string | undefined> {
  const started = fromThrowable(
    () => Temporal.Instant.from(startedAt).epochMilliseconds,
  )();
  if (started.isErr()) return undefined;
  const base = Temporal.PlainDate.from(startedAt.slice(0, 10));
  const dates = [base.subtract({ days: 1 }), base, base.add({ days: 1 })];
  const paths = (
    await Promise.all(
      dates.map(async (day) => {
        const dir = join(
          root,
          String(day.year),
          pad2(day.month),
          pad2(day.day),
        );
        const names = await readdir(dir).catch(() => []);
        return names
          .filter(
            (name) => name.startsWith("rollout-") && name.endsWith(".jsonl"),
          )
          .map((name) => join(dir, name));
      }),
    )
  ).flat();
  const candidates = await Promise.all(
    paths.map(async (path) => {
      const meta = await rolloutSessionMeta(path).catch(() => null);
      if (
        meta === null ||
        meta === undefined ||
        meta.cwd !== cwd ||
        meta.timestamp === undefined
      )
        return null;
      const session = meta.session_id ?? meta.id;
      if (session === undefined) return null;
      const timestampText = meta.timestamp;
      const timestamp = fromThrowable(
        () => Temporal.Instant.from(timestampText).epochMilliseconds,
      )();
      if (timestamp.isErr()) return null;
      return {
        session,
        distance: Math.abs(started.value - timestamp.value),
      };
    }),
  );
  const matches = candidates
    .flatMap((candidate) =>
      candidate !== null && candidate.distance <= 15_000 ? [candidate] : [],
    )
    .toSorted((a, b) => a.distance - b.distance);
  const nearest = matches[0];
  if (nearest === undefined) return undefined;
  if (matches[1]?.distance === nearest.distance) return undefined;
  return nearest.session;
}

/** Latest Codex shell action and bounded command/file counts from its rollout. */
export async function readCodexActivity(
  root: string,
  session: string,
  cwd?: string,
): Promise<
  { last: string; commands: number; files: number; ageSecs: number } | undefined
> {
  const path = await rolloutForSession(root, session);
  if (path === undefined) return undefined;
  const info = await stat(path).catch(() => null);
  if (info === null || !info.isFile()) return undefined;
  const length = Math.min(info.size, 512 * 1024);
  if (length === 0) return undefined;
  const buffer = Buffer.alloc(length);
  await using fd = await open(path, "r");
  const read = await fd
    .read(buffer, 0, length, info.size - length)
    .catch(() => ({ bytesRead: 0 }));
  const lines = buffer.subarray(0, read.bytesRead).toString("utf8").split("\n");
  if (length < info.size) lines.shift();
  const calls: RolloutAction[] = [];
  const files = new Set<string>();
  for (const line of lines) {
    const parsed = rolloutActions(line, cwd);
    calls.push(...parsed.actions);
    for (const file of parsed.files) files.add(file);
  }
  const latest = calls.at(-1);
  if (latest === undefined) return undefined;
  const commandCount = calls.filter(({ isCommand }) => isCommand).length;
  const timestamp = latest.timestamp;
  const at =
    timestamp === undefined
      ? info.mtimeMs
      : fromThrowable(
          () => Temporal.Instant.from(timestamp).epochMilliseconds,
        )().unwrapOr(info.mtimeMs);
  return {
    last: latest.command,
    commands: commandCount,
    files: files.size,
    ageSecs: Math.max(
      0,
      Math.floor((Temporal.Now.instant().epochMilliseconds - at) / 1000),
    ),
  };
}

type RolloutAction = {
  command: string;
  timestamp: string | undefined;
  isCommand: boolean;
};
function rolloutActions(
  line: string,
  cwd: string | undefined,
): { actions: RolloutAction[]; files: string[] } {
  const exec = jsonOf(CODEX_EXEC_CALL).safeParse(line);
  if (exec.success && exec.data.payload.name === "exec_command") {
    const args = jsonOf(
      z.object({ cmd: z.string().optional(), command: z.string().optional() }),
    ).safeParse(exec.data.payload.arguments);
    const command = args.success
      ? (args.data.cmd ?? args.data.command)
      : undefined;
    return command === undefined
      ? { actions: [], files: [] }
      : {
          actions: [
            {
              command: `$ ${command}`,
              timestamp: exec.data.timestamp,
              isCommand: true,
            },
          ],
          files: [],
        };
  }
  const custom = jsonOf(CODEX_CUSTOM_CALL).safeParse(line);
  if (!custom.success) return { actions: [], files: [] };
  const actions: RolloutAction[] = [];
  const shellCalls = [
    ...custom.data.payload.input.matchAll(
      /tools\.exec_command\(\{\s*cmd:\s*"((?:\\.|[^"\\])*)"/gu,
    ),
  ];
  for (const [source, command] of shellCalls) {
    if (source === undefined || command === undefined) continue;
    const value = jsonOf(z.string()).safeParse(`"${command}"`);
    if (value.success)
      actions.push({
        command: `$ ${value.data}`,
        timestamp: custom.data.timestamp,
        isCommand: true,
      });
  }
  const files: string[] = [];
  const patchFiles = [
    ...custom.data.payload.input.matchAll(
      /(?:Update|Add|Delete) File:\s*([^\s\\]+)/gu,
    ),
  ];
  for (const [, file] of patchFiles) {
    if (file === undefined) continue;
    files.push(file);
    const displayPath =
      cwd !== undefined && file.startsWith("/") ? relative(cwd, file) : file;
    actions.push({
      command: `editing ${displayPath}`,
      timestamp: custom.data.timestamp,
      isCommand: false,
    });
  }
  return { actions, files };
}

/** Account limits are shared across sessions, including a newly opened empty session. */
export async function readCodexRate(
  root = join(process.env.HOME ?? "", ".codex", "sessions"),
  _session?: string,
  nowMs = Temporal.Now.instant().epochMilliseconds,
  creditMemo?: CodexCreditMemo,
): Promise<Result<CodexRate | undefined, string>> {
  const { readCodexSubscriptionUsage } =
    await import("../../shared/src/codex-subscription-usage.ts");
  const result = await readCodexSubscriptionUsage(
    root,
    nowMs,
    7 * 24 * 60 * 60 * 1000,
    true,
  );
  if (
    result.rate === undefined &&
    result.reason === "Codex rollout read failed"
  )
    return err("codex rate unavailable");
  const rate = result.rate;
  if (
    creditMemo === undefined ||
    creditMemo.computedAt > nowMs ||
    creditMemo.baseline.at > nowMs - CREDIT_DELTA_WINDOW_MS
  )
    return ok(rate);
  const current = rate ?? { windows: [], mtimeMs: nowMs };
  return ok({
    ...current,
    creditMemo,
    ...(current.credits === undefined
      ? {}
      : {
          creditChange: {
            delta:
              Number(current.credits) - Math.round(creditMemo.baseline.balance),
            spanMs: CREDIT_DELTA_WINDOW_MS,
          },
        }),
  });
}

export { codexRateSegment } from "./provider-display.ts";
