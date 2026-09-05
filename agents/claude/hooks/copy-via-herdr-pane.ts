#!/usr/bin/env bun
// CLI: bun copy-via-herdr-pane.ts <payload-file>
//   exit 0 = delivered (prints the pane id it used, already closed by then), non-zero =
//   could not deliver.
//
// WHY THIS EXISTS. Claude Code cannot put arbitrary text on the clipboard, by design:
// every process it spawns (Bash tool, hooks — both verified 2026-08-30) has NO controlling
// terminal (`tty` -> "not a tty", open("/dev/tty") -> ENXIO), so an OSC 52 escape written
// from inside one goes nowhere; and the ONE privileged escape-passthrough channel hooks do
// get, the `terminalSequence` JSON field, names "OSC 52 clipboard writes" in its REJECTED
// list (hooks.md). Built-in /copy works only because Claude Code's own process owns the pty.
//
// THE WAY AROUND IT. herdr owns the panes. A pane running an ordinary interactive shell DOES
// have a real pty, so a command run *there* reaches the terminal exactly as if the human had
// typed it — which is how zsh/copy-to-clipboard.sh's OSC 52 branch gets delivered over SSH.
//
// v2 — DOES NOT HUNT FOR AN EXISTING IDLE PANE. The v1 design searched the workspace for a
// pane that looked idle and typed into it. That failed live 2026-08-31: the one eligible pane
// in the workspace was mid-`less`, so delivery fell back to printing the whole payload for
// manual copy. "Find something idle" is a bet on what else the human happens to be doing at
// that exact moment, and the bet can lose. Splitting our OWN disposable pane off our own pane
// removes the bet: it is guaranteed unoccupied (it did not exist a moment ago), guaranteed a
// real pty (herdr just created it as one), and guaranteed the same terminal (it is a child of
// the pane we are running in). Verified live: the prompt is ready on the FIRST poll after
// split, every time so far — the retry budget below is generosity, not an observed need.
//
// Visible cost, accepted on purpose: a small pane flashes open and closes. --no-focus keeps
// it from stealing keyboard focus, but it is not invisible. That is a strictly better trade
// than either (a) typing into a pane the human is actively looking at, or (b) silently
// falling back and making them copy by hand.
//
// The payload travels as a FILE PATH, never interpolated into the command line: it is
// arbitrary assistant prose (quotes, backticks, newlines, $) and shell-quoting it would be a
// needless injection surface.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const HERDR_BIN = process.env.HERDR_BIN_PATH || "herdr";
const DOTFILES = process.env.DOTFILES || `${process.env.HOME}/dotfiles`;
const CLIP_SCRIPT = `${DOTFILES}/zsh/copy-to-clipboard.sh`;
const POLL_ATTEMPTS = 10;
const POLL_DELAY_MS = 200;

function herdr(args: string[]): any {
  const out = execFileSync(HERDR_BIN, args, {
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf8",
    timeout: 5000,
  });
  return JSON.parse(out);
}

function closeQuietly(paneId: string): void {
  try {
    execFileSync(HERDR_BIN, ["pane", "close", paneId], {
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 5000,
    });
  } catch {
    // a stray small leftover pane is cosmetic, not a delivery failure -> never throw from here
  }
}

// `pane read` prints the pane's visible text RAW — the one herdr subcommand here that does
// not answer in JSON, so this deliberately does not go through herdr().
function isBarePrompt(paneId: string): boolean {
  try {
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

const selfPane = process.env.HERDR_PANE_ID;
if (!selfPane) process.exit(3);

let paneId: string | undefined;
try {
  const split = herdr([
    "pane",
    "split",
    selfPane,
    "--direction",
    "down",
    "--ratio",
    "0.05",
    "--no-focus",
  ]);
  paneId = split?.result?.pane?.pane_id;
} catch {
  process.exit(4); // split itself failed (e.g. too small to split) -> caller falls back
}
if (!paneId) process.exit(4);

let ready = false;
for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
  if (isBarePrompt(paneId)) {
    ready = true;
    break;
  }
  await Bun.sleep(POLL_DELAY_MS);
}
if (!ready) {
  closeQuietly(paneId);
  process.exit(5);
}

try {
  execFileSync(
    HERDR_BIN,
    ["pane", "run", paneId, `'${CLIP_SCRIPT}' < '${payloadFile}'`],
    { stdio: ["ignore", "ignore", "ignore"], timeout: 5000 },
  );
} catch {
  closeQuietly(paneId);
  process.exit(6);
}

// `pane run` returns once herdr has SENT the keystrokes, not once the shell has finished
// executing them — closing immediately could kill the copy mid-flight. Poll for the prompt
// to reappear (confirming the script actually completed) before tearing the pane down; give
// up and close anyway after the same budget used above, rather than leaving it open forever.
for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
  await Bun.sleep(POLL_DELAY_MS);
  if (isBarePrompt(paneId)) break;
}

closeQuietly(paneId);
console.log(paneId);
process.exit(0);
