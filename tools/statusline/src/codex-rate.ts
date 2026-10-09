import { readdir } from "node:fs/promises";
import { openSync, readSync, closeSync } from "node:fs";
import { statSync } from "node:fs";
import { join } from "node:path";
import { err, fromThrowable, ok, type Result } from "neverthrow";
import { jsonOf, z } from "./zod.ts";
import { maybe } from "./input.ts";
import {
  clockHM,
  localFromEpochSec,
  nowEpochSec,
  pad2,
  stampMDHM,
} from "./prompt-stamp.ts";
import { DIM, ESC, RST, pctFmt } from "./ansi.ts";

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

function selectRateFromTail(
  path: string,
  size: number,
  length: number,
): z.output<typeof RATE> | undefined {
  const fd = openSync(path, "r");
  const buffer = Buffer.alloc(length);
  readSync(fd, buffer, 0, length, size - length);
  closeSync(fd);
  const lines = buffer.toString("utf8").split("\n");
  if (length < size) lines.shift();
  for (const line of lines.toReversed()) {
    if (line.trim() === "") continue;
    const parsed = jsonOf(TOKEN_COUNT_EVENT).safeParse(line);
    if (parsed.success) return parsed.data.payload.rate_limits;
  }
  return undefined;
}

async function newestRollout(root: string): Promise<string | undefined> {
  const today = Temporal.Now.plainDateISO();
  for (let dayOffset = 0; dayOffset <= 366; dayOffset++) {
    const day = today.subtract({ days: dayOffset });
    const dir = join(root, String(day.year), pad2(day.month), pad2(day.day));
    const names = await readdir(dir).catch(() => []);
    const infos = names
      .filter((name) => /^rollout-.*\.jsonl$/u.test(name))
      .map((name) => {
        const path = join(dir, name);
        const info = fromThrowable(
          () => statSync(path),
          () => null,
        )();
        return info.isOk() && info.value.isFile()
          ? { path, mtimeMs: info.value.mtimeMs }
          : null;
      });
    const newest = infos
      .filter((file) => file !== null)
      .toSorted((a, b) => b.mtimeMs - a.mtimeMs)[0];
    if (newest !== undefined) return newest.path;
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

export async function readCodexRate(
  root = join(process.env.HOME ?? "", ".codex", "sessions"),
): Promise<Result<CodexRate | undefined, string>> {
  const path = await newestRollout(root);
  if (path === undefined) return ok(undefined);
  const infoResult = fromThrowable(
    () => statSync(path),
    () => "codex rate unavailable",
  )();
  if (infoResult.isErr()) return err(infoResult.error);
  const info = infoResult.value;
  let selected: z.output<typeof RATE> | undefined;
  const maxLength = Math.min(info.size, MAX_TAIL_BYTES);
  const readResult = fromThrowable(
    () => {
      const lengths = new Set([
        Math.min(info.size, TAIL_BYTES),
        Math.min(info.size, 512 * 1024),
        maxLength,
      ]);
      for (const length of lengths) {
        selected = selectRateFromTail(path, info.size, length);
        if (selected !== undefined || length === maxLength) break;
      }
    },
    () => "codex rate unavailable",
  )();
  if (readResult.isErr()) {
    return err(readResult.error);
  }
  if (selected === undefined) return ok(undefined);
  const windows = [
    asWindow(selected.primary),
    asWindow(selected.secondary),
  ].filter((item) => item !== undefined);
  const balance = selected.credits?.balance;
  let credits: string | undefined;
  if (
    selected.credits?.has_credits === true &&
    selected.credits.unlimited === false &&
    balance !== undefined
  )
    credits = String(Math.round(Number(balance)));
  if (windows.length === 0 && credits === undefined) return ok(undefined);
  if (credits === undefined) return ok({ windows, mtimeMs: info.mtimeMs });
  return ok({ windows, credits, mtimeMs: info.mtimeMs });
}

function remaining(epoch: number, now: number): string {
  const seconds = Math.max(0, epoch - now);
  if (seconds >= 86400)
    return `${Math.floor(seconds / 86400)}d${Math.floor((seconds % 86400) / 3600)}h`;
  return `${Math.floor(seconds / 3600)}h${pad2(Math.floor((seconds % 3600) / 60))}m`;
}
function ageText(ageMs: number): string {
  const minutes = Math.floor(ageMs / 60000);
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ago`;
  return `${minutes}m ago`;
}
export function codexRateSegment(
  rate: CodexRate | undefined,
  why?: string,
  now = nowEpochSec(),
): string {
  if (rate === undefined) {
    if (why === undefined) return "";
    return `${ESC}[38;5;178mcodex n/a (${why})${RST}`;
  }
  const parts = rate.windows.map((window) => {
    let label = `${window.minutes}m`;
    if (window.minutes === 300) label = "5h";
    if (window.minutes === 10080) label = "7d";
    const formatted = pctFmt(window.percent);
    let item = `codex ${label} ${ESC}[${formatted.col}m${formatted.text}%${RST}`;
    if (window.reset !== undefined) {
      const local = localFromEpochSec(window.reset);
      let stamp = stampMDHM(local);
      if (window.minutes === 300) stamp = clockHM(local);
      const elapsed = Math.round(
        Math.max(
          0,
          Math.min(
            100,
            (1 - Math.max(0, window.reset - now) / (window.minutes * 60)) * 100,
          ),
        ),
      );
      item += ` ${DIM}⟳${stamp}(${remaining(window.reset, now)} ${elapsed}%)${RST}`;
    }
    return item;
  });
  if (parts.length === 0) return "";
  const ageMs = Temporal.Now.instant().epochMilliseconds - rate.mtimeMs;
  if (ageMs > STALE_MS) parts[parts.length - 1] += ` (as of ${ageText(ageMs)})`;
  return parts.join(` ${DIM}·${RST} `);
}
