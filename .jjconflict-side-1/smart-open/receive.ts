// smart-open receiver — runs on the machine you sit at (the Mac), opens what a remote
// `smart-open` sends it. Started at login by smart-open/smart-open-receiver.plist.mac (launchd).
// ssh/config forwards the remote /tmp/smart-open-$USER.sock to this socket, so it is reachable
// only through your own ssh connections; the socket file itself is owner-only.
//
// Protocol: one JSON line {"url": "..."} in, one line out:
//   ok                  the URL was handed to the opener, which exited 0 — or was still starting
//                       after --settle-ms (a cold-starting app: it launched, so say so)
//   refused: <why>      this request will never be opened (not http(s), too long, opener failed)
//   busy: <why>         a limit below was hit; the same request may succeed later
// Only http(s) URLs are opened — anything that can write to the forwarded socket can reach this,
// and a file:// or app-scheme URL would let a remote process drive local apps.
//
// BOUNDS. That socket is reachable by EVERY process of your user on the remote — AI agents
// included — and the owner-only mode does not separate them. So what they can make this Mac do is
// limited here instead of trusted away. The numbers are design choices, not derived: a person opens
// a handful of URLs at once, and nothing a person does needs more than the defaults.
//   line length      4096 characters                           refused: too long
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
// A request that is not a valid http(s) URL costs no token. Limit hits are logged to stderr, at
// most one summary line per REPORT_MS, never with the URL (the log is world-readable).
//
// WHAT THIS CANNOT DO: tell you from an agent running as you. A process that spends the bucket or
// holds the connection slots makes YOUR `o` answer `busy` too (the client says so and suggests
// --here). The limits protect the screen you sit at, not the availability of `o`.
import { chmodSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { cli } from "cleye";
import { z } from "zod";
import { attempt, attemptOr } from "../agents/hooks/attempt.ts";
import { ACK_MS, receiverSocket, SETTLE_MS } from "./sockets.ts";

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
        "Listen for smart-open requests forwarded over ssh and open http(s) URLs here.",
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
async function runOpener(url: string): Promise<string> {
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
    Bun.sleep(settleMs).then(() => undefined),
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

const RequestSchema = z.object({ url: z.string() });

async function handle(line: string): Promise<string> {
  if (line.length > MAX_LINE) return "refused: too long";
  const raw = await attemptOr((): unknown => JSON.parse(line), null);
  const msg = RequestSchema.safeParse(raw);
  const url = msg.success ? msg.data.url : "";
  if (!/^https?:\/\/[^\s]+$/i.test(url)) return "refused: only http(s) URLs";
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
      void handle(buf.slice(0, nl)).then((reply) => s.end(`${reply}\n`));
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
