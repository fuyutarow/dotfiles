// The terminal route: write OSC 52 (`ESC ] 52 ; c ; <base64> BEL`) to the terminal the human types in.
//
// WHY THIS ROUTE NEEDS NO FACTS ABOUT WHERE THE HUMAN IS. A terminal is, by construction, the screen the
// human is at — locally, over ssh, or through a herdr pane; the escape travels back through whatever
// carries the session. So nothing here reads SSH_*, HERDR_* or a smart-open socket.
//
// WHICH DEVICE. A command typed by a human has /dev/tty. A process an agent spawned (a hook, a tool call)
// has NO controlling terminal — open("/dev/tty") fails with ENXIO — but the agent it descends from still
// holds the pane's pty, and an escape written to that device reaches the same terminal (measured
// 2026-11-19 from a Claude hook in a herdr pane on WSL). So when /dev/tty cannot be opened the nearest
// ancestor process that has a terminal names the device: `ps -o ppid=,tty= -p <pid>`, portable to macOS
// and Linux, walked towards init.
//
// "WRITTEN" IS NOT "DELIVERED". A successful write means the bytes left this process for a terminal
// device. Whether the terminal honours OSC 52 (tmux needs `set -g set-clipboard on`; some terminals
// disable it) is not observable from here, so the status says "written", never "delivered".
//
// TEST SEAM. SMART_COPY_TTY=<path> pins the device (no /dev/tty, no ancestor walk): tests must never
// write an escape into the terminal of whoever runs them. It is deliberately not an SSH_*/HERDR_* name
// and is not a route switch for callers: with it unset the behaviour is the one above.
import { constants } from "node:fs";
import { access, open, stat } from "node:fs/promises";
import { errorMessage, Result } from "@dotfiles/shared/src/result.ts";

export const TTY_SEAM = "SMART_COPY_TTY";
/** One write (open + write) to a terminal device is cut here; a flow-controlled tty can block forever. */
export const TTY_MS = 5_000;
const PS_MS = 2_000;
const WALK_LIMIT = 64;

export type TerminalResult =
  | { ok: true; device: string; ancestor: boolean }
  | { ok: false; reason: string };

/** The OSC 52 sequence that sets the clipboard ("c") to `payload`. */
export function osc52(payload: Uint8Array): string {
  return `\u001B]52;c;${Buffer.from(payload).toString("base64")}\u0007`;
}

/** Open `device` for writing, write `text`, close — or say why not, within `ms`. Never throws. */
export async function writeDevice(
  device: string,
  text: string,
  ms = TTY_MS,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const work = (async (): Promise<Result<void, unknown>> => {
    // O_NOCTTY: opening an ancestor's terminal must not make it ours. O_APPEND keeps a pinned regular
    // file (a test) from being overwritten by a second write; on a tty it is a no-op.
    const opened = await Result.tryPromise({
      try: () =>
        open(
          device,
          constants.O_WRONLY | constants.O_NOCTTY | constants.O_APPEND,
        ),
      catch: (error: unknown) => error,
    });
    if (opened.isErr()) return Result.err(opened.error);
    const written = await Result.tryPromise({
      try: () => opened.value.write(text),
      catch: (error: unknown) => error,
    });
    await Result.tryPromise({
      try: () => opened.value.close(),
      catch: (error: unknown) => error,
    });
    return written.isOk() ? Result.ok(undefined) : Result.err(written.error);
  })();
  const timer = Promise.withResolvers<"timeout">();
  const handle = setTimeout(() => {
    timer.resolve("timeout");
  }, ms);
  const first = await Promise.race([work, timer.promise]);
  clearTimeout(handle);
  if (first === "timeout")
    return { ok: false, reason: `${device}: no answer within ${ms} ms` };
  return first.isOk()
    ? { ok: true }
    : { ok: false, reason: `${device}: ${errorMessage(first.error)}` };
}

/** parent pid and terminal name of `pid`, from one `ps`; undefined when ps cannot say. */
async function psRow(
  pid: number,
): Promise<{ ppid: number; tty: string | undefined } | undefined> {
  const spawned = Result.try({
    try: () =>
      Bun.spawn(["ps", "-o", "ppid=,tty=", "-p", String(pid)], {
        stdout: "pipe",
        stderr: "ignore",
        timeout: PS_MS,
        killSignal: "SIGKILL",
      }),
    catch: (error: unknown) => error,
  });
  if (spawned.isErr()) return undefined;
  const [out, code] = await Promise.all([
    new Response(spawned.value.stdout).text(),
    spawned.value.exited,
  ]);
  if (code !== 0) return undefined;
  const parts = out.trim().split(/\s+/u);
  const ppid = Number(parts[0]);
  if (!Number.isInteger(ppid)) return undefined;
  const tty = parts[1];
  // Linux prints "?" and macOS "??" for a process without a terminal.
  return {
    ppid,
    tty: tty === undefined || /^[?-]+$/u.test(tty) ? undefined : tty,
  };
}

/** True for a character device this user may write: the only thing an ancestor's tty can be. */
async function writableCharDevice(path: string): Promise<boolean> {
  const info = await Result.tryPromise({
    try: () => stat(path),
    catch: (error: unknown) => error,
  });
  if (info.isErr() || !info.value.isCharacterDevice()) return false;
  return (
    await Result.tryPromise({
      try: () => access(path, constants.W_OK),
      catch: (error: unknown) => error,
    })
  ).isOk();
}

const deviceOf = (tty: string): string =>
  tty.startsWith("/") ? tty : `/dev/${tty}`;

/** The device of the nearest ancestor of `start` that has a writable terminal, or why none. */
export async function ancestorTerminal(
  start: number,
): Promise<{ ok: true; device: string } | { ok: false; reason: string }> {
  const seen = new Set<number>();
  let pid = start;
  for (let step = 0; step < WALK_LIMIT && pid > 1 && !seen.has(pid); step++) {
    seen.add(pid);
    const row = await psRow(pid);
    if (row === undefined)
      return { ok: false, reason: `ps could not describe process ${pid}` };
    const device = row.tty === undefined ? undefined : deviceOf(row.tty);
    if (device !== undefined && (await writableCharDevice(device)))
      return { ok: true, device };
    pid = row.ppid;
  }
  return { ok: false, reason: "no ancestor process has a writable terminal" };
}

/**
 * Write `text` to this process's controlling terminal, else to the nearest ancestor's. With
 * SMART_COPY_TTY set, only to that path.
 */
export async function writeTerminal(
  text: string,
  env: Record<string, string | undefined>,
  ms = TTY_MS,
): Promise<TerminalResult> {
  const pinned = env[TTY_SEAM];
  if (pinned !== undefined && pinned !== "") {
    const wrote = await writeDevice(pinned, text, ms);
    return wrote.ok ? { ok: true, device: pinned, ancestor: false } : wrote;
  }
  const own = await writeDevice("/dev/tty", text, ms);
  if (own.ok) return { ok: true, device: "/dev/tty", ancestor: false };
  // A /dev/tty that opens but then fails to take the bytes is a terminal problem, not "no terminal".
  if (!/ENXIO|ENOENT|ENODEV|no such device/iu.test(own.reason)) return own;
  const found = await ancestorTerminal(process.pid);
  if (!found.ok)
    return {
      ok: false,
      reason: `no controlling terminal (${own.reason}) and ${found.reason}`,
    };
  const wrote = await writeDevice(found.device, text, ms);
  return wrote.ok ? { ok: true, device: found.device, ancestor: true } : wrote;
}

/**
 * `--echo`: the payload to the CONTROLLING terminal only, like `tee`. An ancestor's terminal is never
 * echoed into: the escape for the clipboard may travel there, visible text must not.
 */
export async function echoTerminal(
  text: string,
  env: Record<string, string | undefined>,
  ms = TTY_MS,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const pinned = env[TTY_SEAM];
  const device = pinned !== undefined && pinned !== "" ? pinned : "/dev/tty";
  return writeDevice(device, text, ms);
}
