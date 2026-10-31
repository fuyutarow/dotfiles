// How long each kind of Bash command actually takes here, measured — so a slow one is sent to the
// background by what it did, not by how its text looks. Owner 2026-10-06: 「in background が規定に
// ならないのだけど」 — `mise run commit` (no timeout, no loop) ran in front for minutes while the
// human waited, because enforce-background-waits judged only the text.
//
// PreToolUse (enforce-background-waits) records the start of every foreground Bash call by its
// tool_use_id; PostToolUse (record-bash-duration) turns that into a duration and keeps the last
// KEEP durations per key. Full command hashes identify exact calls; eligible single commands also
// record a coarse task shape (`mise run commit`, `bun test`, `agx worker run`).
// Zero-dep (hooks run before node_modules exist): node fs and the vendored zod bundle.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { access, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { jsonOf, z } from "../../hooks/zod.ts";
import { parseShell } from "../../hooks/shell-syntax.ts";

const KEEP = 10;

/** $CLAUDE_BASH_DURATIONS_DIR (test seam), else ~/.local/state/claude-bash-durations. */
export const stateDir = (env: NodeJS.ProcessEnv = process.env): string =>
  env["CLAUDE_BASH_DURATIONS_DIR"] ??
  join(homedir(), ".local/state/claude-bash-durations");

// The key is the command's leading words, then the FLAGS it was given (values dropped): a flag
// changes what a command does and how long it takes (`example-records leaderboard` 0.6 s vs
// `example-records leaderboard --all` 120 s, Vast 2026-10-06), while a value (a brief path, a message)
// must not split one kind of command into many. `--` ends the options; a path, a variable or a
// quote ends the leading words.
const NOT_A_WORD = /^[/.~$'"(]/u;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/u;

/** One step's key: `<up to 3 leading words> <up to 3 flags>`, env assignments dropped. */
function stepKey(step: string): string | undefined {
  let all = step.split(/\s+/u).filter((w) => w !== "" && !ASSIGNMENT.test(w));
  // Julia scripts are workloads, not subcommands: retain the shared runtime history.
  if (all[0] === "julia") return "julia";
  // Directory selection is not a mise task. Previously every `mise -C … run TASK`
  // collapsed to `mise -C`, making a slow land poison a later deps or inspection.
  if (all[0] === "mise") {
    while (all[1] === "-C" || all[1] === "--cd") all.splice(1, 2);
    if (all[1]?.startsWith("--cd=") === true || /^-C./u.test(all[1] ?? ""))
      all.splice(1, 1);
  }
  const end = all.indexOf("--");
  const words = end === -1 ? all : all.slice(0, end);
  const firstFlag = words.findIndex((w) => w.startsWith("-"));
  const lead = firstFlag === -1 ? words : words.slice(0, firstFlag);
  const stop = lead.findIndex((w) => NOT_A_WORD.test(w) || w.includes("/"));
  const head = (stop === -1 ? lead : lead.slice(0, stop)).slice(0, 3);
  let commandHead = head;
  if (
    head[0] === "agx-worker" &&
    (head[1] === "run" || head[1] === "dispatch")
  ) {
    commandHead = head.slice(0, 2);
  }
  const flags =
    firstFlag === -1
      ? []
      : words
          .slice(firstFlag)
          .filter((w) => w.startsWith("-"))
          .map((w) => w.replace(/=.*$/u, ""))
          .slice(0, 3);
  return commandHead.length === 0
    ? undefined
    : [...commandHead, ...flags].join(" ");
}

/** The key of every step of a compound command (`a && b; c`), `cd …` and assignment-only steps
 *  skipped. Owner 2026-10-06: `cd … && f=… && sed … && bun test …` ran 20 s in front because the
 *  first step was an assignment, so the call had no key at all. */
export function stepKeys(command: string): string[] {
  const parsed = parseShell(command);
  // Unsupported syntax must retain the entire call's identity, never a guessed
  // leading command that could inherit work hidden in that syntax.
  if (parsed === undefined) return [`unparsed:${command}`];
  return parsed.commands
    .filter((c) => !c.header && c.words[0] !== "cd")
    .map((c) => {
      const raw = c.rawWords.join(" ");
      return stepKey(raw) ?? (c.words.length > 0 ? `exact:${raw}` : undefined);
    })
    .filter((k) => k !== undefined);
}

/** The whole command's key: its step keys joined, so a compound call is measured as itself and a
 *  fast step never inherits the time of a slow one beside it. undefined when no step has a key. */
export function commandKey(command: string): string | undefined {
  const keys = stepKeys(command);
  return keys.length === 0 ? undefined : keys.join(" && ");
}

/** Hash the complete command without changing quoting or whitespace inside arguments. */
export function exactKey(command: string): string {
  return `exact:${createHash("sha256").update(command.trim()).digest("hex")}`;
}

/** Coarse keys are unsafe for cheap local commands and arbitrary remote or inline scripts. */
export function historyShapeKeys(command: string): string[] {
  const parsed = parseShell(command);
  if (parsed === undefined) return [];
  const eligible = parsed.commands.filter((c) => {
    const name = c.words[0];
    return (
      name !== undefined &&
      !/^(?:ls|cat|head|tail|wc|stat|test|date|echo|ssh)$/u.test(name) &&
      !(name === "bun" && c.words[1] === "-e") &&
      name !== "cd" &&
      !c.header
    );
  });
  return eligible.flatMap((c) => {
    const key = stepKey(c.rawWords.join(" "));
    return key === undefined ? [] : [key];
  });
}

const Summary = z.record(z.string(), z.array(z.number()));
type Summary = z.output<typeof Summary>;
const Pending = z.object({
  key: z.string(),
  exact: z.string().optional(),
  started: z.number(),
  version: z.literal(2),
});

const readParsed = async <T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<T | undefined> => {
  const exists = await access(path).then(
    () => true,
    () => false,
  );
  if (!exists) return undefined;
  const parsed = jsonOf(schema).safeParse(await readFile(path, "utf8"));
  return parsed.success ? parsed.data : undefined;
};
const summaryPath = (dir: string): string => join(dir, "summary.json");
const pendingPath = (dir: string, id: string): string =>
  join(dir, "pending", `${id.replaceAll(/[^A-Za-z0-9_-]/gu, "_")}.json`);

/** PostToolUse did not supply a tool-runtime measurement; discard the start instead of timing hooks. */
export async function discardStart(
  dir: string,
  toolUseId: string,
): Promise<void> {
  await rm(pendingPath(dir, toolUseId), { force: true });
}

/** PreToolUse: a foreground call of `key` starts now. */
export function recordStart(
  dir: string,
  toolUseId: string,
  key: string,
  nowMs: number,
  exact?: string,
): void {
  mkdirSync(join(dir, "pending"), { recursive: true });
  writeFileSync(
    pendingPath(dir, toolUseId),
    JSON.stringify({ key, exact, started: nowMs, version: 2 }),
  );
}

/** PostToolUse: the call ended now; keep its duration. Returns it, or undefined if no start was seen. */
export async function recordEnd(
  dir: string,
  toolUseId: string,
  nowMs: number,
  measuredMs?: number,
): Promise<number | undefined> {
  const path = pendingPath(dir, toolUseId);
  const pending = await readParsed(path, Pending);
  rmSync(path, { force: true });
  if (pending === undefined) return undefined;
  // Claude's PostToolUse duration_ms measures the tool itself, excluding permission prompts
  // and PreToolUse hooks. Keep the wall-clock interval only as a compatibility fallback.
  const ms = Math.max(0, measuredMs ?? nowMs - pending.started);
  const summary: Summary = (await readParsed(summaryPath(dir), Summary)) ?? {};
  // Old samples lack provenance: pipelines and substitutions could have been
  // stored as just `echo`, `cut …` or `sed -i`. Never mix those into new samples.
  const key = `v2:${pending.key}`;
  summary[key] = [...(summary[key] ?? []), ms].slice(-KEEP);
  if (pending.exact !== undefined && pending.exact !== pending.key) {
    const exact = `v2:${pending.exact}`;
    summary[exact] = [...(summary[exact] ?? []), ms].slice(-KEEP);
  }
  writeFileSync(summaryPath(dir), `${JSON.stringify(summary)}\n`);
  return ms;
}

/** The median measured duration of `key` here, or undefined before its first measurement. */
export async function medianMs(
  dir: string,
  key: string,
): Promise<number | undefined> {
  const summary = (await readParsed(summaryPath(dir), Summary)) ?? {};
  const runs = summary[`v2:${key}`] ?? summary[key];
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
export async function judgedMs(
  dir: string,
  key: string,
): Promise<number | undefined> {
  const summary = (await readParsed(summaryPath(dir), Summary)) ?? {};
  // Keep legacy slow task histories (land, tests, installs), but retire ambiguous
  // viewer/builtin keys. Newly measured slow single commands still count, even
  // for these tools: this is a provenance boundary, not a permanent exemption.
  if (
    summary[`v2:${key}`] === undefined &&
    !key.includes(" && ") &&
    /^(?:echo|printf|sed|cat|cut|head|tail|wc|ls|mise -C|mise --cd)(?:\s|$)/u.test(
      key,
    )
  )
    return undefined;
  const runs = summary[`v2:${key}`] ?? summary[key];
  const median = await medianMs(dir, key);
  const latest = runs?.at(-1);
  if (median === undefined || latest === undefined) return undefined;
  return Math.max(median, latest);
}
