// PreToolUse gate (matcher: Bash), Claude only — a long or waiting Bash call runs in the BACKGROUND.
//
// Owner, 2026-10-06: 「ctrl+b で明示的に bg にやってるけど、本来常に そうあるべき」. A foreground Bash
// call holds the whole session: the human cannot talk to the coordinator until it returns, and
// had to press ctrl+b by hand, again and again, on waits the coordinator itself had started
// (until-loops polling a worker, a 10-minute commit gate). Claude Code has no setting that makes
// a call background by its length; this gate does it by refusing the foreground form:
//
//   deny when run_in_background is not true AND
//     - timeout > FOREGROUND_MAX_MS (the default 2-minute bound is the most a foreground call may ask), or
//     - the command is a wait loop: `until`/`while` … `sleep` (polling belongs in the background,
//       where the harness re-invokes the coordinator when it exits).
//
// The reason says what to resend. run_in_background is a Claude Code tool field (Codex has no such
// mode), so this is a Claude hook, wired in agents/claude/settings.json.
// FAIL CLOSED (run.sh --fail-closed).

import { at, num, strAt } from "../../hooks/narrow.ts";
import { decidePre, readStdinJson } from "./lib.ts";

export const FOREGROUND_MAX_MS = 120_000;
const WAIT_LOOP = /\b(?:until|while)\b[\s\S]*?\bsleep\b/u;

/** Why this Bash call must go to the background, or undefined when it may stay in front. */
export function backgroundReason(input: unknown): string | undefined {
  if (at(input, "run_in_background") === true) return undefined;
  const timeout = num(at(input, "timeout"));
  if (timeout !== undefined && timeout > FOREGROUND_MAX_MS)
    return `it asks for a ${Math.round(timeout / 1000)} s timeout (the foreground maximum is ${FOREGROUND_MAX_MS / 1000} s)`;
  if (WAIT_LOOP.test(strAt(input, "command") ?? ""))
    return "it is a wait loop (until/while … sleep)";
  return undefined;
}

const payload = import.meta.main ? readStdinJson() : undefined;
const why =
  strAt(payload, "tool_name") === "Bash"
    ? backgroundReason(at(payload, "tool_input"))
    : undefined;
// SINGLE-AXIS: one question (may this call hold the session?) — its two triggers share one resend
if (why !== undefined)
  decidePre(
    "deny",
    `background-waits: this Bash call must not hold the session — ${why}. Resend it with ` +
      `run_in_background: true (you are re-invoked when it exits; read its output file then). ` +
      `The human should never have to press ctrl+b on a wait you started.`,
  );
