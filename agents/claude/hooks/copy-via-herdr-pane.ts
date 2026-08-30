#!/usr/bin/env bun
// CLI: bun copy-via-herdr-pane.ts <payload-file>
//   exit 0 = delivered (prints the pane id it used), non-zero = could not deliver.
//
// WHY THIS EXISTS. Claude Code cannot put arbitrary text on the clipboard, by design:
// every process it spawns (Bash tool, hooks — both verified 2026-08-30) has NO controlling
// terminal (`tty` -> "not a tty", open("/dev/tty") -> ENXIO), so an OSC 52 escape written
// from inside one goes nowhere; and the ONE privileged escape-passthrough channel hooks do
// get, the `terminalSequence` JSON field, names "OSC 52 clipboard writes" in its REJECTED
// list (hooks.md). Built-in /copy works only because Claude Code's own process owns the pty.
//
// THE WAY AROUND IT. herdr owns the panes. A sibling pane running an ordinary interactive
// shell DOES have a real pty, so a command run *there* reaches the terminal exactly as if the
// human had typed it — which is how zsh/copy-to-clipboard.sh's OSC 52 branch gets delivered
// over SSH. `herdr pane run` types the command into that pane for us. Verified end-to-end
// 2026-08-30: a marker sent this way landed in the Mac client's clipboard over
// Tailscale -> SSH -> WSL2 -> herdr.
//
// SAFETY — this WRITES INTO A SHELL THE HUMAN OWNS. `herdr pane run` appends text + Enter to
// whatever that pane's shell currently holds, so firing it at a pane with half-typed input
// would execute the human's fragment glued to our command. Hence: only a pane whose last line
// is a BARE PROMPT is eligible (see idlePrompt()), and agent panes are excluded outright.
// If no pane qualifies we exit non-zero and the caller falls back to printing the text —
// never "probably fine, send it anyway".
//
// The payload travels as a FILE PATH, never interpolated into the command line: it is
// arbitrary assistant prose (quotes, backticks, newlines, $) and shell-quoting it would be a
// needless injection surface.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const HERDR_BIN = process.env.HERDR_BIN_PATH || "herdr";
const DOTFILES = process.env.DOTFILES || `${process.env.HOME}/dotfiles`;
const CLIP_SCRIPT = `${DOTFILES}/zsh/copy-to-clipboard.sh`;

function herdr(args: string[]): any {
  const out = execFileSync(HERDR_BIN, args, {
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf8",
    timeout: 5000,
  });
  return JSON.parse(out);
}

// A pane is safe to type into only when its shell is sitting at an empty prompt. Matches a
// bare prompt character alone on the final line — `$` (this repo's PS1 puts user@host on its
// OWN line above), `%` (zsh default), `#` (root), `>` (continuation). Anything else — a
// half-typed command, a pager, a TUI, a running job — fails closed.
function idlePrompt(paneId: string): boolean {
  try {
    // `pane read` prints the pane's visible text RAW — it is the one herdr subcommand here
    // that does not answer in JSON, so this deliberately does not go through herdr().
    const text = execFileSync(HERDR_BIN, ["pane", "read", paneId], {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
      timeout: 5000,
    });
    const lines = text.replace(/\s+$/, "").split("\n");
    const last = (lines[lines.length - 1] ?? "").trim();
    return /^[$%#>]$/.test(last);
  } catch {
    return false;
  }
}

const payloadFile = process.argv[2];
if (!payloadFile || !existsSync(payloadFile)) {
  console.error("usage: copy-via-herdr-pane.ts <payload-file>");
  process.exit(2);
}
if (process.env.HERDR_ENV !== "1" || !existsSync(CLIP_SCRIPT)) process.exit(3);

const workspace = process.env.HERDR_WORKSPACE_ID;
const selfPane = process.env.HERDR_PANE_ID;

let panes: Array<{ pane_id?: string; workspace_id?: string; agent?: string }>;
try {
  panes = herdr(["pane", "list"])?.result?.panes ?? [];
} catch {
  process.exit(4);
}

const candidates = panes.filter(
  (p) =>
    p.pane_id &&
    p.pane_id !== selfPane &&
    // Same workspace only: a pane in another workspace may be attached to a different client
    // (or none), so "it has a pty" would not mean "it has THIS human's terminal".
    (!workspace || p.workspace_id === workspace) &&
    // An agent pane's shell belongs to that agent's TUI, not to a prompt we may type at.
    !p.agent,
);

for (const p of candidates) {
  const id = p.pane_id as string;
  if (!idlePrompt(id)) continue;
  try {
    execFileSync(
      HERDR_BIN,
      ["pane", "run", id, `'${CLIP_SCRIPT}' < '${payloadFile}'`],
      { stdio: ["ignore", "ignore", "ignore"], timeout: 5000 },
    );
    console.log(id);
    process.exit(0);
  } catch {
    // that pane refused the run — try the next candidate
  }
}

process.exit(5); // no idle shell pane available -> caller prints the text instead
