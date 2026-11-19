#!/usr/bin/env bun
// smart-copy — put stdin on the clipboard of the screen the human is at, without inferring where that is.
// Consumer: callers that today use zsh/copy-to-clipboard.sh (a later change switches them; none is
// switched yet). Contract and reasons: tools/smart-copy/src/terminal.ts and native.ts.
//
// IT DOES BOTH, EVERY TIME. Opening a URL on the wrong screen is harmful, so smart-open must decide.
// Copying the same text to two clipboards is harmless, so smart-copy must NOT decide:
//   1. terminal  OSC 52 to /dev/tty, else to the terminal of the nearest ancestor that has one;
//   2. native    this machine's clipboard tool (clip.exe, pbcopy, xclip, xsel), bounded to 5 s.
// No SSH_*, HERDR_* or smart-open socket state is read; what chose a route in the past was state
// inherited at process start (SSH_CONNECTION kept by a long-lived herdr pane, a stale WSL_INTEROP).
//
// EXIT. 0 — at least one route succeeded. 1 — none did; one stderr line per route says why.
// 2 — usage error, or stdin empty / not UTF-8 / a terminal. Default prints nothing on success;
// --status prints one stdout line naming each route's result.
import { cli as cleyeCli } from "cleye";
import { attempt } from "@dotfiles/shared/src/attempt.ts";
import { standardCli } from "@dotfiles/shared/src/cli.ts";
import pkg from "../package.json" with { type: "json" };
import { copyNative, type NativeResult } from "./native.ts";
import { echoTerminal, osc52, writeTerminal } from "./terminal.ts";
import type { TerminalResult } from "./terminal.ts";

const cliArgv = () => process.argv.slice(2);
const cli = standardCli(cleyeCli, pkg, cliArgv);

const die = (msg: string, code = 2): never => {
  process.stderr.write(`smart-copy: ${msg}\n`);
  process.exit(code);
};

// Every unknown option (`--__proto__` included) is a usage error, exit 2, not Cleye's exit 1.
const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag") die(`unknown option '${flag}'`);
};

/** Terminal route result as the status text names it. */
export function terminalText(r: TerminalResult): string {
  if (!r.ok) return `not written (${r.reason})`;
  const whose = r.ancestor ? ", ancestor's terminal" : "";
  return `written (${r.device}${whose})`;
}

/** Native route result as the status text names it. */
export function nativeText(r: NativeResult): string {
  if (r.ok)
    return r.note === "" ? `ok (${r.tool})` : `ok (${r.tool}; ${r.note})`;
  return `failed (${r.reason})`;
}

const echoText = (r: { ok: true } | { ok: false; reason: string }): string =>
  r.ok ? "written (/dev/tty)" : `not written (${r.reason})`;

/** The one-line status: each route's result. */
export function statusLine(
  terminal: TerminalResult,
  native: NativeResult,
  echo?: string,
): string {
  const parts = [
    `terminal: ${terminalText(terminal)}`,
    `native: ${nativeText(native)}`,
  ];
  if (echo !== undefined) parts.push(`echo: ${echo}`);
  return parts.join("; ");
}

if (import.meta.main) {
  const argv = cli(
    {
      name: "smart-copy",
      version: pkg.version,
      strictFlags: true,
      parameters: [],
      ignoreArgv: rejectPrototypeFlag,
      help: {
        description: [
          "Copy stdin to the clipboard of the screen you are at — by doing both routes, every time.",
          "",
          "  printf 'text' | smart-copy",
          "  git diff | smart-copy --status",
          "  pbpaste | smart-copy --echo",
          "",
          "Terminal: an OSC 52 escape goes to /dev/tty, or, with no controlling terminal, to the terminal of the",
          "nearest ancestor process that has one. 'written' means the bytes left this process for a terminal",
          "device; it does NOT mean the terminal accepted them (OSC 52 may be disabled; tmux needs",
          "`set -g set-clipboard on`) — delivery is not observable from here.",
          "Native: this machine's clipboard tool is fed too — clip.exe (WSL, UTF-16LE), pbcopy, xclip, xsel —",
          "bounded to 5 s; a tool still running then is stopped and reported.",
          "No SSH_*, HERDR_* or smart-open state is read, and no environment variable selects a route.",
          "",
          "stdin is the text (UTF-8, kept byte for byte, trailing newline included); empty stdin is an error.",
          "Exit 0: at least one route succeeded. Exit 1: none did, one stderr line per route. Exit 2: usage error.",
          "",
          "Test seams (not route switches): SMART_COPY_TTY pins the terminal device, SMART_COPY_NATIVE_MS",
          "shortens the 5 s bound, SMART_COPY_INTEROP_HELPER replaces the WSL interop helper command.",
        ].join("\n"),
      },
      flags: {
        status: {
          type: Boolean,
          default: false,
          description: "print one line naming each route's result on stdout",
        },
        echo: {
          type: Boolean,
          default: false,
          description:
            "also write the text to the controlling terminal, like tee (never to an ancestor's)",
        },
      },
    },
    undefined,
    cliArgv(),
  );

  if (argv._.length > 0) die("takes no arguments; the text is stdin");
  if (process.stdin.isTTY)
    die("stdin is a terminal; pipe the text in, e.g. `printf x | smart-copy`");
  const bytes = await Bun.stdin.bytes();
  if (bytes.length === 0) die("stdin is empty; nothing to copy");
  const decoded = await attempt(() =>
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  if (!decoded.ok) die("stdin is not valid UTF-8");
  const text = decoded.ok ? decoded.value : "";

  const env = process.env;
  const line = text.endsWith("\n") ? text : `${text}\n`;
  const echo = argv.flags.echo ? await echoTerminal(line, env) : undefined;
  const [terminal, native] = await Promise.all([
    writeTerminal(osc52(bytes), env),
    copyNative(text, env),
  ]);

  const echoState = echo === undefined ? undefined : echoText(echo);
  if (argv.flags.status)
    await Bun.write(Bun.stdout, `${statusLine(terminal, native, echoState)}\n`);
  // One stderr line per route, only when none delivered; a partial failure is --status's to name.
  if (!terminal.ok && !native.ok) {
    process.stderr.write(`smart-copy: terminal: ${terminal.reason}\n`);
    process.stderr.write(`smart-copy: native: ${native.reason}\n`);
  }
  // A pending terminal write must not keep the process alive past the verdict.
  process.exit(terminal.ok || native.ok ? 0 : 1);
}
