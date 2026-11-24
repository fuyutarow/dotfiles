// bun test for tools/smart-copy — smart-copy spawned as a real process against stub clipboard tools on
// PATH and a pinned terminal device (SMART_COPY_TTY, a plain file). Nothing here touches a real
// clipboard or writes an escape into the terminal of whoever runs the tests; the one test that needs a
// terminal creates its own pty.
//
// Proposition P1: `printf x | smart-copy` exits 0 when at least one route delivered and 1 with one
// reason per route when none did; it reads no SSH_*, HERDR_* or smart-open socket state to choose a
// route; a caller with no controlling terminal still reaches the terminal of its nearest ancestor
// that has one.
import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Result } from "@dotfiles/shared/src/result.ts";
import { osc52 } from "#src/terminal.ts";

const SMART_COPY = join(import.meta.dir, "..", "src", "smart-copy.ts");

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
});

async function scratch(): Promise<string> {
  // tmp-ok: removed by afterEach.
  const dir = await mkdtemp("/tmp/sc-");
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

/** An executable stub tool. /bin paths: a stub runs with PATH = the stub directory alone. */
async function stub(dir: string, name: string, body: string): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, `#!/bin/sh\n${body}\n`);
  await chmod(path, 0o755);
  return path;
}

/** A stub that records its stdin bytes and the WSL_INTEROP it was started with, then exits `code`. */
async function recorder(
  dir: string,
  name: string,
  code = 0,
  extra = "",
): Promise<{ stdin: () => Promise<Buffer>; interop: () => Promise<string> }> {
  const stdinFile = join(dir, `${name}.stdin`);
  const interopFile = join(dir, `${name}.interop`);
  await stub(
    dir,
    name,
    `/bin/cat > "${stdinFile}"\nprintf '%s' "$WSL_INTEROP" > "${interopFile}"\n${extra}\nexit ${code}`,
  );
  return {
    stdin: () => readFile(stdinFile),
    interop: () => readFile(interopFile, "utf8"),
  };
}

type Run = {
  code: number;
  out: string;
  err: string;
  tty: string;
  ms: number;
};

async function run(
  dir: string,
  input: string | Uint8Array,
  opts: {
    args?: string[];
    env?: Record<string, string>;
    path?: string;
    tty?: string;
  } = {},
): Promise<Run> {
  const tty = join(dir, "tty.out");
  await writeFile(tty, "");
  const started = performance.now();
  const p = Bun.spawn([process.execPath, SMART_COPY, ...(opts.args ?? [])], {
    // No inherited environment: no real SSH_*, HERDR_*, WSL_* or PATH of the machine running the tests.
    env: {
      HOME: dir,
      PATH: opts.path ?? dir,
      SMART_COPY_TTY: opts.tty ?? tty,
      ...opts.env,
    },
    stdin: Buffer.from(input),
    stdout: "pipe",
    stderr: "pipe",
    signal: AbortSignal.timeout(30_000),
    killSignal: "SIGKILL",
  });
  const [code, out, err] = await Promise.all([
    p.exited,
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
  ]);
  return {
    code,
    out,
    err,
    tty: await readFile(tty, "utf8"),
    ms: performance.now() - started,
  };
}

/** True when the stub recorded a run (its stdin file exists). */
const ran = async (read: () => Promise<Buffer>): Promise<boolean> =>
  (
    await Result.tryPromise({ try: read, catch: (error: unknown) => error })
  ).isOk();

const TEXT = "日本語 és — line 1\nline 2";
const BYTES = Buffer.from(TEXT, "utf8");

describe("routes run in every environment shape", () => {
  const shapes: Record<string, Record<string, string>> = {
    plain: {},
    "ssh set": {
      SSH_CONNECTION: "203.0.113.9 50000 198.51.100.1 22",
      SSH_TTY: "/dev/pts/9",
    },
    "herdr set": { HERDR_ENV: "1" },
    "ssh + herdr + a bound smart-open socket": {
      SSH_CONNECTION: "203.0.113.9 50000 198.51.100.1 22",
      HERDR_ENV: "1",
      SMART_OPEN_SOCKET: "/tmp/smart-open-nobody--box.sock",
    },
    "loopback ssh": { SSH_CONNECTION: "127.0.0.1 50000 127.0.0.1 22" },
  };

  test("terminal and native are both fed, identically, whatever SSH_*/HERDR_*/smart-open say", async () => {
    const results: Run[] = [];
    const fed: Buffer[] = [];
    for (const env of Object.values(shapes)) {
      const dir = await scratch();
      const xclip = await recorder(dir, "xclip");
      const r = await run(dir, BYTES, { args: ["--status"], env });
      results.push({ ...r, ms: 0 });
      fed.push(await xclip.stdin());
    }
    for (const r of results) {
      expect(r.code).toBe(0);
      expect(r.err).toBe("");
      expect(r.tty).toBe(osc52(BYTES));
      expect(r.out).toMatch(
        /^terminal: written \(.+\/tty\.out\); native: ok \(xclip\)\n$/u,
      );
    }
    for (const b of fed) expect(b.equals(BYTES)).toBe(true);
    // Same status line (the scratch dir differs, so compare with it removed).
    const lines = results.map((r) =>
      r.out.replace(/\/tmp\/sc-[^/]+/u, "<dir>"),
    );
    expect(new Set(lines).size).toBe(1);
  });

  test("the OSC 52 payload is ESC ] 52 ; c ; base64 BEL of the exact bytes", async () => {
    const dir = await scratch();
    await recorder(dir, "xclip");
    const r = await run(dir, "hi\n");
    expect(r.tty).toBe("\u001B]52;c;aGkK\u0007");
  });
});

describe("native tools", () => {
  test("WSL: clip.exe gets UTF-16LE, started through the helper's socket, not the inherited one", async () => {
    const dir = await scratch();
    const clip = await recorder(dir, "clip.exe");
    const helper = await stub(dir, "helper", "echo /run/WSL/desktop_interop");
    const r = await run(dir, BYTES, {
      args: ["--status"],
      env: {
        WSL_INTEROP: "/run/WSL/dead_interop",
        SMART_COPY_INTEROP_HELPER: helper,
      },
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain("native: ok (clip.exe)");
    expect((await clip.stdin()).equals(Buffer.from(TEXT, "utf16le"))).toBe(
      true,
    );
    expect(await clip.interop()).toBe("/run/WSL/desktop_interop");
  });

  test("WSL: with no qualifying socket the inherited WSL_INTEROP stays and the status says so", async () => {
    const dir = await scratch();
    const clip = await recorder(dir, "clip.exe");
    const helper = await stub(
      dir,
      "helper",
      "echo 'wsl-interop-session: no live socket runs in session 1' >&2; exit 1",
    );
    const r = await run(dir, "x", {
      args: ["--status"],
      env: {
        WSL_INTEROP: "/run/WSL/inherited_interop",
        SMART_COPY_INTEROP_HELPER: helper,
      },
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain(
      "native: ok (clip.exe; inherited WSL_INTEROP kept: no live socket runs in session 1)",
    );
    expect(await clip.interop()).toBe("/run/WSL/inherited_interop");
  });

  test("macOS: pbcopy gets UTF-8", async () => {
    const dir = await scratch();
    const pbcopy = await recorder(dir, "pbcopy");
    const r = await run(dir, BYTES, { args: ["--status"] });
    expect(r.out).toContain("native: ok (pbcopy)");
    expect((await pbcopy.stdin()).equals(BYTES)).toBe(true);
  });

  test("Linux: xclip is preferred to xsel, and xsel is used when it is alone", async () => {
    const both = await scratch();
    const xclip = await recorder(both, "xclip");
    const xsel = await recorder(both, "xsel");
    expect((await run(both, "a", { args: ["--status"] })).out).toContain(
      "(xclip)",
    );
    expect((await xclip.stdin()).toString()).toBe("a");
    expect(await ran(xsel.stdin)).toBe(false);

    const alone = await scratch();
    const only = await recorder(alone, "xsel");
    expect((await run(alone, "b", { args: ["--status"] })).out).toContain(
      "(xsel)",
    );
    expect((await only.stdin()).toString()).toBe("b");
  });

  test("clip.exe is preferred to a Linux tool also present", async () => {
    const dir = await scratch();
    const clip = await recorder(dir, "clip.exe");
    const xclip = await recorder(dir, "xclip");
    await run(dir, "a", {
      env: { SMART_COPY_INTEROP_HELPER: await stub(dir, "h", "echo /s") },
    });
    expect((await clip.stdin()).length).toBeGreaterThan(0);
    expect(await ran(xclip.stdin)).toBe(false);
  });

  test("a tool that forks a background holder (xclip, xsel) does not make smart-copy wait", async () => {
    const dir = await scratch();
    await recorder(dir, "xclip", 0, "/bin/sleep 20 &");
    const r = await run(dir, "a", { args: ["--status"] });
    expect(r.code).toBe(0);
    expect(r.out).toContain("native: ok (xclip)");
    expect(r.ms).toBeLessThan(10_000);
  });

  test("a tool that hangs is stopped at the bound and reported; the terminal still counts", async () => {
    const dir = await scratch();
    const pidFile = join(dir, "hang.pid");
    await stub(dir, "xclip", `echo $$ > "${pidFile}"\nexec /bin/sleep 30`);
    const r = await run(dir, "a", {
      args: ["--status"],
      env: { SMART_COPY_NATIVE_MS: "400" },
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain(
      "native: failed (xclip still running after 400 ms; stopped it)",
    );
    expect(r.ms).toBeLessThan(10_000);
    const pid = Number((await readFile(pidFile, "utf8")).trim());
    expect(() => process.kill(pid, 0)).toThrow();
  });
});

describe("exit status", () => {
  test("default prints nothing on success", async () => {
    const dir = await scratch();
    await recorder(dir, "xclip");
    const r = await run(dir, "x");
    expect([r.code, r.out, r.err]).toEqual([0, "", ""]);
  });

  test("a failing native tool with a written terminal exits 0, and --status says which failed", async () => {
    const dir = await scratch();
    await recorder(dir, "xclip", 3, "echo boom >&2");
    const r = await run(dir, "x", { args: ["--status"] });
    expect(r.code).toBe(0);
    expect(r.out).toBe(
      `terminal: written (${join(dir, "tty.out")}); native: failed (xclip exited 3: boom)\n`,
    );
    expect(r.err).toBe("");
  });

  test("a failing terminal with a working native tool exits 0, and --status says which failed", async () => {
    const dir = await scratch();
    const xclip = await recorder(dir, "xclip");
    const r = await run(dir, "x", {
      args: ["--status"],
      tty: join(dir, "missing-dir", "tty"),
    });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(
      /^terminal: not written \(.*missing-dir\/tty.*\); native: ok \(xclip\)\n$/u,
    );
    expect((await xclip.stdin()).toString()).toBe("x");
  });

  test("both routes failing exits 1 with one stderr line per route", async () => {
    const dir = await scratch();
    await recorder(dir, "xclip", 4, "echo no display >&2");
    const r = await run(dir, "x", { tty: join(dir, "missing-dir", "tty") });
    expect(r.code).toBe(1);
    expect(r.out).toBe("");
    const lines = r.err.trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^smart-copy: terminal: .*missing-dir\/tty/u);
    expect(lines[1]).toBe("smart-copy: native: xclip exited 4: no display");
  });

  test("no clipboard tool on this machine is a native failure naming what was looked for", async () => {
    const dir = await scratch();
    const r = await run(dir, "x", { tty: join(dir, "missing-dir", "tty") });
    expect(r.code).toBe(1);
    expect(r.err).toContain(
      "smart-copy: native: no clipboard tool on PATH (looked for clip.exe, pbcopy, xclip, xsel)",
    );
  });
});

describe("usage", () => {
  test("empty stdin exits 2 and feeds no route", async () => {
    const dir = await scratch();
    const xclip = await recorder(dir, "xclip");
    const r = await run(dir, "");
    expect(r.code).toBe(2);
    expect(r.err).toContain("smart-copy: stdin is empty");
    expect(r.tty).toBe("");
    expect(await ran(xclip.stdin)).toBe(false);
  });

  test("stdin that is not UTF-8 exits 2 and feeds no route", async () => {
    const dir = await scratch();
    const xclip = await recorder(dir, "xclip");
    const r = await run(dir, new Uint8Array([0x61, 0xff, 0xfe]));
    expect(r.code).toBe(2);
    expect(r.err).toContain("not valid UTF-8");
    expect(r.tty).toBe("");
    expect(await ran(xclip.stdin)).toBe(false);
  });

  test("an unknown flag or an argument exits 2", async () => {
    const dir = await scratch();
    expect((await run(dir, "x", { args: ["--bogus"] })).code).toBe(2);
    const arg = await run(dir, "x", { args: ["payload"] });
    expect(arg.code).toBe(2);
    expect(arg.err).toContain("takes no arguments");
  });

  test("--echo writes the text, then the escape, to the terminal", async () => {
    const dir = await scratch();
    await recorder(dir, "xclip");
    const r = await run(dir, "hi", { args: ["--echo", "--status"] });
    expect(r.code).toBe(0);
    expect(r.tty).toBe(`hi\n${osc52(Buffer.from("hi"))}`);
    expect(r.out).toContain("echo: written");
  });

  test("--help states that written is not delivered", async () => {
    const dir = await scratch();
    const r = await run(dir, "", { args: ["--help"] });
    expect(r.code).toBe(0);
    expect(r.out).toContain("'written' means the bytes left this process");
    expect(r.out).toContain("does NOT mean the terminal accepted them");
  });
});

const setsid = Bun.which("setsid");
const ps = Bun.which("ps");

describe.skipIf(setsid === null || ps === null)(
  "a caller without a controlling terminal",
  () => {
    // A pty gives the parent shell a controlling terminal; `setsid --wait` starts smart-copy in a new
    // session, which has none. The escape must still arrive on the pty, and --echo must not.
    async function underPty(
      dir: string,
      args: string,
    ): Promise<{ screen: string; code: number }> {
      let screen = "";
      const pathDirs = [
        dir,
        dirname(setsid ?? ""),
        dirname(ps ?? ""),
        "/usr/bin",
        "/bin",
      ];
      const p = Bun.spawn(
        [
          "sh",
          "-c",
          `printf 'héllo secret' | setsid --wait ${process.execPath} ${SMART_COPY} ${args}`,
        ],
        {
          env: {
            HOME: dir,
            PATH: pathDirs.join(":"),
          },
          terminal: {
            cols: 200,
            rows: 24,
            data(_terminal, data) {
              screen += Buffer.from(data).toString("utf8");
            },
          },
          signal: AbortSignal.timeout(30_000),
          killSignal: "SIGKILL",
        },
      );
      const code = await p.exited;
      await Bun.sleep(150);
      return { screen, code };
    }

    test("OSC 52 reaches the terminal of the nearest ancestor that has one", async () => {
      const dir = await scratch();
      const clip = await recorder(dir, "clip.exe");
      await stub(dir, "helper", "echo /s");
      const r = await underPty(dir, "--status");
      expect(r.code).toBe(0);
      expect(r.screen).toContain(osc52(Buffer.from("héllo secret")));
      expect(r.screen).toMatch(
        /terminal: written \(\/dev\/\S+, ancestor's terminal\)/u,
      );
      expect((await clip.stdin()).length).toBeGreaterThan(0);
    });

    test("--echo never writes the text into an ancestor's terminal", async () => {
      const dir = await scratch();
      await recorder(dir, "clip.exe");
      const r = await underPty(dir, "--echo --status");
      expect(r.code).toBe(0);
      expect(r.screen).toContain(osc52(Buffer.from("héllo secret")));
      // The escape carries the text base64-encoded; the plain text must not appear.
      expect(
        r.screen.replaceAll(osc52(Buffer.from("héllo secret")), ""),
      ).not.toContain("héllo secret");
      expect(r.screen).toMatch(/echo: not written/u);
    });
  },
);
