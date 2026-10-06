// How long each kind of Bash command actually takes here, measured — so a slow one is sent to the
// background by what it did, not by how its text looks. Owner 2026-10-06: 「in background が規定に
// ならないのだけど」 — `mise run commit` (no timeout, no loop) ran in front for minutes while the
// human waited, because enforce-background-waits judged only the text.
//
// PreToolUse (enforce-background-waits) records the start of every foreground Bash call by its
// tool_use_id; PostToolUse (record-bash-duration) turns that into a duration and keeps the last
// KEEP durations per command key. A key is the leading words of the command (`mise run commit`,
// `bun test`, `agent-router run`), so every call of the same tool shares one history.
// Zero-dep (hooks run before node_modules exist): node fs and the vendored zod bundle.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../hooks/zod.ts";

const KEEP = 10;

/** $CLAUDE_BASH_DURATIONS_DIR (test seam), else ~/.local/state/claude-bash-durations. */
export const stateDir = (env: NodeJS.ProcessEnv = process.env): string =>
  env.CLAUDE_BASH_DURATIONS_DIR ??
  join(homedir(), ".local/state/claude-bash-durations");

const STOP_WORD = /^[-/.~$'"(]/u;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/u;

/** The command's leading words: env assignments and `cd …` steps skipped, then words up to the
 *  first argument that is a path, a flag, a variable or a quote — at most three. */
export function commandKey(command: string): string | undefined {
  const segments = command.split(/&&|\|\||;|\n/u).map((s) => s.trim());
  const main = segments.find((s) => s !== "" && !/^cd(?:\s|$)/u.test(s));
  if (main === undefined) return undefined;
  const words = main.split(/\s+/u).filter((w) => !ASSIGNMENT.test(w));
  const stop = words.findIndex((w) => STOP_WORD.test(w) || w.includes("/"));
  const head = (stop === -1 ? words : words.slice(0, stop)).slice(0, 3);
  return head.length === 0 ? undefined : head.join(" ");
}

const Summary = z.record(z.string(), z.array(z.number()));
type Summary = z.output<typeof Summary>;
const Pending = z.object({ key: z.string(), started: z.number() });

const readParsed = <T>(path: string, schema: z.ZodType<T>): T | undefined => {
  if (!existsSync(path)) return undefined;
  const parsed = jsonOf(schema).safeParse(readFileSync(path, "utf8"));
  return parsed.success ? parsed.data : undefined;
};
const summaryPath = (dir: string): string => join(dir, "summary.json");
const pendingPath = (dir: string, id: string): string =>
  join(dir, "pending", `${id.replaceAll(/[^A-Za-z0-9_-]/gu, "_")}.json`);

/** PreToolUse: a foreground call of `key` starts now. */
export function recordStart(
  dir: string,
  toolUseId: string,
  key: string,
  nowMs: number,
): void {
  mkdirSync(join(dir, "pending"), { recursive: true });
  writeFileSync(
    pendingPath(dir, toolUseId),
    JSON.stringify({ key, started: nowMs }),
  );
}

/** PostToolUse: the call ended now; keep its duration. Returns it, or undefined if no start was seen. */
export function recordEnd(
  dir: string,
  toolUseId: string,
  nowMs: number,
): number | undefined {
  const path = pendingPath(dir, toolUseId);
  const pending = readParsed(path, Pending);
  rmSync(path, { force: true });
  if (pending === undefined) return undefined;
  const ms = Math.max(0, nowMs - pending.started);
  const summary: Summary = readParsed(summaryPath(dir), Summary) ?? {};
  summary[pending.key] = [...(summary[pending.key] ?? []), ms].slice(-KEEP);
  writeFileSync(summaryPath(dir), `${JSON.stringify(summary)}\n`);
  return ms;
}

/** The median measured duration of `key` here, or undefined before its first measurement. */
export function medianMs(dir: string, key: string): number | undefined {
  const runs = (readParsed(summaryPath(dir), Summary) ?? {})[key];
  if (runs === undefined || runs.length === 0) return undefined;
  const sorted = runs.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}
