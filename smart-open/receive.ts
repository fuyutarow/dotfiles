// smart-open receiver — runs on the machine you sit at (the Mac), opens what a remote
// `smart-open` sends it. Started at login by smart-open/smart-open-receiver.plist.mac (launchd).
// ssh/config forwards the remote /tmp/smart-open-$USER--<alias>.sock to this socket, so it is reachable
// only through your own ssh connections; the socket file itself is owner-only.
//
// Protocol: one JSON line in — {"url": "..."} or {"path": "/abs", "kind": "file"|"dir", "host":
// "<ssh alias>"} — one line out:
//   ok                  the URL was handed to the opener, which exited 0 — or was still starting
//                       after --settle-ms (a cold-starting app: it launched, so say so). For a
//                       path that means VS Code got the URL; VS Code then asks before opening a
//                       remote path (security.promptForRemoteFileProtocolHandling), and a No there
//                       is invisible to this receiver
//   refused: <why>      this request will never be opened (not http(s), too long, opener failed,
//                       a malformed path or host, a host ssh does not vouch for)
//   busy: <why>         a limit below was hit; the same request may succeed later
// Only http(s) URLs are opened — anything that can write to the forwarded socket can reach this,
// and a file:// or app-scheme URL would let a remote process drive local apps.
//
// A PATH lives on the remote, so Finder cannot show it; it opens as a VS Code Remote-SSH window on
// that box instead (vscode://vscode-remote/ssh-remote+<host>-code<path>, `:1` appended for a file,
// since VS Code reads every other path as a folder). That is the one non-http scheme, and this
// receiver BUILDS it — the remote sends a path and a host, never a URL. Both aliases are vouched by
// `ssh -G` (resolve without connecting):
//   <host>        must forward smart-open to THIS socket — a box you deliberately attach from, so a
//                 remote process cannot point your editor at an arbitrary ssh server
//   <host>-code   (sockets.ts, editorHost) must reach the same hostname/port/user WITHOUT that
//                 forward. VS Code's own ssh connection would otherwise request it too, take the
//                 socket over (sshd StreamLocalBindUnlink: newest wins) and leave a dead bind when
//                 its window closes — and the next `o` in the still-attached terminal would open on
//                 the remote's own screen.
// What the editor then runs is VS Code's business (remote-path prompt, Workspace Trust).
//
// BOUNDS. That socket is reachable by EVERY process of your user on the remote — AI agents
// included — and the owner-only mode does not separate them. So what they can make this Mac do is
// limited here instead of trusted away. The numbers are design choices, not derived: a person opens
// a handful of URLs at once, and nothing a person does needs more than the defaults.
//   line length      4096 characters                           refused: too long
//   path requests    same bucket; the token is taken BEFORE the `ssh -G` vouch, so a flood of
//                    well-formed paths spawns at most 2 x burst ssh processes. The vouch counts
//                    against --settle-ms: the answer still lands inside the client's ACK_MS
//   opens            token bucket: --burst up front, one more
//                    every --refill-ms                         busy: rate limit
//   in-flight        each open also leaves the bucket, so openers running at once are at most
//                    burst + open-timeout/refill (17 with the defaults)
//   connections      --max-connections held at once            busy: too many connections
//   waiting          --idle-ms for the WHOLE request line      refused: idle timeout
//   opener runtime   --open-timeout-ms, then SIGKILL           refused: opener timed out (if still
//                    before --settle-ms; after an `ok` it is only logged)
//   answer time      --settle-ms, kept below the client's ACK_MS (sockets.ts): an answer that lands
//                    after the client gave up would open the URL here AND on the client — twice
// A request that is not a valid http(s) URL, or a malformed path request, costs no token. Limit hits are logged to stderr, at
// most one summary line per REPORT_MS, never with the URL (the log is world-readable).
//
// WHAT THIS CANNOT DO: tell you from an agent running as you. A process that spends the bucket or
// holds the connection slots makes YOUR `o` answer `busy` too (the client says so and suggests
// --here). The limits protect the screen you sit at, not the availability of `o`.
import { chmodSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { cli } from "cleye";
import { attempt } from "../agents/hooks/attempt.ts";
import { jsonOf, z } from "../agents/hooks/zod.ts";
import { ACK_MS, editorHost, receiverSocket, SETTLE_MS } from "./sockets.ts";

const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") {
    console.error(`receive: unknown option '--${flag}'`);
    process.exit(2);
  }
};
const argv = cli(
  {
    name: "receive",
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    parameters: [],
    help: {
      description:
        "Listen for smart-open requests forwarded over ssh: open http(s) URLs here, and remote paths as VS Code Remote-SSH windows.",
    },
    flags: {
      socket: {
        type: String,
        default: receiverSocket(homedir()),
        description: "unix socket to listen on",
      },
      burst: {
        type: Number,
        default: 10,
        description: "opens allowed back to back before the rate limit bites",
      },
      refillMs: {
        type: Number,
        default: 2_000,
        description:
          "milliseconds to earn one more open once the burst is spent",
      },
      maxConnections: {
        type: Number,
        default: 64,
        description: "connections held at once; further ones are told busy",
      },
      idleMs: {
        type: Number,
        default: 5_000,
        description:
          "milliseconds a connection has to deliver its whole request line",
      },
      openTimeoutMs: {
        type: Number,
        default: 15_000,
        description: "milliseconds an opener may run before it is killed",
      },
      sshConfig: {
        type: String,
        description:
          "ssh config file `ssh -G` reads to vouch for a path request's host (default: ssh's own)",
      },
      settleMs: {
        type: Number,
        default: SETTLE_MS,
        description: `milliseconds to wait for the opener before answering ok anyway (must be below the client's ${ACK_MS} ms patience)`,
      },
    },
  },
  undefined,
  Bun.argv.slice(2),
);
// Cleye leaves stray positionals in `_`; this command takes none.
if (argv._.length > 0) {
  console.error(
    `receive: unexpected argument: ${argv._[0]} (this command takes no positionals)`,
  );
  process.exit(2);
}

// 2^31-1 is the largest delay setTimeout honours; a bigger one fires after ~1 ms, which would turn
// "wait a long time" into "do not wait at all".
const MAX_FLAG = 2_147_483_647;
const positive = (name: string, v: number): number => {
  if (Number.isInteger(v) && v >= 1 && v <= MAX_FLAG) return v;
  console.error(
    `receive: --${name} must be an integer from 1 to ${MAX_FLAG}, got ${v}`,
  );
  return process.exit(2);
};
const burst = positive("burst", argv.flags.burst);
const refillMs = positive("refill-ms", argv.flags.refillMs);
const maxConnections = positive("max-connections", argv.flags.maxConnections);
const idleMs = positive("idle-ms", argv.flags.idleMs);
const openTimeoutMs = positive("open-timeout-ms", argv.flags.openTimeoutMs);
const settleMs = positive("settle-ms", argv.flags.settleMs);
if (settleMs >= ACK_MS) {
  console.error(
    `receive: --settle-ms must be below ${ACK_MS} (the client's ack patience, smart-open/sockets.ts), got ${settleMs}`,
  );
  process.exit(2);
}

const OPENER = (process.env.SMART_OPEN_OPENER ?? "open").split(" ");
const SSH_CONFIG = argv.flags.sshConfig;
const MAX_LINE = 4096;
const REPORT_MS = 10_000;
const sock = argv.flags.socket;
mkdirSync(dirname(sock), { recursive: true, mode: 0o700 });
if (existsSync(sock)) unlinkSync(sock); // our own path; a previous run's bind

// Token bucket on the monotonic clock. Time spent FULL earns nothing, so a long quiet spell
// cannot be cashed in as more than `burst` opens.
function makeBucket(): () => boolean {
  let tokens = burst;
  let stamp = performance.now();
  return () => {
    const now = performance.now();
    const earned = Math.floor((now - stamp) / refillMs);
    if (earned > 0) {
      tokens = Math.min(burst, tokens + earned);
      stamp = tokens >= burst ? now : stamp + earned * refillMs;
    }
    if (tokens >= burst) stamp = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}
const takeToken = makeBucket();

const anomalies = new Map<string, number>();
let lastReport = Number.NEGATIVE_INFINITY;
function note(kind: string): void {
  anomalies.set(kind, (anomalies.get(kind) ?? 0) + 1);
  const now = performance.now();
  if (now - lastReport < REPORT_MS) return;
  lastReport = now;
  const summary = [...anomalies].map(([k, n]) => `${k} x${n}`).join(", ");
  anomalies.clear();
  console.error(`${Temporal.Now.instant().toString()} receive: ${summary}`);
}

// The opener runs asynchronously, so one slow `open` never holds up the next request; a spawn
// failure (missing binary, out of descriptors) is an operational error answered on the wire,
// not an exception that takes the receiver down with it.
//
// The answer is decided by what the opener did within settleMs: it finished (its exit code
// decides) or it is still running (a cold-starting app — it launched, answer ok and supervise it
// in the background). The exit CODE, not "the timeout fired", says whether it failed: an opener
// that exits 0 at the instant the timer fires did open the URL. SIGKILL because a helper that
// ignores SIGTERM would otherwise live on, holding whatever it holds, forever.
async function runOpener(url: string, settle = settleMs): Promise<string> {
  const timeout = AbortSignal.timeout(openTimeoutMs);
  const spawned = await attempt(() =>
    Bun.spawn([...OPENER, url], {
      stdout: "ignore",
      stderr: "ignore",
      signal: timeout,
      killSignal: "SIGKILL",
    }),
  );
  if (!spawned.ok) {
    note("opener unavailable");
    return "refused: opener unavailable";
  }
  const proc = spawned.value;
  const early = await Promise.race([
    proc.exited,
    Bun.sleep(settle).then(() => {}),
  ]);
  if (early === undefined) {
    void proc.exited.then((code) => {
      if (code !== 0) note("opener failed after ok");
    });
    return "ok";
  }
  if (early === 0) return "ok";
  if (timeout.aborted) {
    note("opener timed out");
    return "refused: opener timed out";
  }
  return `refused: opener exited ${early}`;
}

// A Host alias as ssh/config spells one. Leading alnum, so it can never be read as an ssh option.
const HOST = /^[A-Za-z0-9][A-Za-z0-9._-]{0,252}$/u;

// What `ssh -G` RESOLVES an alias to: asking ssh keeps ssh/config the one place that says which
// boxes may open folders here — a parse of our own would drift from ssh's Include/Match rules.
type Resolved = {
  target: string; // hostname:port as user — the box a connection would actually reach
  forwardsHere: boolean; // carries a RemoteForward onto this receiver's socket
};
async function sshResolve(
  host: string,
  ms: number,
): Promise<Resolved | undefined> {
  const cmd = [
    "ssh",
    "-G",
    ...(SSH_CONFIG !== undefined && SSH_CONFIG !== ""
      ? ["-F", SSH_CONFIG]
      : []),
    host,
  ];
  const spawned = await attempt(() =>
    Bun.spawn(cmd, {
      stdout: "pipe",
      stderr: "ignore",
      signal: AbortSignal.timeout(ms),
      killSignal: "SIGKILL",
    }),
  );
  if (!spawned.ok) return undefined;
  const [out, code] = await Promise.all([
    new Response(spawned.value.stdout).text(),
    spawned.value.exited,
  ]);
  if (code !== 0) return undefined;
  const lines = out.split("\n").map((l) => l.trim());
  const value = (key: string) =>
    lines.find((l) => l.startsWith(`${key} `))?.slice(key.length + 1);
  return {
    target: `${value("hostname")}:${value("port")} as ${value("user")}`,
    forwardsHere: lines.some(
      (l) => l.startsWith("remoteforward ") && l.endsWith(` ${sock}`),
    ),
  };
}

// The remote path as a VS Code Remote-SSH URL. Each segment is percent-encoded, so a space, `#`
// or `?` in a name stays part of the path; a file gets `:1` (open at line 1), the only suffix VS
// Code's protocol handler reads as "a file, not a folder".
const editorUrl = (host: string, path: string, kind: string): string =>
  `vscode://vscode-remote/ssh-remote+${host}${path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}${kind === "file" ? ":1" : ""}`;

// Everything checkable without a token or a process. null = well-formed.
function malformedPath(
  path: unknown,
  kind: unknown,
  host: unknown,
): string | null {
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    !path.isWellFormed() ||
    // A control character (C0 or DEL) by UTF-16 code unit; none is a surrogate half.
    Array.from(
      { length: path.length },
      (_, i) => path.codePointAt(i) ?? 0,
    ).some((c) => c < 0x20 || c === 0x7f)
  )
    return "refused: path must be absolute";
  if (kind !== "file" && kind !== "dir")
    return "refused: kind must be file or dir";
  // VS Code would read the trailing :<digits> as a line number and open a file instead.
  if (kind === "dir" && /:\d+$/u.test(path))
    return "refused: a folder whose name ends in :<digits> cannot be opened by URL";
  if (typeof host !== "string" || host === "")
    return "refused: no ssh host (the remote's forward names no client alias)";
  if (!HOST.test(editorHost(host))) return "refused: not an ssh host alias";
  return null;
}

async function handlePath(
  path: unknown,
  kind: unknown,
  host: unknown,
): Promise<string> {
  const bad = malformedPath(path, kind, host);
  if (bad !== null) return bad;
  // Narrowed by malformedPath; restated for the type checker.
  const [p, k, h] = [String(path), String(kind), String(host)];
  if (!takeToken()) {
    note("rate limit");
    return "busy: rate limit";
  }
  const start = performance.now();
  const editor = editorHost(h);
  const [attach, code] = await Promise.all([
    sshResolve(h, settleMs),
    sshResolve(editor, settleMs),
  ]);
  if (attach?.forwardsHere !== true) {
    note("unvouched host");
    return `refused: ${h} does not forward smart-open to this receiver`;
  }
  if (
    code === undefined ||
    code.forwardsHere ||
    code.target !== attach.target
  ) {
    note("no editor alias");
    return `refused: ${editor} must reach the same box as ${h} without the smart-open forward (ssh/config)`;
  }
  const left = Math.floor(settleMs - (performance.now() - start));
  if (left < 1) {
    note("vouch too slow");
    return "refused: ssh -G took the whole answer window";
  }
  return runOpener(editorUrl(editor, p, k), left);
}

// A request line is a JSON object; which keys it has says what it asks for. Anything else (not
// JSON, an array, a scalar) is "no keys", which falls through to the URL refusal below.
const MessageSchema = z.record(z.string(), z.unknown());

async function handle(line: string): Promise<string> {
  if (line.length > MAX_LINE) return "refused: too long";
  const checked = jsonOf(MessageSchema).safeParse(line);
  const msg = checked.success ? checked.data : undefined;
  if (msg !== undefined && Object.hasOwn(msg, "path"))
    return handlePath(msg["path"], msg["kind"], msg["host"]);
  const rawUrl = msg?.["url"];
  const url = typeof rawUrl === "string" ? rawUrl : "";
  if (!/^https?:\/\/[^\s]+$/iu.test(url)) return "refused: only http(s) URLs";
  if (!takeToken()) {
    note("rate limit");
    return "busy: rate limit";
  }
  return runOpener(url);
}

type Conn = {
  buf: string;
  // One decoder per connection, in streaming mode: a multi-byte character split across two
  // chunks must reach the URL intact, not as two U+FFFD.
  decoder: TextDecoder;
  counted: boolean; // holds one of the maxConnections slots
  done: boolean; // its one request line has been taken; anything after is ignored
  timer: ReturnType<typeof setTimeout> | undefined;
};
let active = 0;

// `end()` here closes the connection outright even when the peer keeps its side open (measured on
// Bun 1.4.2, and pinned by the "peer that never closes" tests): that is what lets `close` below
// release the slot of a peer that will not hang up.
Bun.listen<Conn>({
  unix: sock,
  socket: {
    open(s) {
      s.data = {
        buf: "",
        decoder: new TextDecoder(),
        counted: false,
        done: false,
        timer: undefined,
      };
      if (active >= maxConnections) {
        note("too many connections");
        s.end("busy: too many connections\n");
        return;
      }
      active += 1;
      s.data.counted = true;
      s.data.timer = setTimeout(() => {
        note("idle timeout");
        s.data.done = true;
        s.end("refused: idle timeout\n");
      }, idleMs);
    },
    data(s, chunk) {
      if (!s.data.counted || s.data.done) return;
      const buf = `${s.data.buf}${s.data.decoder.decode(chunk, { stream: true })}`;
      const nl = buf.indexOf("\n");
      if (nl < 0 && buf.length > MAX_LINE) {
        s.data.done = true;
        clearTimeout(s.data.timer);
        s.end("refused: too long\n");
        return;
      }
      if (nl < 0) {
        s.data.buf = buf;
        return;
      }
      s.data.done = true;
      clearTimeout(s.data.timer);
      // No request may take the listener down: a throw anywhere in handling is one refusal.
      void handle(buf.slice(0, nl))
        .catch(() => {
          note("handler error");
          return "refused: internal error";
        })
        .then((reply) => s.end(`${reply}\n`));
    },
    close(s) {
      clearTimeout(s.data.timer);
      if (!s.data.counted) return;
      s.data.counted = false;
      active -= 1;
    },
  },
});
chmodSync(sock, 0o600);
console.log(`receive: listening on ${sock}`);
