// PreToolUse gate (matcher: Bash), Claude only — a long or waiting Bash call runs in the BACKGROUND.
//
// Owner, 2026-10-06: 「ctrl+b で明示的に bg にやってるけど、本来常に そうあるべき」. A foreground Bash
// call holds the whole session: the human cannot talk to the coordinator until it returns, and
// had to press ctrl+b by hand, again and again, on waits the coordinator itself had started.
// Claude Code has no setting that makes a call background by its length; this gate refuses the
// foreground form:
//
//   deny when run_in_background is not true AND
//     - this command, or any step of it (`a && b`), has MEASURED over FOREGROUND_MEASURED_MAX_MS here
//       (bash-durations.ts; record-bash-duration.ts keeps the history) — the rule that matters:
//       owner 2026-10-06 「in background が規定にならないのだけど」 after `mise run commit` (no
//       timeout, no loop, minutes long) passed the two text rules below, or
//     - timeout > FOREGROUND_MAX_MS (asking for more than the default bound announces a long call), or
//     - the command is a wait loop: `until`/`while` … `sleep`.
// A dispatched `claude -p` worker has no human session to hold and cannot receive a background
// completion notice. `run-claude.ts` marks that child with AGENT_ROUTER_WORKER=1; in that
// session all three background rules are lifted. The worker's own run-claude timeout still bounds it.
//
// An allowed foreground call has its start recorded, so its duration is measured too. A command
// never measured passes once; from then on its own history decides. run_in_background is a Claude
// Code tool field (Codex has no such mode), so this is a Claude hook (agents/claude/settings.json).
// FAIL CLOSED (run.sh --fail-closed).

import { at, num, strAt } from "../../hooks/narrow.ts";
import {
  AGENT_ROUTER_WORKER_ENV,
  AGENT_ROUTER_WORKER_VALUE,
} from "../../../tools/shared/src/worker-env.ts";
import {
  commandKey,
  judgedMs,
  recordStart,
  stateDir,
  stepKeys,
} from "./bash-durations.ts";
import { decidePre, readStdinJson } from "./lib.ts";

export const FOREGROUND_MAX_MS = 120_000;
// How long the human may be kept waiting on a call the coordinator started in front. 5 s, the
// owner's bound (2026-10-06: 「5sで終わらなかったら bg送りにしたい」 after a 20 s `bun test` showed
// "ctrl+b to run in background"); a quick read, sed or ssh probe stays under it.
export const FOREGROUND_MEASURED_MAX_MS = 5000;
const WAIT_LOOP = /\b(?:until|while)\b[\s\S]*?\bsleep\b/u;

/** Why this Bash call must go to the background, or undefined when it may stay in front.
 *  `measured` is the median duration of this command's kind here, when known. */
export function backgroundReason(
  input: unknown,
  measured?: { key: string; ms: number },
  isWorker = false,
): string | undefined {
  if (isWorker) return undefined;
  if (at(input, "run_in_background") === true) return undefined;
  if (measured !== undefined && measured.ms > FOREGROUND_MEASURED_MAX_MS)
    return `\`${measured.key}\` has taken ${Math.round(measured.ms / 1000)} s here (the larger of its median and its latest run) (the foreground maximum is ${FOREGROUND_MEASURED_MAX_MS / 1000} s)`;
  const timeout = num(at(input, "timeout"));
  if (timeout !== undefined && timeout > FOREGROUND_MAX_MS)
    return `it asks for a ${Math.round(timeout / 1000)} s timeout (the foreground maximum is ${FOREGROUND_MAX_MS / 1000} s)`;
  if (WAIT_LOOP.test(strAt(input, "command") ?? ""))
    return "it is a wait loop (until/while … sleep)";
  return undefined;
}

const payload = import.meta.main ? readStdinJson() : undefined;
const input = at(payload, "tool_input");
const isBash = strAt(payload, "tool_name") === "Bash";
const isWorker =
  process.env[AGENT_ROUTER_WORKER_ENV] === AGENT_ROUTER_WORKER_VALUE;
const command = isBash ? (strAt(input, "command") ?? "") : "";
const key = isBash ? commandKey(command) : undefined;
const dir = stateDir();
// Judged by the slowest known of the whole command and each of its steps: a compound call first
// seen as a whole still goes to the background when one of its steps (`bun test`) is known slow.
const measured = [
  ...new Set([...(key === undefined ? [] : [key]), ...stepKeys(command)]),
]
  .flatMap((k) => {
    const ms = judgedMs(dir, k);
    return ms === undefined ? [] : [{ key: k, ms }];
  })
  .toSorted((a, b) => b.ms - a.ms)[0];
const why = isBash ? backgroundReason(input, measured, isWorker) : undefined;
// SINGLE-AXIS: one question (may this call hold the session?) — its triggers share one resend
if (why !== undefined)
  decidePre(
    "deny",
    `background-waits: this Bash call must not hold the session — ${why}. Resend it with ` +
      `run_in_background: true (you are re-invoked when it exits; read its output file then). ` +
      `The human should never have to press ctrl+b on a wait you started.`,
  );
// Allowed in front: measure it (record-bash-duration.ts closes the record on PostToolUse).
const toolUseId = strAt(payload, "tool_use_id");
if (
  key !== undefined &&
  toolUseId !== undefined &&
  at(input, "run_in_background") !== true
)
  recordStart(dir, toolUseId, key, Temporal.Now.instant().epochMilliseconds);
