#!/usr/bin/env bun
// smart-open — open a URL or path on the screen the human is actually looking at.
// Consumer: zsh `o` / `oo` / `open` (WSL), git `o`, jj `o`. One implementation; those are views.
//
// WHERE IT OPENS, in order (first that succeeds wins):
//   1. URL + a live client receiver  → the CLIENT machine. When you drive this box from a Mac over
//      `ssh` / `herdr --remote`, ssh/config's RemoteForward exposes the Mac's receiver
//      (smart-open/receive.ts) here as /tmp/smart-open-$USER--<client alias>.sock (the newest one
//      wins). Opening "here" would put the page on a screen nobody is in front of — that was the
//      old WSL `o` (explorer.exe, always).
//   2. this machine: macOS `open`; WSL → explorer.exe (a path converted by `wslpath -w` first,
//      because explorer.exe reads only Windows paths); other Linux → xdg-open.
// A PATH lives here, so the client's Finder cannot show it. Over a live forward it goes to the client
// as {path, kind, host}, and the receiver opens it as a VS Code Remote-SSH window on THIS box (`host`
// is the client's own ssh alias for us, read from the forward's socket name). When the
// client cannot do that, the path is NOT opened here either: someone attached remotely is not
// looking at this box's screen (on WSL, an unattended Windows desktop). --here opens it here anyway.
//
// OVER SSH, "HERE" IS NOT A SCREEN. When this shell itself came in over ssh ($SSH_CONNECTION — herdr
// panes inherit it) and the client cannot take the target, nothing is opened on this machine: the
// reason and the repair are said, a URL is printed so the terminal can open it, exit 1. --here opens
// it here anyway. (Before 2026-10-03 a URL fell through to explorer.exe on r99's unattended desktop —
// which, locked, never returns: `g o` sat silent for 15 s and then claimed success.)
// Opening on this machine is bounded to LOCAL_WAIT_MS: an opener still running then is stopped and
// reported, never waited out in silence.
//
// The receiver must ANSWER `ok`. What else the socket can do, and what is said about it (stderr;
// a missing socket is the everyday local case and stays silent). "→ here" below is for a shell NOT
// over ssh (see above); a path also stops at `no answer` and `refused` (exit 1):
//   no socket    not attached over ssh, or no forward         → open here, silently
//   dead bind    ECONNREFUSED: left by a dropped connection.  → open here. sshd re-binds over it where
//                wsl/sshd-dotfiles.conf is installed; elsewhere it is removed here — but only if it is
//                still the very file we probed, since a newer connection may have re-bound the path
//   no answer    accepts but sends no `ok` within ACK_MS, closes without answering, or cannot be
//                connected to for a reason other than "nobody listens" (EACCES, ECONNRESET): the Mac
//                has no usable receiver → open here, and the message says WHICH of these it was
//   refused      e.g. mailto: — a scheme the receiver will not open                       → open here
//   busy         the receiver's rate or connection limit → NOT opened anywhere, exit 1. The limit
//                protects the screen you sit at; opening here would route around it. Run it again,
//                or say --here.
import { existsSync, readFileSync, statSync } from "node:fs";
import { userInfo } from "node:os";
import { join, resolve } from "node:path";
import { cli } from "cleye";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";
import { z } from "../agents/hooks/zod.ts";
import {
  ACK_MS,
  editorHost,
  fileKey,
  remoteForwards,
  remoteSocket,
  SSH_HOST_ENV,
  unlinkIfSame,
  type FileKey,
} from "./sockets.ts";

const die = (msg: string, code = 2): never => {
  console.error(`smart-open: ${msg}`);
  process.exit(code);
};
const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__")
    die(`unknown option '--${flag}'`);
};

const argv = cli(
  {
    name: "smart-open",
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    parameters: ["[targets...]"],
    help: {
      description:
        "Open URLs or paths on the screen you are in front of (client over ssh/herdr, else this machine).",
    },
    flags: {
      here: {
        type: Boolean,
        default: false,
        description: "never forward to the client; open on this machine",
      },
      dryRun: {
        type: Boolean,
        default: false,
        description: "print where each target would open; open nothing",
      },
    },
  },
  undefined,
  Bun.argv.slice(2),
);

// The forward to use, and the client alias its socket name carries (sockets.ts, remoteSocket):
// SMART_OPEN_SOCKET pins one (tests, a hand-bound forward); otherwise the newest bound in
// SMART_OPEN_SOCKET_DIR (default /tmp). With none bound, SOCKET names the pattern, for messages.
function pickForward(): { socket: string; alias: string } {
  const user = userInfo().username;
  const pinned = process.env.SMART_OPEN_SOCKET;
  if (pinned !== undefined) {
    const named = /--([^/]+)\.sock$/u.exec(pinned);
    return { socket: pinned, alias: named?.[1] ?? "" };
  }
  const dir = process.env.SMART_OPEN_SOCKET_DIR ?? "/tmp";
  const newest = existsSync(dir) ? remoteForwards(user, dir)[0] : undefined;
  return newest ?? { socket: remoteSocket(user, "<alias>", dir), alias: "" };
}
const FORWARD = pickForward();
const SOCKET = FORWARD.socket;
// What was searched, for the no-forward message: the pinned path, or the pattern a forward is bound
// at (the alias part unknown on this side — the client chose it).
const LOOKED_FOR =
  process.env.SMART_OPEN_SOCKET ??
  join(
    process.env.SMART_OPEN_SOCKET_DIR ?? "/tmp",
    `smart-open-${userInfo().username}--*.sock`,
  );
// An empty override is no override: an `export SMART_OPEN_SSH_HOST=` must not hide the name's alias.
const configuredSshHost = process.env[SSH_HOST_ENV];
const SSH_HOST =
  configuredSshHost !== undefined && configuredSshHost !== ""
    ? configuredSshHost
    : FORWARD.alias;
const OPEN_MS = 15_000;
// A wait longer than this says what it is waiting for, and the result line then carries how long
// it took: a step that is merely slow (VS Code cold-starting on the client, ssh -G vouching, a
// slow uplink) must never read as a hang. Shorter waits print nothing extra.
// SMART_OPEN_SAY_AFTER_MS overrides it — a test seam, like SMART_OPEN_LOCAL_OPENER: a loaded test
// host makes even a trivial spawn exceed 400 ms, and the quiet-path tests must stay quiet.
const configuredSayAfterMs = Number(process.env.SMART_OPEN_SAY_AFTER_MS ?? "");
const SAY_AFTER_MS =
  Number.isNaN(configuredSayAfterMs) || configuredSayAfterMs === 0
    ? 400
    : configuredSayAfterMs;
const LOCAL_WAIT_MS = 3_000;
// This shell came in over ssh, so this machine's own screen is not the one being looked at.
const OVER_SSH = (process.env.SSH_CONNECTION ?? "") !== "";
const isUrl = (t: string) =>
  /^[a-z][a-z0-9+.-]*:\/\//iu.test(t) || /^mailto:/iu.test(t);
const isWsl = (): boolean =>
  process.platform === "linux" &&
  (process.env.WSL_DISTRO_NAME !== undefined ||
    (existsSync("/proc/version") &&
      /microsoft/iu.test(readFileSync("/proc/version", "utf8"))));

type Outcome =
  | "client"
  | "no-socket"
  | "stale"
  | "no-receiver"
  | "refused"
  | "busy";
// `seen` is the file the probe was made against, kept so a dead bind is removed only if it is
// still that file; `reply` is the receiver's answer line and `why` what went wrong when there was
// none — both only for the message.
type Probe = {
  outcome: Outcome;
  reply: string;
  why: string;
  seen: FileKey | undefined;
};

const classify = (reply: string): Outcome => {
  if (reply.startsWith("ok")) return "client";
  return reply.startsWith("busy") ? "busy" : "refused";
};

const ErrorCodeSchema = z.object({ code: z.unknown() });

// One line out, one line back. Resolves to the outcome; never throws.
function toClient(request: Record<string, string>): Promise<Probe> {
  const seen = fileKey(SOCKET);
  if (seen === undefined || !seen.socket)
    return Promise.resolve({ outcome: "no-socket", reply: "", why: "", seen });
  const { promise, resolve: done } = Promise.withResolvers<Probe>();
  let reply = "";
  const finish = (outcome: Outcome, why = "") => {
    clearTimeout(timer);
    done({ outcome, reply: reply.trim(), why, seen });
  };
  const timer = setTimeout(() => {
    finish("no-receiver", `accepted but sent no ok within ${ACK_MS} ms`);
  }, ACK_MS);
  Bun.connect({
    unix: SOCKET,
    socket: {
      open: (s) => {
        void s.write(`${JSON.stringify(request)}\n`);
      },
      data: (s, chunk) => {
        reply += chunk.toString();
        if (!reply.includes("\n")) return;
        // Settle BEFORE end(): end() fires close synchronously, and close settles "no-receiver".
        finish(classify(reply));
        s.end();
      },
      close: () => {
        finish("no-receiver", "closed the connection without answering");
      },
      error: (_s, e) => {
        finish("no-receiver", `connection error (${e.message})`);
      },
    },
  }).then(
    () => {},
    // A refused connect is a bind nobody listens on: a stale socket, not a missing receiver. Any
    // other failure to connect (EACCES on someone else's socket, ...) is said as what it was.
    (e: unknown) => {
      const withCode = ErrorCodeSchema.safeParse(e);
      const code = String(withCode.success ? (withCode.data.code ?? e) : e);
      if (/ECONNREFUSED|ENOENT/u.test(code)) finish("stale");
      else finish("no-receiver", `could not connect (${code})`);
    },
  );
  return promise;
}

// SMART_OPEN_LOCAL_OPENER replaces the this-machine opener (same seam as the receiver's
// SMART_OPEN_OPENER) so tests can drive every fall-through without opening a real browser.
function localCommand(target: string): string[] {
  const override = process.env.SMART_OPEN_LOCAL_OPENER;
  if (override !== undefined && override !== "")
    return [...override.split(" "), target];
  if (process.platform === "darwin") return ["open", target];
  if (isWsl()) {
    if (isUrl(target)) return ["explorer.exe", target];
    const win = Bun.spawnSync(["wslpath", "-w", target], {
      stdout: "pipe",
      timeout: OPEN_MS,
    });
    const windowsPath = win.stdout.toString().trim();
    return ["explorer.exe", windowsPath !== "" ? windowsPath : target];
  }
  return ["xdg-open", target];
}

// Await `work`; if it is still running after SAY_AFTER_MS, say on stderr what is being waited for.
// Returns the value and, when the wait was long enough to have been said, its duration (" (1.6 s)")
// for the result line; "" otherwise.
async function waitSaying<T>(
  what: string,
  work: Promise<T>,
): Promise<{ value: T; took: string }> {
  const t0 = performance.now();
  const timer = setTimeout(() => {
    console.error(`smart-open: ${what}…`);
  }, SAY_AFTER_MS);
  const value = await work;
  clearTimeout(timer);
  const ms = performance.now() - t0;
  return {
    value,
    took: ms >= SAY_AFTER_MS ? ` (${(ms / 1000).toFixed(1)} s)` : "",
  };
}

// Where a target goes: the client took it, nowhere (said why already), or this machine — `why` is
// the anomaly that sent it here, said once by landHere (undefined: no client at all, the quiet case).
type Routed =
  | { to: "client" | "stop" }
  | { to: "here"; why: string | undefined };
const HERE: Routed = { to: "here", why: undefined };

async function routeUrl(url: string): Promise<Routed> {
  if (argv.flags.dryRun) {
    const otherwise = OVER_SSH
      ? "not opened (this shell is over ssh)"
      : "this machine";
    console.log(`${url} -> client if ${SOCKET} answers, else ${otherwise}`);
    return { to: "client" };
  }
  const { value: probe, took } = await waitSaying(
    `waiting for the client to open ${url}`,
    toClient({ url }),
  );
  if (probe.outcome === "client") {
    console.log(`opened on the client${took}: ${url}`);
    return { to: "client" };
  }
  if (probe.outcome === "busy") {
    console.error(
      `smart-open: the client is busy (${probe.reply}); not opened: ${url} — run it again, or use --here`,
    );
    return { to: "stop" };
  }
  if (probe.outcome === "stale")
    return { to: "here", why: await dropStale(probe) };
  if (probe.outcome === "no-receiver")
    return {
      to: "here",
      why: `${SOCKET} ${probe.why} (is the client's receiver running?)`,
    };
  if (probe.outcome === "refused")
    return {
      to: "here",
      why: `the client receiver refused ${url} (${probe.reply})`,
    };
  return HERE;
}

// A dead bind means no client is attached any more: remove it (if it is still the file we probed)
// and say what happened.
async function dropStale(probe: Probe): Promise<string> {
  const removed =
    probe.seen !== undefined && (await unlinkIfSame(SOCKET, probe.seen));
  return `${SOCKET} had no listener (a dropped ssh connection?)${removed ? "; removed it" : ""}`;
}

// Where a path goes. Only "no client attached" (no socket, or a dead bind) lands it here.
async function routePath(path: string): Promise<Routed> {
  const editor = SSH_HOST === "" ? "<no alias: refused>" : editorHost(SSH_HOST);
  if (argv.flags.dryRun) {
    const otherwise = OVER_SSH
      ? "not opened (this shell is over ssh)"
      : `${localCommand(path).join(" ")} only if no client is attached (no socket, or a dead one); otherwise not opened`;
    console.log(
      `${path} -> the client's VS Code (ssh-remote+${editor}) if ${SOCKET} answers; ${otherwise}`,
    );
    return { to: "client" };
  }
  const kind = statSync(path).isDirectory() ? "dir" : "file";
  const { value: probe, took } = await waitSaying(
    `waiting for the client's VS Code (ssh-remote+${editor}) to take ${path}`,
    toClient({ path, kind, host: SSH_HOST }),
  );
  if (probe.outcome === "client") {
    // `sent`, not `opened`: VS Code asks before opening a remote path, and a No is invisible here.
    console.log(
      `sent to the client's VS Code (ssh-remote+${editor})${took}: ${path}`,
    );
    return { to: "client" };
  }
  if (probe.outcome === "no-socket") return HERE;
  if (probe.outcome === "stale")
    return { to: "here", why: await dropStale(probe) };
  const why = probe.outcome === "no-receiver" ? probe.why : probe.reply;
  console.error(
    `smart-open: attached from a client, but it did not open ${path} (${why})${refusalHint(probe.reply)}. Not opened on this machine's screen either, which nobody attached remotely can see — use --here for that.`,
  );
  return { to: "stop" };
}

// The target could not go to the client. Over ssh this machine's screen is not yours: say why and
// how to repair, print a URL for the terminal to open, and fail. Otherwise open it here.
async function landHere(
  target: string,
  why: string | undefined,
): Promise<boolean> {
  if (OVER_SSH && !argv.flags.here) {
    // One finding per line, in the order a developer acts on them: what failed, what was looked
    // for, why it matters, the fix (where to run it), and the escape hatch. <alias> is the client's
    // ssh alias for this box — this side cannot know it, so it stays a placeholder.
    console.error(
      [
        "smart-open: not opened — no forward from your machine reaches this shell",
        `  looked for: ${LOOKED_FOR} (${why ?? "none bound"})`,
        "  why:  o/oo hand the target to the machine you sit at, through a socket your ssh/herdr attach forwards here",
        "  fix:  on your machine, reattach: herdr --remote <alias>  (a herdr server keeps its first connection's forward)",
        "        the host's ~/.ssh/config.local block needs `Tag smart-open`; check: mise run doctor:remote -- <alias>",
        `  or:   ${isUrl(target) ? "o" : "oo"} --here ${isUrl(target) ? "<url>" : "<path>"}  opens it on this machine instead`,
      ].join("\n"),
    );
    if (isUrl(target)) console.log(target);
    return false;
  }
  if (why !== undefined) console.error(`smart-open: ${why} — opening here`);
  return openHere(target);
}

// The one repair step a known refusal implies, or nothing.
function refusalHint(reply: string): string {
  // A receiver from before path requests answers the URL-only refusal; restarting it loads this one.
  if (reply.includes("only http(s) URLs"))
    return " — the client's receiver predates folder support; on the Mac: launchctl kickstart -k gui/$(id -u)/dotfiles.smart-open-receiver";
  if (reply.includes("without the smart-open forward"))
    return " — on the Mac, give ~/.ssh/config.local's Host line for this box the -code alias too (e.g. `Host r99-wsl r99-wsl-code`)";
  if (reply.includes("no ssh host"))
    return " — the alias rides in the forward's socket name (ssh/config: RemoteForward /tmp/smart-open-%r--%n.sock); reattach from the client so it is bound under that name";
  return "";
}

// This machine, bounded: an opener still running after LOCAL_WAIT_MS is stopped and reported.
// Returns false on failure.
async function openHere(target: string): Promise<boolean> {
  const cmd = localCommand(target);
  if (argv.flags.dryRun) {
    console.log(`${target} -> ${cmd.join(" ")}`);
    return true;
  }
  const deadline = AbortSignal.timeout(LOCAL_WAIT_MS);
  const spawned = await attempt(() =>
    Bun.spawn(cmd, {
      stdout: "ignore",
      stderr: "pipe",
      signal: deadline,
      killSignal: "SIGKILL",
    }),
  );
  if (!spawned.ok) {
    console.error(
      `smart-open: cannot run ${cmd[0]}: ${errorMessage(spawned.error)}`,
    );
    return false;
  }
  const {
    value: [code, err],
  } = await waitSaying(
    `waiting for ${cmd[0]} (gives up after ${LOCAL_WAIT_MS / 1000} s)`,
    Promise.all([
      spawned.value.exited,
      new Response(spawned.value.stderr).text(),
    ]),
  );
  if (deadline.aborted) {
    // A locked or logged-out Windows session is the case seen: explorer.exe then never returns.
    const hint = isWsl()
      ? " — is someone logged in, unlocked, at this machine's Windows desktop?"
      : "";
    console.error(
      `smart-open: ${cmd[0]} did not return within ${LOCAL_WAIT_MS / 1000} s and was stopped; nothing is known to have opened${hint}`,
    );
    return false;
  }
  // explorer.exe exits 1 even when it opened the target; only a spawn failure means anything there.
  if (cmd[0] === "explorer.exe" || code === 0) return true;
  console.error(`smart-open: ${cmd.join(" ")} failed: ${err.trim()}`);
  return false;
}

async function openOne(raw: string): Promise<boolean> {
  if (isUrl(raw)) {
    const routed = argv.flags.here ? HERE : await routeUrl(raw);
    if (routed.to !== "here") return routed.to === "client";
    return landHere(raw, routed.why);
  }
  const path = resolve(raw);
  if (!existsSync(path)) {
    console.error(`smart-open: no such file or directory: ${raw}`);
    return false;
  }
  const routed = argv.flags.here ? HERE : await routePath(path);
  if (routed.to !== "here") return routed.to === "client";
  return landHere(path, routed.why);
}

const targets = argv._.targets.length > 0 ? argv._.targets : ["."];
let failed = 0;
for (const raw of targets) if (!(await openOne(raw))) failed += 1;
process.exit(failed === 0 ? 0 : 1);
