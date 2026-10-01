#!/usr/bin/env bun
// smart-open — open a URL or path on the screen the human is actually looking at.
// Consumer: zsh `o` / `oo` / `open` (WSL), git `o`, jj `o`. One implementation; those are views.
//
// WHERE IT OPENS, in order (first that succeeds wins):
//   1. URL + a live client receiver  → the CLIENT machine. When you drive this box from a Mac over
//      `ssh` / `herdr --remote`, ssh/config's RemoteForward exposes the Mac's receiver
//      (open/receive.ts) here as /tmp/smart-open-$USER.sock. Opening "here" would put the page on a
//      screen nobody is in front of — that was the old WSL `o` (explorer.exe, always).
//   2. this machine: macOS `open`; WSL → explorer.exe (a path converted by `wslpath -w` first,
//      because explorer.exe reads only Windows paths); other Linux → xdg-open.
// A PATH never goes to the client: the file lives here, the client cannot see it.
//
// The receiver must ANSWER `ok`. A socket that accepts but never answers is a forward whose Mac
// side has no receiver running → fall through. A socket nobody listens on (ECONNREFUSED) is a
// stale bind left by a dropped connection; sshd will not re-bind over it (StreamLocalBindUnlink
// defaults to no), so it is removed here and the next connection can forward again.
import { existsSync, lstatSync, readFileSync, unlinkSync } from "node:fs";
import { userInfo } from "node:os";
import { resolve } from "node:path";
import { cli } from "cleye";

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
  process.env.SMART_OPEN_SOCKET ??
  `/tmp/smart-open-${userInfo().username}.sock`;
const ACK_MS = 2_000;
const OPEN_MS = 15_000;
const isUrl = (t: string) =>
  /^[a-z][a-z0-9+.-]*:\/\//i.test(t) || /^mailto:/i.test(t);
const isWsl = (): boolean =>
  process.platform === "linux" &&
  (process.env.WSL_DISTRO_NAME !== undefined ||
    (existsSync("/proc/version") &&
      /microsoft/i.test(readFileSync("/proc/version", "utf8"))));

type Outcome = "client" | "no-socket" | "stale" | "no-receiver" | "refused";

// One line out, one line back. Resolves to the outcome; never throws.
function toClient(url: string): Promise<Outcome> {
  if (!existsSync(SOCKET) || !lstatSync(SOCKET).isSocket())
    return Promise.resolve("no-socket");
  const { promise, resolve: done } = Promise.withResolvers<Outcome>();
  let reply = "";
  const timer = setTimeout(() => done("no-receiver"), ACK_MS);
  const finish = (o: Outcome) => {
    clearTimeout(timer);
    done(o);
  };
  Bun.connect({
    unix: SOCKET,
    socket: {
      open: (s) => void s.write(`${JSON.stringify({ url })}\n`),
      data: (s, chunk) => {
        reply += chunk.toString();
        if (!reply.includes("\n")) return;
        // Settle BEFORE end(): end() fires close synchronously, and close settles "no-receiver".
        finish(reply.startsWith("ok") ? "client" : "refused");
        s.end();
      },
      close: () => finish("no-receiver"),
    },
  }).then(
    () => undefined,
    // A refused connect is a bind nobody listens on: a stale socket, not a missing receiver.
    (e: unknown) => {
      const code = String((e as { code?: unknown } | null)?.code ?? e);
      finish(/ECONNREFUSED|ENOENT/.test(code) ? "stale" : "no-receiver");
    },
  );
  return promise;
}

function localCommand(target: string): string[] {
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

// URL → the client when it answers. Returns true when the client took it.
async function triedClient(url: string): Promise<boolean> {
  if (argv.flags.dryRun) {
    console.log(`${url} -> client if ${SOCKET} answers, else this machine`);
    return true;
  }
  const outcome = await toClient(url);
  if (outcome === "client") console.log(`opened on the client: ${url}`);
  if (outcome === "stale") unlinkSync(SOCKET); // dead bind: let the next ssh connection forward
  if (outcome === "refused")
    console.error(`smart-open: the client receiver refused ${url}`);
  return outcome === "client";
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
  if (isUrl(raw))
    return (!argv.flags.here && (await triedClient(raw))) || openHere(raw);
  const path = resolve(raw);
  if (existsSync(path)) return openHere(path);
  console.error(`smart-open: no such file or directory: ${raw}`);
  return false;
}

const targets = argv._.targets.length > 0 ? argv._.targets : ["."];
let failed = 0;
for (const raw of targets) if (!(await openOne(raw))) failed += 1;
process.exit(failed === 0 ? 0 : 1);
