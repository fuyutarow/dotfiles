// The `clipboard` probe of tools/smart-copy/tool.toml (`mise run doctor:clipboard`) — does a copy through `smart-copy` come back out of this machine's
// clipboard? It OVERWRITES the clipboard with a unique token, so it is a task of its own and never a
// part of plain `mise run doctor` (which only checks that `smart-copy` resolves on PATH).
//
// Consumer: a human or agent reading one verdict line (same format as doctor). Exit 0 for PASS or SKIP,
// 1 for FAIL, 2 for a crash.
//   PASS  the token read back equal to the token copied.
//   FAIL  smart-copy exited nonzero, or the clipboard did not hold the token (fix says what to run).
//   SKIP  no clipboard reader exists here, so nothing was copied: the clipboard is left untouched.
// Readers: WSL — `powershell.exe Get-Clipboard` started through the desktop-session interop socket
// (scripts/wsl-interop-session.ts, the same socket smart-copy fed clip.exe through); macOS — pbpaste.
// A reader that needs a display (xclip, wl-paste) is not used: those hosts SKIP.
import { randomUUID } from "node:crypto";
import {
  desktopInterop,
  repoHelperCommand,
} from "@dotfiles/shared/src/desktop-interop.ts";
import { errorMessage, Result } from "../../shared/src/result.ts";
import { render, type Finding } from "@dotfiles/shared/src/finding.ts";
import { isWslDistro } from "@dotfiles/shared/src/wsl.ts";

const NAME = "clipboard round-trip";
const READ_MS = 15_000;
const SETTLE_MS = 3_000;

export type Reader = {
  name: string;
  /** The clipboard text, or undefined with the reason it could not be read. */
  read: () => Promise<
    { ok: true; text: string } | { ok: false; reason: string }
  >;
};

export type Deps = {
  /** smart-copy --status with `text` on stdin: exit code and its output. */
  copy: (text: string) => Promise<{ code: number; out: string; err: string }>;
  /** The reader for this machine, or the reason there is none. */
  reader: () => Reader | string;
  token: () => string;
  settleMs: number;
};

async function runText(
  cmd: string[],
  options: { stdin?: string; env?: Record<string, string | undefined> },
): Promise<{ code: number; out: string; err: string }> {
  const spawned = Result.try({
    try: () =>
      Bun.spawn(cmd, {
        stdin: options.stdin === undefined ? "ignore" : "pipe",
        stdout: "pipe",
        stderr: "pipe",
        timeout: READ_MS,
        killSignal: "SIGKILL",
        ...(options.env === undefined ? {} : { env: options.env }),
      }),
    catch: (error: unknown) => error,
  });
  if (spawned.isErr())
    return { code: 127, out: "", err: errorMessage(spawned.error) };
  const proc = spawned.value;
  const sink = proc.stdin;
  if (options.stdin !== undefined && sink !== undefined) {
    await sink.write(options.stdin);
    await sink.end();
  }
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out, err };
}

function wslReader(): Reader {
  return {
    name: "powershell.exe Get-Clipboard",
    read: async () => {
      const interop = await desktopInterop(
        repoHelperCommand(process.env["SMART_COPY_INTEROP_HELPER"]),
      );
      if (!interop.ok)
        return {
          ok: false as const,
          reason: `no desktop-session socket: ${interop.reason}`,
        };
      const r = await runText(
        [
          "powershell.exe",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Clipboard -Raw",
        ],
        { env: { ...process.env, WSL_INTEROP: interop.socket } },
      );
      return r.code === 0
        ? { ok: true as const, text: r.out }
        : {
            ok: false as const,
            reason: `powershell.exe exited ${r.code}: ${r.err.trim()}`,
          };
    },
  };
}

function pbpasteReader(): Reader {
  return {
    name: "pbpaste",
    read: async () => {
      const r = await runText(["pbpaste"], {});
      return r.code === 0
        ? { ok: true as const, text: r.out }
        : {
            ok: false as const,
            reason: `pbpaste exited ${r.code}: ${r.err.trim()}`,
          };
    },
  };
}

export function machineReader(isMac: boolean, isWsl: boolean): Reader | string {
  if (isWsl)
    return Bun.which("powershell.exe") === null
      ? "powershell.exe is not on PATH, so the Windows clipboard cannot be read back"
      : wslReader();
  if (isMac)
    return Bun.which("pbpaste") === null
      ? "pbpaste is not on PATH"
      : pbpasteReader();
  return "no clipboard reader on this OS (a Linux reader needs a display server)";
}

/** undefined once the token is read back; otherwise what the last read showed. */
async function pollFor(
  reader: Reader,
  token: string,
  settleMs: number,
): Promise<string | undefined> {
  const deadline = Temporal.Now.instant().epochMilliseconds + settleMs;
  for (;;) {
    const read = await reader.read();
    if (read.ok && read.text.trim() === token) return undefined;
    const last = read.ok
      ? `the clipboard held ${JSON.stringify(read.text.trim().slice(0, 60))}`
      : read.reason;
    if (Temporal.Now.instant().epochMilliseconds >= deadline) return last;
    await Bun.sleep(250);
  }
}

export async function checkClipboardRoundTrip(deps: Deps): Promise<Finding> {
  const reader = deps.reader();
  if (typeof reader === "string")
    return {
      name: NAME,
      verdict: "SKIP",
      detail: `${reader}; the clipboard was not touched`,
    };
  const token = deps.token();
  const copied = await deps.copy(token);
  if (copied.code !== 0)
    return {
      name: NAME,
      verdict: "FAIL",
      detail: `smart-copy exited ${copied.code}`,
      lines: copied.err
        .trim()
        .split("\n")
        .filter((l) => l !== ""),
      fix: "printf x | smart-copy --status  (a route reason is printed per line)",
    };
  // The clipboard may settle a moment after the writer exits; poll until the deadline.
  const last = await pollFor(reader, token, deps.settleMs);
  if (last === undefined)
    return {
      name: NAME,
      verdict: "PASS",
      detail: `copied a token with smart-copy and read it back with ${reader.name} (${copied.out.trim()})`,
    };
  return {
    name: NAME,
    verdict: "FAIL",
    detail: `smart-copy exited 0 but the token did not come back via ${reader.name}: ${last}`,
    lines: [copied.out.trim()],
    fix: "read the smart-copy --status line: a 'written' terminal route is not delivery; check the native route",
  };
}

if (import.meta.main) {
  const isWsl = isWslDistro();
  const result = await Result.tryPromise({
    try: () =>
      checkClipboardRoundTrip({
        copy: (text) => runText(["smart-copy", "--status"], { stdin: text }),
        reader: () => machineReader(process.platform === "darwin", isWsl),
        token: () => `dotfiles-doctor-clipboard-${randomUUID()}`,
        settleMs: SETTLE_MS,
      }),
    catch: (error: unknown) => error,
  });
  if (result.isErr()) {
    process.stderr.write(`doctor:clipboard: ${errorMessage(result.error)}\n`);
    process.exitCode = 2;
  } else {
    process.stdout.write(render([result.value]));
    process.exitCode = result.value.verdict === "FAIL" ? 1 : 0;
  }
}
