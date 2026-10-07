// How long each kind of Bash command actually takes here, measured — so a slow one is sent to the
// background by what it did, not by how its text looks. Owner 2026-10-06: 「in background が規定に
// ならないのだけど」 — `mise run commit` (no timeout, no loop) ran in front for minutes while the
// human waited, because enforce-background-waits judged only the text.
//
// PreToolUse (enforce-background-waits) records the start of every foreground Bash call by its
// tool_use_id; PostToolUse (record-bash-duration) turns that into a duration and keeps the last
// KEEP durations per command key. A key is the leading words of the command (`mise run commit`,
// `bun test`, `agent-dispatch run`), so every call of the same tool shares one history.
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

// The key is the command's leading words, then the FLAGS it was given (values dropped): a flag
// changes what a command does and how long it takes (`polysearch leaderboard` 0.6 s vs
// `polysearch leaderboard --all` 120 s, Vast 2026-10-06), while a value (a brief path, a message)
// must not split one kind of command into many. `--` ends the options; a path, a variable or a
// quote ends the leading words.
const NOT_A_WORD = /^[/.~$'"(]/u;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/u;

/** One step's key: `<up to 3 leading words> <up to 3 flags>`, env assignments dropped. */
function stepKey(step: string): string | undefined {
  const all = step.split(/\s+/u).filter((w) => w !== "" && !ASSIGNMENT.test(w));
  const end = all.indexOf("--");
  const words = end === -1 ? all : all.slice(0, end);
  const firstFlag = words.findIndex((w) => w.startsWith("-"));
  const lead = firstFlag === -1 ? words : words.slice(0, firstFlag);
  const stop = lead.findIndex((w) => NOT_A_WORD.test(w) || w.includes("/"));
  const head = (stop === -1 ? lead : lead.slice(0, stop)).slice(0, 3);
  const flags =
    firstFlag === -1
      ? []
      : words
          .slice(firstFlag)
          .filter((w) => w.startsWith("-"))
          .map((w) => w.replace(/=.*$/u, ""))
          .slice(0, 3);
  return head.length === 0 ? undefined : [...head, ...flags].join(" ");
}

/** The key of every step of a compound command (`a && b; c`), `cd …` and assignment-only steps
 *  skipped. Owner 2026-10-06: `cd … && f=… && sed … && bun test …` ran 20 s in front because the
 *  first step was an assignment, so the call had no key at all. */
export function stepKeys(command: string): string[] {
  return command
    .split(/&&|\|\||;|\n/u)
    .map((s) => s.trim())
    .filter((s) => s !== "" && !/^cd(?:\s|$)/u.test(s))
    .map((s) => stepKey(s))
    .filter((k) => k !== undefined);
}

/** The whole command's key: its step keys joined, so a compound call is measured as itself and a
 *  fast step never inherits the time of a slow one beside it. undefined when no step has a key. */
export function commandKey(command: string): string | undefined {
  const keys = stepKeys(command);
  return keys.length === 0 ? undefined : keys.join(" && ");
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

/** The duration this kind of command is judged by: the larger of its median and its latest run, so
 *  one slow run (`--all`, a cold cache) is enough to send the next call to the background — the
 *  error that costs the human a wait is the one to avoid. undefined before its first measurement. */
export function judgedMs(dir: string, key: string): number | undefined {
  const runs = (readParsed(summaryPath(dir), Summary) ?? {})[key];
  const median = medianMs(dir, key);
  const latest = runs?.at(-1);
  if (median === undefined || latest === undefined) return undefined;
  return Math.max(median, latest);
}
