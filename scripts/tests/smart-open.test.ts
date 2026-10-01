// bun test for smart-open/ — the receiver (smart-open/receive.ts) and the smart-open client (smart-open/smart-open.ts),
// spawned as real processes against a throwaway socket and a fake opener that only appends to a
// log. Nothing here opens a browser: the receiver's opener is SMART_OPEN_OPENER and the client's
// this-machine opener is SMART_OPEN_LOCAL_OPENER, both pointed at the same recording script.
//
// The wire contract under test (smart-open/receive.ts header): one JSON line {"url": ...} in, one line
// out — `ok` or `refused: <why>`. Each refusal case is paired with its accepting twin so a gate
// that always refuses, or always accepts, is caught.
import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { attempt } from "../../agents/hooks/attempt.ts";
import {
  ACK_MS,
  fileKey,
  SETTLE_MS,
  unlinkIfSame,
} from "../../smart-open/sockets.ts";

const REPO = join(import.meta.dir, "..", "..");
const RECEIVE = join(REPO, "smart-open", "receive.ts");
const SMART_OPEN = join(REPO, "smart-open", "smart-open.ts");

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

// Short on purpose: a unix socket path is limited to ~104 bytes on macOS.
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "so-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/**
 * A recording opener: appends its last argument to <dir>/<name>.log, then (optionally) lingers for
 * `lingerSeconds` like a slow `open`. Returns [script, readLog].
 */
function recorder(
  dir: string,
  name: string,
  lingerSeconds = 0,
  ignoreTerm = false,
): [string, () => string[]] {
  const script = join(dir, `${name}.sh`);
  const log = join(dir, `${name}.log`);
  // `exec`: the sleeper replaces the shell, so killing the opener kills the sleep too.
  const linger = lingerSeconds > 0 ? `exec sleep ${lingerSeconds}\n` : "";
  // The pid is written first, and `exec` keeps it: it is the pid of the process the receiver spawned.
  // `trap '' TERM` is inherited across exec: a helper that shrugs off SIGTERM, to tell SIGKILL apart.
  const trap = ignoreTerm ? "trap '' TERM\n" : "";
  writeFileSync(
    script,
    `#!/bin/sh\n${trap}echo $$ > "${join(dir, `${name}.pid`)}"\nprintf '%s\\n' "$1" >> "${log}"\n${linger}`,
  );
  chmodSync(script, 0o755);
  const read = () =>
    existsSync(log)
      ? readFileSync(log, "utf8").split("\n").filter(Boolean)
      : [];
  return [script, read];
}

type Receiver = { sock: string; opened: () => string[] };

async function startReceiver(
  dir: string,
  opts: { args?: string[]; opener?: string } = {},
): Promise<Receiver> {
  const sock = join(dir, "r.sock");
  const [script, opened] = recorder(dir, "receiver-opened");
  const proc = Bun.spawn(
    ["bun", RECEIVE, "--socket", sock, ...(opts.args ?? [])],
    {
      env: { ...process.env, SMART_OPEN_OPENER: opts.opener ?? script },
      stdout: "ignore",
      stderr: "ignore",
    },
  );
  cleanups.push(() => proc.kill());
  for (let i = 0; i < 200 && !existsSync(sock); i++) await Bun.sleep(25);
  expect(existsSync(sock)).toBe(true);
  return { sock, opened };
}

type Answer = { reply: string; closedByPeer: boolean };

/** One request on a fresh connection: write `payload`, resolve at the first newline or close. */
function ask(sock: string, payload: string, waitMs = 5_000): Promise<Answer> {
  return new Promise((resolve) => {
    let reply = "";
    let done = false;
    const finish = (closedByPeer: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ reply: reply.trim(), closedByPeer });
    };
    const timer = setTimeout(() => finish(false), waitMs);
    Bun.connect({
      unix: sock,
      socket: {
        open: (s) => void s.write(payload),
        data: (s, chunk) => {
          reply += chunk.toString();
          if (reply.includes("\n")) {
            finish(true);
            s.end();
          }
        },
        close: () => finish(true),
        error: () => finish(true),
      },
    }).catch(() => finish(false));
  });
}

const line = (url: unknown) => `${JSON.stringify({ url })}\n`;

/** Hold a connection open without sending anything; returns the closer. */
async function hold(sock: string): Promise<() => void> {
  const conn = await Bun.connect({
    unix: sock,
    socket: { data() {}, open() {}, close() {}, error() {} },
  });
  return () => conn.end();
}

/** A listener that accepts and never answers — a forward whose Mac side has no receiver behind it. */
async function silentListener(sock: string): Promise<void> {
  const proc = Bun.spawn(
    [
      "bun",
      "-e",
      `Bun.listen({ unix: ${JSON.stringify(sock)}, socket: { data() {} } }); setInterval(() => {}, 1000);`,
    ],
    { stdout: "ignore", stderr: "ignore" },
  );
  cleanups.push(() => proc.kill());
  for (let i = 0; i < 200 && !existsSync(sock); i++) await Bun.sleep(25);
  expect(existsSync(sock)).toBe(true);
}

type Run = { code: number; out: string; err: string };
function client(args: string[], env: Record<string, string | undefined>): Run {
  const merged: Record<string, string | undefined> = { ...process.env, ...env };
  for (const k of Object.keys(merged))
    if (merged[k] === undefined) delete merged[k];
  const p = Bun.spawnSync(["bun", SMART_OPEN, ...args], {
    env: merged as Record<string, string>,
    timeout: 20_000,
  });
  return {
    code: p.exitCode ?? -1,
    out: p.stdout.toString(),
    err: p.stderr.toString(),
  };
}

describe("receiver wire protocol", () => {
  test("accepts http and https (scheme is case-insensitive) and hands the URL to the opener", async () => {
    const rx = await startReceiver(scratch());
    for (const url of [
      "http://probe.invalid/a",
      "https://probe.invalid/b?q=1#f",
      "HTTPS://probe.invalid/c",
    ]) {
      expect((await ask(rx.sock, line(url))).reply).toBe("ok");
    }
    expect(rx.opened()).toEqual([
      "http://probe.invalid/a",
      "https://probe.invalid/b?q=1#f",
      "HTTPS://probe.invalid/c",
    ]);
  });

  test.each([
    ["file scheme", line("file:///etc/passwd")],
    ["app-launch scheme", line("x-apple.systempreferences:")],
    ["javascript scheme", line("javascript:alert(1)")],
    ["whitespace inside the url", line("https://a b")],
    ["escaped newline inside the url", line("https://a\nb")],
    ["url is not a string", line(42)],
    ["no url key", `${JSON.stringify({ href: "https://a" })}\n`],
    ["not json", "hello\n"],
    ["empty line", "\n"],
  ])("refuses %s and never runs the opener", async (_name, payload) => {
    const rx = await startReceiver(scratch());
    expect((await ask(rx.sock, payload)).reply).toBe(
      "refused: only http(s) URLs",
    );
    expect(rx.opened()).toEqual([]);
  });

  test("refuses an over-long line, with or without a newline, and closes", async () => {
    const rx = await startReceiver(scratch());
    const noNewline = await ask(rx.sock, "a".repeat(5_000));
    expect(noNewline).toEqual({
      reply: "refused: too long",
      closedByPeer: true,
    });
    const withNewline = await ask(
      rx.sock,
      line(`https://probe.invalid/${"a".repeat(5_000)}`),
    );
    expect(withNewline.reply).toBe("refused: too long");
    expect(rx.opened()).toEqual([]);
  });

  test("answers only the first line of a pipelined write", async () => {
    const rx = await startReceiver(scratch());
    const a = await ask(
      rx.sock,
      line("https://probe.invalid/one") + line("https://probe.invalid/two"),
    );
    expect(a.reply).toBe("ok");
    await Bun.sleep(150);
    expect(rx.opened()).toEqual(["https://probe.invalid/one"]);
  });

  test("a failing opener is reported as a refusal, and the receiver keeps serving", async () => {
    const rx = await startReceiver(scratch(), { opener: "false" });
    expect((await ask(rx.sock, line("https://probe.invalid/x"))).reply).toBe(
      "refused: opener exited 1",
    );
    expect((await ask(rx.sock, line("https://probe.invalid/y"))).reply).toBe(
      "refused: opener exited 1",
    );
  });
});

describe("socket defaults", () => {
  test("smart-open looks for /tmp/smart-open-<user>.sock unless SMART_OPEN_SOCKET says otherwise", () => {
    const base = { SMART_OPEN_SOCKET: undefined };
    const r = client(["--dry-run", "https://probe.invalid/"], base);
    expect(r.out).toContain(`/tmp/smart-open-${userInfo().username}.sock`);
    const o = client(["--dry-run", "https://probe.invalid/"], {
      SMART_OPEN_SOCKET: "/tmp/elsewhere.sock",
    });
    expect(o.out).toContain("/tmp/elsewhere.sock");
    expect(o.out).not.toContain("smart-open-");
  });

  test("the receiver listens on $HOME/.cache/smart-open/receiver.sock by default", () => {
    const home = scratch();
    const p = Bun.spawnSync(["bun", RECEIVE, "--help"], {
      env: { ...process.env, HOME: home },
      timeout: 20_000,
    });
    expect(p.stdout.toString()).toContain(
      join(home, ".cache/smart-open/receiver.sock"),
    );
    expect(home).not.toBe(homedir());
  });
});

describe("client routing", () => {
  test("a URL goes to the client when its receiver answers ok, and not to this machine", async () => {
    const dir = scratch();
    const rx = await startReceiver(dir);
    const [local, localOpened] = recorder(dir, "local-opened");
    const r = client(["https://probe.invalid/routed"], {
      SMART_OPEN_SOCKET: rx.sock,
      SMART_OPEN_LOCAL_OPENER: local,
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain(
      "opened on the client: https://probe.invalid/routed",
    );
    expect(rx.opened()).toEqual(["https://probe.invalid/routed"]);
    expect(localOpened()).toEqual([]);
  });

  test("--here never touches the client", async () => {
    const dir = scratch();
    const rx = await startReceiver(dir);
    const [local, localOpened] = recorder(dir, "local-opened");
    const r = client(["--here", "https://probe.invalid/here"], {
      SMART_OPEN_SOCKET: rx.sock,
      SMART_OPEN_LOCAL_OPENER: local,
    });
    expect(r.code).toBe(0);
    expect(rx.opened()).toEqual([]);
    expect(localOpened()).toEqual(["https://probe.invalid/here"]);
  });

  test("with no socket at all the URL opens here, quietly", () => {
    const dir = scratch();
    const [local, localOpened] = recorder(dir, "local-opened");
    const r = client(["https://probe.invalid/alone"], {
      SMART_OPEN_SOCKET: join(dir, "absent.sock"),
      SMART_OPEN_LOCAL_OPENER: local,
    });
    expect(r.code).toBe(0);
    expect(localOpened()).toEqual(["https://probe.invalid/alone"]);
    expect(r.out + r.err).toBe("");
  });

  test("a scheme the receiver refuses falls through to this machine", async () => {
    const dir = scratch();
    const rx = await startReceiver(dir);
    const [local, localOpened] = recorder(dir, "local-opened");
    const r = client(["mailto:probe@invalid"], {
      SMART_OPEN_SOCKET: rx.sock,
      SMART_OPEN_LOCAL_OPENER: local,
    });
    expect(r.code).toBe(0);
    expect(r.err).toContain("the client receiver refused mailto:probe@invalid");
    expect(rx.opened()).toEqual([]);
    expect(localOpened()).toEqual(["mailto:probe@invalid"]);
  });

  test("a dead bind left by a dropped connection is removed and the URL opens here", async () => {
    const dir = scratch();
    const sock = join(dir, "dead.sock");
    const holder = Bun.spawn(
      [
        "bun",
        "-e",
        `Bun.listen({ unix: ${JSON.stringify(sock)}, socket: { data() {} } }); setInterval(() => {}, 1000);`,
      ],
      { stdout: "ignore", stderr: "ignore" },
    );
    cleanups.push(() => holder.kill());
    for (let i = 0; i < 200 && !existsSync(sock); i++) await Bun.sleep(25);
    holder.kill("SIGKILL"); // leaves the socket file behind, nobody listening
    await holder.exited;
    expect(existsSync(sock)).toBe(true);
    const [local, localOpened] = recorder(dir, "local-opened");
    const r = client(["https://probe.invalid/stale"], {
      SMART_OPEN_SOCKET: sock,
      SMART_OPEN_LOCAL_OPENER: local,
    });
    expect(r.code).toBe(0);
    expect(localOpened()).toEqual(["https://probe.invalid/stale"]);
    expect(existsSync(sock)).toBe(false);
    // The anomaly is said out loud: this used to fall through with no trace at all.
    expect(r.err).toContain("had no listener");
    expect(r.err).toContain("removed it");
  });

  test("a path always opens here (the file is not on the client), resolved to absolute", async () => {
    const dir = scratch();
    const rx = await startReceiver(dir);
    const [local, localOpened] = recorder(dir, "local-opened");
    const file = join(dir, "doc.txt");
    writeFileSync(file, "x");
    const r = client([file], {
      SMART_OPEN_SOCKET: rx.sock,
      SMART_OPEN_LOCAL_OPENER: local,
    });
    expect(r.code).toBe(0);
    expect(localOpened()).toEqual([file]);
    expect(rx.opened()).toEqual([]);
    // A path offered to the receiver would be refused AND reported on stderr: silence is the proof
    // it was never sent (the refusal alone also falls through to here, so opened() cannot tell).
    expect(r.out + r.err).toBe("");
  });

  test("a path that does not exist is an error, and nothing opens", () => {
    const dir = scratch();
    const [local, localOpened] = recorder(dir, "local-opened");
    const r = client([join(dir, "missing")], {
      SMART_OPEN_LOCAL_OPENER: local,
    });
    expect(r.code).toBe(1);
    expect(r.err).toContain("no such file or directory");
    expect(localOpened()).toEqual([]);
  });
});

// ---- Tiger ledger SO-1 (R3-R7): what the socket's reachable-by-every-process-of-the-user exposure
// may make the Mac do, and what the client says when it cannot reach it. Timings carry wide margins
// (a serial 3 x 1 s run takes >= 3 s; the assertion is < 2.5 s) so a loaded machine does not flake.

describe("receiver bounds", () => {
  test("R3: a burst is spent, then requests are told busy; only the allowed opens ever run", async () => {
    const rx = await startReceiver(scratch(), {
      args: ["--burst", "3", "--refill-ms", "600000"],
    });
    const replies: string[] = [];
    for (let i = 0; i < 5; i++)
      replies.push(
        (await ask(rx.sock, line(`https://probe.invalid/${i}`))).reply,
      );
    expect(replies).toEqual([
      "ok",
      "ok",
      "ok",
      "busy: rate limit",
      "busy: rate limit",
    ]);
    expect(rx.opened()).toHaveLength(3);
  });

  test("R3: a flood of 100 concurrent valid requests opens exactly the burst", async () => {
    const rx = await startReceiver(scratch(), {
      args: [
        "--burst",
        "5",
        "--refill-ms",
        "600000",
        "--max-connections",
        "200",
      ],
    });
    const answers = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        ask(rx.sock, line(`https://probe.invalid/flood${i}`)),
      ),
    );
    const ok = answers.filter((a) => a.reply === "ok");
    const busy = answers.filter((a) => a.reply === "busy: rate limit");
    expect([ok.length, busy.length]).toEqual([5, 95]);
    expect(rx.opened()).toHaveLength(5);
  });

  test("R3: the bucket refills one open per --refill-ms", async () => {
    // The interval must dwarf an opener's start-up (a cold `sh` took 138 ms in measurement), or the
    // "still busy" step would race the refill it is meant to precede.
    const rx = await startReceiver(scratch(), {
      args: ["--burst", "1", "--refill-ms", "1500"],
    });
    expect((await ask(rx.sock, line("https://probe.invalid/a"))).reply).toBe(
      "ok",
    );
    expect((await ask(rx.sock, line("https://probe.invalid/b"))).reply).toBe(
      "busy: rate limit",
    );
    await Bun.sleep(1_700);
    expect((await ask(rx.sock, line("https://probe.invalid/c"))).reply).toBe(
      "ok",
    );
  });

  test("R3: time spent with a full bucket earns nothing toward the next refill", async () => {
    const rx = await startReceiver(scratch(), {
      args: ["--burst", "1", "--refill-ms", "1500"],
    });
    await Bun.sleep(1_000); // idle, bucket full: this second must not be banked
    expect((await ask(rx.sock, line("https://probe.invalid/a"))).reply).toBe(
      "ok",
    );
    await Bun.sleep(700); // 1.7 s since start, but only 0.7 s since the open that emptied it
    expect((await ask(rx.sock, line("https://probe.invalid/b"))).reply).toBe(
      "busy: rate limit",
    );
  });

  test("R3: a request that is not a valid http(s) URL costs no token", async () => {
    const rx = await startReceiver(scratch(), {
      args: ["--burst", "1", "--refill-ms", "600000"],
    });
    for (let i = 0; i < 5; i++) await ask(rx.sock, line("file:///etc/passwd"));
    expect((await ask(rx.sock, line("https://probe.invalid/a"))).reply).toBe(
      "ok",
    );
    expect((await ask(rx.sock, line("https://probe.invalid/b"))).reply).toBe(
      "busy: rate limit",
    );
  });

  test("R4: a slow opener does not serialise requests, nor stall the others", async () => {
    const dir = scratch();
    const [slow] = recorder(dir, "slow", 1);
    const rx = await startReceiver(dir, { opener: slow });
    const t0 = performance.now();
    const three = Promise.all(
      [1, 2, 3].map((i) =>
        ask(rx.sock, line(`https://probe.invalid/slow${i}`)),
      ),
    );
    await Bun.sleep(150); // all three openers are now mid-sleep
    const t1 = performance.now();
    const bad = await ask(rx.sock, line("file:///etc/passwd"));
    expect(bad.reply).toBe("refused: only http(s) URLs");
    expect(performance.now() - t1).toBeLessThan(600); // answered while openers still run
    expect((await three).map((a) => a.reply)).toEqual(["ok", "ok", "ok"]);
    expect(performance.now() - t0).toBeLessThan(2_500); // serial would be >= 3 s
  });

  test("R5: an opener that cannot be spawned is a refusal on the wire, and the receiver lives on", async () => {
    const rx = await startReceiver(scratch(), {
      opener: "/nonexistent/opener",
    });
    for (const n of [1, 2]) {
      expect(
        (await ask(rx.sock, line(`https://probe.invalid/${n}`))).reply,
      ).toBe("refused: opener unavailable");
    }
  });

  test("R4: an opener that outlives --open-timeout-ms is killed and reported", async () => {
    const dir = scratch();
    const [hang, hangOpened] = recorder(dir, "hang", 30);
    const rx = await startReceiver(dir, {
      opener: hang,
      args: ["--open-timeout-ms", "1000"],
    });
    const t0 = performance.now();
    const a = await ask(rx.sock, line("https://probe.invalid/hang"), 10_000);
    expect(a.reply).toBe("refused: opener timed out");
    expect(performance.now() - t0).toBeLessThan(4_000);
    expect(hangOpened()).toHaveLength(1); // it did start; it was the timeout that ended it
  });

  test("R5: held-open connections past --max-connections are told busy, and a freed slot is reusable", async () => {
    const rx = await startReceiver(scratch(), {
      args: ["--max-connections", "2", "--idle-ms", "60000"],
    });
    const release = [await hold(rx.sock), await hold(rx.sock)];
    await Bun.sleep(150);
    expect((await ask(rx.sock, line("https://probe.invalid/a"))).reply).toBe(
      "busy: too many connections",
    );
    release[0]?.();
    await Bun.sleep(150);
    expect((await ask(rx.sock, line("https://probe.invalid/b"))).reply).toBe(
      "ok",
    );
  });

  test("R5: a connection that never delivers its line is dropped at --idle-ms and frees its slot", async () => {
    const rx = await startReceiver(scratch(), {
      args: ["--max-connections", "1", "--idle-ms", "200"],
    });
    const holder = ask(rx.sock, "", 3_000); // connects, sends nothing
    expect((await holder).reply).toBe("refused: idle timeout");
    expect((await ask(rx.sock, line("https://probe.invalid/a"))).reply).toBe(
      "ok",
    );
  });

  test("a second chunk on a connection never makes the same request run twice", async () => {
    const dir = scratch();
    const [slow, slowOpened] = recorder(dir, "slow", 0.6);
    const rx = await startReceiver(dir, { opener: slow });
    const { promise, resolve } = Promise.withResolvers<string>();
    let reply = "";
    const conn = await Bun.connect({
      unix: rx.sock,
      socket: {
        open: (s) => void s.write(line("https://probe.invalid/once")),
        data: (_s, c) => {
          reply += c.toString();
          if (reply.includes("\n")) resolve(reply.trim());
        },
        close() {},
        error() {},
      },
    });
    await Bun.sleep(150); // the opener is running; the request line has been taken
    conn.write(line("https://probe.invalid/once")); // a second chunk, same bytes
    expect(await promise).toBe("ok");
    await Bun.sleep(200);
    expect(slowOpened()).toEqual(["https://probe.invalid/once"]);
  });

  test.each([
    ["--burst", "0"],
    ["--burst", "1.5"],
    ["--refill-ms", "-1"],
    ["--max-connections", "0"],
    ["--settle-ms", "0"],
    ["--idle-ms", "3000000000"], // > 2^31-1: setTimeout would fire it after ~1 ms
  ])(
    "a limit of %s %s is rejected at startup (exit 2), not run unbounded",
    (flag, value) => {
      const p = Bun.spawnSync(
        [
          "bun",
          RECEIVE,
          "--socket",
          join(scratch(), "r.sock"),
          `${flag}=${value}`, // `--flag -1` would read -1 as another flag
        ],
        {
          timeout: 20_000,
        },
      );
      expect(p.exitCode).toBe(2);
      expect(p.stderr.toString()).toContain(
        "must be an integer from 1 to 2147483647",
      );
    },
  );
});

describe("client under the receiver's limits", () => {
  test("R3/R7: busy is reported and nothing is opened anywhere (exit 1)", async () => {
    const dir = scratch();
    const rx = await startReceiver(dir, {
      args: ["--burst", "1", "--refill-ms", "600000"],
    });
    const [local, localOpened] = recorder(dir, "local-opened");
    const env = { SMART_OPEN_SOCKET: rx.sock, SMART_OPEN_LOCAL_OPENER: local };
    expect(client(["https://probe.invalid/one"], env).code).toBe(0);
    const second = client(["https://probe.invalid/two"], env);
    expect(second.code).toBe(1);
    expect(second.err).toContain("the client is busy (busy: rate limit)");
    expect(second.err).toContain("--here"); // and says what to do about it
    expect(localOpened()).toEqual([]);
    expect(rx.opened()).toEqual(["https://probe.invalid/one"]);
  });

  test("R7: a socket that accepts but never answers is named, then the URL opens here", async () => {
    const dir = scratch();
    const sock = join(dir, "mute.sock");
    await silentListener(sock);
    const [local, localOpened] = recorder(dir, "local-opened");
    const r = client(["https://probe.invalid/mute"], {
      SMART_OPEN_SOCKET: sock,
      SMART_OPEN_LOCAL_OPENER: local,
    });
    expect(r.code).toBe(0);
    expect(r.err).toContain("accepted but sent no ok within 2000 ms");
    expect(localOpened()).toEqual(["https://probe.invalid/mute"]);
  });

  test("R7: a refusal quotes the receiver's own reason", async () => {
    const dir = scratch();
    const rx = await startReceiver(dir);
    const [local] = recorder(dir, "local-opened");
    const r = client(["mailto:probe@invalid"], {
      SMART_OPEN_SOCKET: rx.sock,
      SMART_OPEN_LOCAL_OPENER: local,
    });
    expect(r.err).toContain("(refused: only http(s) URLs)");
  });
});

describe("unlinkIfSame (R6: remove the dead bind we probed, never a live one re-bound over it)", () => {
  test("removes the very file it was told about", async () => {
    const dir = scratch();
    const path = join(dir, "bind");
    writeFileSync(path, "dead");
    const seen = fileKey(path);
    expect(seen).toBeDefined();
    expect(await unlinkIfSame(path, seen!)).toBe(true);
    expect(existsSync(path)).toBe(false);
  });

  test("leaves a different file that now sits at the path (a newer connection re-bound it)", async () => {
    const dir = scratch();
    const path = join(dir, "bind");
    writeFileSync(path, "dead");
    const seen = fileKey(path)!;
    // Atomic replacement: the new file exists before the old one is released, so inodes differ.
    writeFileSync(join(dir, "newer"), "live");
    renameSync(join(dir, "newer"), path);
    expect(await unlinkIfSame(path, seen)).toBe(false);
    expect(readFileSync(path, "utf8")).toBe("live");
  });

  test("a path that is already gone is not an error", async () => {
    const dir = scratch();
    const path = join(dir, "bind");
    writeFileSync(path, "dead");
    const seen = fileKey(path)!;
    rmSync(path);
    expect(await unlinkIfSame(path, seen)).toBe(false);
  });

  test("a path it cannot remove is `did not remove`, never an exception (the URL still has to open)", async () => {
    // Same device+inode as itself, but unlink(2) on a directory fails (EISDIR/EPERM).
    const dir = scratch();
    const seen = fileKey(dir)!;
    expect(await unlinkIfSame(dir, seen)).toBe(false);
    expect(existsSync(dir)).toBe(true);
  });
});

// ---- Review findings (an independent read of receive.ts / smart-open.ts, then verified by
// experiment before acting): which claims held, which were refuted, and what each now pins.

/** A client that does NOT hang up after the reply — what a hostile or buggy peer does. */
async function stubborn(sock: string, payload: string) {
  let reply = "";
  const conn = await Bun.connect({
    unix: sock,
    socket: {
      open: (s) => {
        if (payload) s.write(payload);
      },
      data: (_s, c) => {
        reply += c.toString();
      },
      close() {},
      error() {},
    },
  });
  cleanups.push(() => conn.terminate());
  return { conn, reply: () => reply.trim() };
}

/** The pid recorder() wrote for the opener the receiver spawned, once it has started. */
async function pidOf(dir: string, name: string): Promise<number> {
  const file = join(dir, `${name}.pid`);
  for (let i = 0; i < 200 && !existsSync(file); i++) await Bun.sleep(25);
  return Number(readFileSync(file, "utf8").trim());
}
const alive = async (pid: number): Promise<boolean> =>
  (await attempt(() => process.kill(pid, 0))).ok;

describe("peers that never hang up (the receiver's own end() must release the slot)", () => {
  test("an idle peer that keeps its side open does not hold a slot past --idle-ms", async () => {
    const rx = await startReceiver(scratch(), {
      args: ["--max-connections", "1", "--idle-ms", "200"],
    });
    const idle = await stubborn(rx.sock, "");
    await Bun.sleep(700);
    expect(idle.reply()).toBe("refused: idle timeout");
    expect((await ask(rx.sock, line("https://probe.invalid/a"))).reply).toBe(
      "ok",
    );
  });

  test("a peer that keeps its side open after the reply does not hold a slot", async () => {
    const rx = await startReceiver(scratch(), {
      args: ["--max-connections", "1"],
    });
    const held = await stubborn(rx.sock, line("https://probe.invalid/b1"));
    await Bun.sleep(500);
    expect(held.reply()).toBe("ok");
    expect((await ask(rx.sock, line("https://probe.invalid/b2"))).reply).toBe(
      "ok",
    );
  });

  test("a line sent after the deadline already fired opens nothing", async () => {
    const rx = await startReceiver(scratch(), { args: ["--idle-ms", "200"] });
    const late = await stubborn(rx.sock, "");
    await Bun.sleep(500);
    late.conn.write(line("https://probe.invalid/late"));
    await Bun.sleep(500);
    expect(rx.opened()).toEqual([]);
  });

  test("a client that vanishes mid-request does not take the receiver down", async () => {
    const dir = scratch();
    const [slow] = recorder(dir, "slow", 1);
    const rx = await startReceiver(dir, { opener: slow });
    const gone = await stubborn(rx.sock, line("https://probe.invalid/gone"));
    await Bun.sleep(150);
    gone.conn.terminate(); // abrupt, with the opener still running
    await Bun.sleep(1_300); // the opener ends and the receiver tries to answer a dead socket
    expect(
      (await ask(rx.sock, line("https://probe.invalid/after"))).reply,
    ).toBe("ok");
  });
});

describe("answer time: the receiver settles before the client gives up", () => {
  test("the settle window sits below the client's patience", () => {
    expect(SETTLE_MS).toBeLessThan(ACK_MS);
  });

  test("--settle-ms at the client's patience is rejected at startup (exit 2)", () => {
    const p = Bun.spawnSync(
      [
        "bun",
        RECEIVE,
        "--socket",
        join(scratch(), "r.sock"),
        `--settle-ms=${ACK_MS}`,
      ],
      { timeout: 20_000 },
    );
    expect(p.exitCode).toBe(2);
    expect(p.stderr.toString()).toContain("must be below");
  });

  test("an opener still starting after --settle-ms is answered ok, then SIGKILLed at --open-timeout-ms", async () => {
    const dir = scratch();
    const [cold] = recorder(dir, "cold", 30, true);
    const rx = await startReceiver(dir, {
      opener: cold,
      args: ["--settle-ms", "300", "--open-timeout-ms", "1500"],
    });
    const t0 = performance.now();
    const a = await ask(rx.sock, line("https://probe.invalid/cold"), 5_000);
    expect(a.reply).toBe("ok");
    expect(performance.now() - t0).toBeLessThan(1_200); // not held to the opener's end
    const pid = await pidOf(dir, "cold");
    expect(await alive(pid)).toBe(true); // still running: the ok did not wait for it
    await Bun.sleep(2_000);
    expect(await alive(pid)).toBe(false); // the timeout reaped it even though nobody is waiting
  });

  test("a slow `open` is opened once: the client waits, the receiver answers before it gives up", async () => {
    const dir = scratch();
    const [slow, slowOpened] = recorder(dir, "slow", 3);
    const rx = await startReceiver(dir, { opener: slow }); // default settle window
    const [local, localOpened] = recorder(dir, "local-opened");
    const t0 = performance.now();
    const r = client(["https://probe.invalid/slowopen"], {
      SMART_OPEN_SOCKET: rx.sock,
      SMART_OPEN_LOCAL_OPENER: local,
    });
    expect(r.out).toContain(
      "opened on the client: https://probe.invalid/slowopen",
    );
    expect(localOpened()).toEqual([]); // the old behaviour: client gave up at 2 s, opened here too
    expect(slowOpened()).toEqual(["https://probe.invalid/slowopen"]);
    expect(performance.now() - t0).toBeLessThan(ACK_MS + 800);
  });

  test("a fast failure still falls through to this machine (the exit code decides inside the window)", async () => {
    const dir = scratch();
    const rx = await startReceiver(dir, { opener: "false" });
    const [local, localOpened] = recorder(dir, "local-opened");
    const r = client(["https://probe.invalid/fails"], {
      SMART_OPEN_SOCKET: rx.sock,
      SMART_OPEN_LOCAL_OPENER: local,
    });
    expect(r.code).toBe(0);
    expect(r.err).toContain("(refused: opener exited 1)");
    expect(localOpened()).toEqual(["https://probe.invalid/fails"]);
  });
});

describe("client diagnostics say what actually happened", () => {
  test("a listener that hangs up without answering is not called `accepted but silent`", async () => {
    const dir = scratch();
    const sock = join(dir, "hangup.sock");
    const proc = Bun.spawn(
      [
        "bun",
        "-e",
        `Bun.listen({ unix: ${JSON.stringify(sock)}, socket: { open(s) { s.end(); }, data() {} } }); setInterval(() => {}, 1000);`,
      ],
      { stdout: "ignore", stderr: "ignore" },
    );
    cleanups.push(() => proc.kill());
    for (let i = 0; i < 200 && !existsSync(sock); i++) await Bun.sleep(25);
    const [local, localOpened] = recorder(dir, "local-opened");
    const r = client(["https://probe.invalid/hangup"], {
      SMART_OPEN_SOCKET: sock,
      SMART_OPEN_LOCAL_OPENER: local,
    });
    expect(r.err).toContain("closed the connection without answering");
    expect(r.err).not.toContain("sent no ok");
    expect(localOpened()).toEqual(["https://probe.invalid/hangup"]);
  });

  test("a socket the client may not connect to is reported as a connect failure", async () => {
    if (process.getuid?.() === 0) return; // root connects anyway; nothing to observe
    const dir = scratch();
    const sock = join(dir, "forbidden.sock");
    await silentListener(sock);
    chmodSync(sock, 0o000);
    const [local, localOpened] = recorder(dir, "local-opened");
    const r = client(["https://probe.invalid/eacces"], {
      SMART_OPEN_SOCKET: sock,
      SMART_OPEN_LOCAL_OPENER: local,
    });
    expect(r.err).toContain("could not connect (EACCES)");
    expect(localOpened()).toEqual(["https://probe.invalid/eacces"]);
  });
});

describe("request decoding", () => {
  test("a multi-byte character split across two chunks reaches the opener intact", async () => {
    const rx = await startReceiver(scratch());
    const url = "https://probe.invalid/日本語";
    const bytes = new TextEncoder().encode(line(url));
    const lead = bytes.findIndex((b) => b >= 0x80);
    const cut = lead + 1; // between the lead byte and the rest of the same character
    const answered = Promise.withResolvers<string>();
    let reply = "";
    const conn = await Bun.connect({
      unix: rx.sock,
      socket: {
        open: (s) => void s.write(bytes.subarray(0, cut)),
        data: (_s, c) => {
          reply += c.toString();
          if (reply.includes("\n")) answered.resolve(reply.trim());
        },
        close() {},
        error() {},
      },
    });
    cleanups.push(() => conn.terminate());
    await Bun.sleep(100);
    conn.write(bytes.subarray(cut));
    // Wait for the receiver's answer, not a fixed pause: the opener has finished once it is given.
    expect(await Promise.race([answered.promise, Bun.sleep(5_000)])).toBe("ok");
    expect(rx.opened()).toEqual([url]);
  });
});
