import { hookMessage } from "./lib.ts";
// Stop hook — "leaked tool-call" early-warning.
//
// Detects the Opus-4.x serialization regression where a tool call is emitted as PLAIN
// TEXT (a stray "court"/"count" token then a raw invoke tag) instead of a structured
// call, so nothing executes and the transcript is now poisoned (the model imitates the
// broken XML on later turns = self-poisoning).
//
// DETECTS and ALERTS only. Never exit 2: feeding "you leaked a tool call" back into an
// already-poisoned context makes it worse. The fix is human: Esc Esc -> /rewind.
//
// Precision (avoids firing when a turn merely DISCUSSES this bug):
//   1. TURN-SCOPED   — only this turn's assistant text (lib.turnText).
//   2. CODE-STRIPPED — fences + inline spans removed first; a real leak is RAW text,
//                      mentions of the tags live in code spans.
// FAIL OPEN: any error -> exit 0 (never break a turn).

import { spawnSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { attempt } from "../../hooks/attempt.ts";
import { strAt } from "../../hooks/narrow.ts";
import { readStdinJson, readTranscript, stripCode, turnText } from "./lib.ts";

async function main(): Promise<void> {
  const payload = readStdinJson();
  const transcript = strAt(payload, "transcript_path");
  if (transcript === undefined || transcript === "") return;

  const turn = turnText(await readTranscript(transcript));
  if (turn === "") return;

  const stripped = stripCode(turn);
  if (!/<(antml:)?invoke name=|<(antml:)?function_calls/u.test(stripped))
    return;

  await attempt(() => {
    appendFileSync(
      `${process.env.HOME ?? ""}/.claude/leaked-toolcall.log`,
      `${Temporal.Now.instant().toString({ fractionalSecondDigits: 3 })}  leaked-toolcall  ${transcript}\n`,
    );
  }); // best-effort

  if (
    process.env.CLAUDE_HOOK_QUIET !== undefined &&
    process.env.CLAUDE_HOOK_QUIET !== ""
  )
    return; // tests: skip bell + desktop notification
  await attempt(() => {
    writeFileSync("/dev/tty", "\u0007");
  }); // terminal bell (best-effort; no tty)
  const msg = hookMessage("tool-call が漏れました — Esc Esc で /rewind を");
  await attempt(() => {
    if (process.platform === "darwin") {
      spawnSync(
        "osascript",
        ["-e", `display notification "${msg}" with title "Claude Code"`],
        {
          stdio: "ignore",
        },
      );
    } else {
      // Linux / WSL2
      spawnSync("notify-send", ["Claude Code", msg], { stdio: "ignore" });
    }
  }); // best-effort
}

await attempt(main); // FAIL OPEN
process.exit(0);
