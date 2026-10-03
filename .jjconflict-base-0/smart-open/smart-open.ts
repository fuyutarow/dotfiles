#!/usr/bin/env bun
// smart-open — open a URL or path on the screen the human is actually looking at.
// Consumer: zsh `o` / `oo` / `open` (WSL), git `o`, jj `o`. One implementation; those are views.
//
// WHERE IT OPENS, in order (first that succeeds wins):
//   1. URL + a live client receiver  → the CLIENT machine. When you drive this box from a Mac over
//      `ssh` / `herdr --remote`, ssh/config's RemoteForward exposes the Mac's receiver
//      (smart-open/receive.ts) here as /tmp/smart-open-$USER.sock. Opening "here" would put the page on a
//      screen nobody is in front of — that was the old WSL `o` (explorer.exe, always).
//   2. this machine: macOS `open`; WSL → explorer.exe (a path converted by `wslpath -w` first,
//      because explorer.exe reads only Windows paths); other Linux → xdg-open.
// A PATH lives here, so the client's Finder cannot show it. Over a live forward it goes to the client
// as {path, kind, host}, and the receiver opens it as a VS Code Remote-SSH window on THIS box (`host`
// is $SMART_OPEN_SSH_HOST — the client's own ssh alias for us, sent by ssh/config's SetEnv). When the
// client cannot do that, the path is NOT opened here either: someone attached remotely is not
// looking at this box's screen (on WSL, an unattended Windows desktop). --here opens it here anyway.
//
// The receiver must ANSWER `ok`. What else the socket can do, and what is said about it (stderr;
// a missing socket is the everyday local case and stays silent). The fall-throughs to "here" are for
// a URL; a path stops at `no answer` and `refused` instead (exit 1), for the reason above:
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
import { resolve } from "node:path";
import { cli } from "cleye";
import { z } from "zod";
import {
  ACK_MS,
  editorHost,
  fileKey,
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

const SOCKET =
  process.env.SMART_OPEN_SOCKET ?? remoteSocket(userInfo().username);
const SSH_HOST = process.env[SSH_HOST_ENV] ?? "";
const OPEN_MS = 15_000;
const isUrl = (t: string) =>
  /^[a-z][a-z0-9+.-]*:\/\//i.test(t) || /^mailto:/i.test(t);
const isWsl = (): boolean =>
  process.platform === "linux" &&
  (process.env.WSL_DISTRO_NAME !== undefined ||
    (existsSync("/proc/version") &&
      /microsoft/i.test(readFileSync("/proc/version", "utf8"))));

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
  const timer = setTimeout(
    () => finish("no-receiver", `accepted but sent no ok within ${ACK_MS} ms`),
    ACK_MS,
  );
  Bun.connect({
    unix: SOCKET,
    socket: {
      open: (s) => void s.write(`${JSON.stringify(request)}\n`),
      data: (s, chunk) => {
        reply += chunk.toString();
        if (!reply.includes("\n")) return;
        // Settle BEFORE end(): end() fires close synchronously, and close settles "no-receiver".
        finish(classify(reply));
        s.end();
      },
      close: () =>
        finish("no-receiver", "closed the connection without answering"),
      error: (_s, e) =>
        finish("no-receiver", `connection error (${e.message})`),
    },
  }).then(
    () => undefined,
    // A refused connect is a bind nobody listens on: a stale socket, not a missing receiver. Any
    // other failure to connect (EACCES on someone else's socket, ...) is said as what it was.
    (e: unknown) => {
      const withCode = ErrorCodeSchema.safeParse(e);
      const code = String(withCode.success ? (withCode.data.code ?? e) : e);
      if (/ECONNREFUSED|ENOENT/.test(code)) finish("stale");
      else finish("no-receiver", `could not connect (${code})`);
    },
  );
  return promise;
}

// SMART_OPEN_LOCAL_OPENER replaces the this-machine opener (same seam as the receiver's
// SMART_OPEN_OPENER) so tests can drive every fall-through without opening a real browser.
function localCommand(target: string): string[] {
  const override = process.env.SMART_OPEN_LOCAL_OPENER;
  if (override) return [...override.split(" "), target];
  if (process.platform === "darwin") return ["open", target];
  if (isWsl()) {
    if (isUrl(target)) return ["explorer.exe", target];
    const win = Bun.spawnSync(["wslpath", "-w", target], {
      stdout: "pipe",
      timeout: OPEN_MS,
    });
    return ["explorer.exe", win.stdout.toString().trim() || target];
  }
  return ["xdg-open", target];
}

// Where a URL goes: the client took it, this machine should, or nowhere (the client said busy).
type Route = "client" | "here" | "stop";

async function routeUrl(url: string): Promise<Route> {
  if (argv.flags.dryRun) {
    console.log(`${url} -> client if ${SOCKET} answers, else this machine`);
    return "client";
  }
  const probe = await toClient({ url });
  if (probe.outcome === "client") {
    console.log(`opened on the client: ${url}`);
    return "client";
  }
  if (probe.outcome === "busy") {
    console.error(
      `smart-open: the client is busy (${probe.reply}); not opened: ${url} — run it again, or use --here`,
    );
    return "stop";
  }
  if (probe.outcome === "stale") await dropStale(probe);
  if (probe.outcome === "no-receiver")
    console.error(
      `smart-open: ${SOCKET} ${probe.why} (is the client's receiver running?) — opening here`,
    );
  if (probe.outcome === "refused")
    console.error(
      `smart-open: the client receiver refused ${url} (${probe.reply}) — opening here`,
    );
  return "here";
}

// A dead bind means no client is attached any more: remove it (if it is still the file we probed)
// and say so. Both kinds of target then open here.
async function dropStale(probe: Probe): Promise<void> {
  const removed =
    probe.seen !== undefined && (await unlinkIfSame(SOCKET, probe.seen));
  console.error(
    `smart-open: ${SOCKET} had no listener (a dropped ssh connection?)${removed ? "; removed it" : ""} — opening here`,
  );
}

// Where a path goes. Only "no client attached" (no socket, or a dead bind) opens it here.
async function routePath(path: string): Promise<Route> {
  const editor =
    SSH_HOST === "" ? `<${SSH_HOST_ENV} unset: refused>` : editorHost(SSH_HOST);
  if (argv.flags.dryRun) {
    console.log(
      `${path} -> the client's VS Code (ssh-remote+${editor}) if ${SOCKET} answers; ${localCommand(path).join(" ")} only if no client is attached (no socket, or a dead one); otherwise not opened`,
    );
    return "client";
  }
  const kind = statSync(path).isDirectory() ? "dir" : "file";
  const probe = await toClient({ path, kind, host: SSH_HOST });
  if (probe.outcome === "client") {
    // `sent`, not `opened`: VS Code asks before opening a remote path, and a No is invisible here.
    console.log(`sent to the client's VS Code (ssh-remote+${editor}): ${path}`);
    return "client";
  }
  if (probe.outcome === "no-socket") return "here";
  if (probe.outcome === "stale") {
    await dropStale(probe);
    return "here";
  }
  const why = probe.outcome === "no-receiver" ? probe.why : probe.reply;
  console.error(
    `smart-open: attached from a client, but it did not open ${path} (${why})${refusalHint(probe.reply)}. Not opened on this machine's screen either, which nobody attached remotely can see — use --here for that.`,
  );
  return "stop";
}

// The one repair step a known refusal implies, or nothing.
function refusalHint(reply: string): string {
  // A receiver from before path requests answers the URL-only refusal; restarting it loads this one.
  if (reply.includes("only http(s) URLs"))
    return " — the client's receiver predates folder support; on the Mac: launchctl kickstart -k gui/$(id -u)/dotfiles.smart-open-receiver";
  if (reply.includes("without the smart-open forward"))
    return " — on the Mac, give ~/.ssh/config.local's Host line for this box the -code alias too (e.g. `Host r99-wsl r99-wsl-code`)";
  if (reply.includes(SSH_HOST_ENV))
    return " — ssh/config sends it with SetEnv on attach; a herdr server started before that keeps its old environment, so restart it";
  return "";
}

// This machine. Returns false on failure.
function openHere(target: string): boolean {
  const cmd = localCommand(target);
  if (argv.flags.dryRun) {
    console.log(`${target} -> ${cmd.join(" ")}`);
    return true;
  }
  const p = Bun.spawnSync(cmd, {
    stdout: "ignore",
    stderr: "pipe",
    timeout: OPEN_MS,
  });
  // explorer.exe exits 1 even when it opened the target; only a spawn failure means anything there.
  if (cmd[0] === "explorer.exe" || p.exitCode === 0) return true;
  console.error(
    `smart-open: ${cmd.join(" ")} failed: ${p.stderr.toString().trim()}`,
  );
  return false;
}

async function openOne(raw: string): Promise<boolean> {
  if (isUrl(raw)) {
    const route = argv.flags.here ? "here" : await routeUrl(raw);
    if (route === "stop") return false;
    return route === "client" || openHere(raw);
  }
  const path = resolve(raw);
  if (!existsSync(path)) {
    console.error(`smart-open: no such file or directory: ${raw}`);
    return false;
  }
  const route = argv.flags.here ? "here" : await routePath(path);
  if (route === "stop") return false;
  return route === "client" || openHere(path);
}

const targets = argv._.targets.length > 0 ? argv._.targets : ["."];
let failed = 0;
for (const raw of targets) if (!(await openOne(raw))) failed += 1;
process.exit(failed === 0 ? 0 : 1);
