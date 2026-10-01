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
// A PATH never goes to the client: the file lives here, the client cannot see it.
//
// The receiver must ANSWER `ok`. What else the socket can do, and what is said about it (stderr;
// a missing socket is the everyday local case and stays silent):
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
import { existsSync, readFileSync } from "node:fs";
import { userInfo } from "node:os";
import { resolve } from "node:path";
import { cli } from "cleye";
import {
  ACK_MS,
  fileKey,
  remoteSocket,
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

// One line out, one line back. Resolves to the outcome; never throws.
function toClient(url: string): Promise<Probe> {
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
      open: (s) => void s.write(`${JSON.stringify({ url })}\n`),
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
      const code = String((e as { code?: unknown } | null)?.code ?? e);
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
  const probe = await toClient(url);
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
  if (probe.outcome === "stale") {
    const removed =
      probe.seen !== undefined && (await unlinkIfSame(SOCKET, probe.seen));
    console.error(
      `smart-open: ${SOCKET} had no listener (a dropped ssh connection?)${removed ? "; removed it" : ""} — opening here`,
    );
  }
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
  if (existsSync(path)) return openHere(path);
  console.error(`smart-open: no such file or directory: ${raw}`);
  return false;
}

const targets = argv._.targets.length > 0 ? argv._.targets : ["."];
let failed = 0;
for (const raw of targets) if (!(await openOne(raw))) failed += 1;
process.exit(failed === 0 ? 0 : 1);
