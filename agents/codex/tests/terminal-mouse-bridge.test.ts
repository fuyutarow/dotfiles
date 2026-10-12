import { describe, expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MouseModeFilter } from "../terminal/codex-mouse-bridge.ts";

const bytes = (value: string) => new TextEncoder().encode(value);
const text = (value: Uint8Array) => new TextDecoder().decode(value);
const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });

describe("MouseModeFilter", () => {
  test("filters split mouse DECSET and keeps mixed non-mouse modes", () => {
    const filter = new MouseModeFilter();
    expect(text(filter.write(bytes("before\u001B[?1000;25")))).toBe("before");
    expect(text(filter.write(bytes(";1006hafter\u001B[?1000l")))).toBe(
      "\u001B[?25hafter\u001B[?1000l",
    );
  });

  test("preserves unrelated bytes, UTF-8, OSC and DCS payloads", () => {
    const filter = new MouseModeFilter();
    const input =
      "日本語\u001B]title \u001B[?1000h\u0007\u001BPdata\u001B[?1006h\u001B\\\u001B[?1004h";
    expect(text(filter.write(bytes(input)))).toBe(input);
  });

  test("preserves split UTF-8 and invalid bytes exactly", () => {
    const filter = new MouseModeFilter();
    const first = new Uint8Array([0xe3, 0x81]);
    const second = new Uint8Array([0x82, 0xff, 0x1b, 0x5b, 0x3c, 0x30, 0x4d]);
    expect([...filter.write(first)]).toEqual([...first]);
    expect([...filter.write(second)]).toEqual([...second]);
  });

  test("does not treat BEL as the end of a DCS control string", () => {
    const filter = new MouseModeFilter();
    const input = new Uint8Array([
      0x1b, 0x50, 0x64, 0x63, 0x73, 0x20, 0x07, 0x1b, 0x5b, 0x3f, 0x31, 0x30,
      0x30, 0x36, 0x68, 0x1b, 0x5c,
    ]);
    expect([...filter.write(input)]).toEqual([...input]);
  });

  test("bounds incomplete CSI buffering and flushes it unchanged", () => {
    const filter = new MouseModeFilter();
    filter.write(bytes("\u001B[" + "1".repeat(5000)));
    expect(filter.pendingBytes).toBe(0);
    expect(filter.flush().byteLength).toBe(0);
  });

  test("removes every mouse enable mode without removing focus reporting", () => {
    const filter = new MouseModeFilter();
    expect(
      text(
        filter.write(
          bytes("\u001B[?9;1000;1001;1002;1003;1005;1006;1015;1016;1004h"),
        ),
      ),
    ).toBe("\u001B[?1004h");
  });
});

test("launcher preserves non-TTY argv, environment and child exit status", async () => {
  const launcher = new URL("../terminal/codex-mouse-bridge.ts", import.meta.url)
    .pathname;
  const fixture = Bun.spawn(
    [
      "bun",
      launcher,
      "bun",
      "-e",
      "console.log(JSON.stringify({args:process.argv.slice(2),value:process.env.BRIDGE_FIXTURE}));process.exit(7)",
      "fixture",
      "a b",
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, BRIDGE_FIXTURE: "kept" },
    },
  );
  const expected = await fixture.stdout.text();
  expect(await fixture.exited).toBe(7);
  expect(expected).toContain('{"args":["a b"],"value":"kept"}');
});

test("PTY relay filters mouse mode, resizes, and forwards raw input bytes", async () => {
  const launcher = new URL("../terminal/codex-mouse-bridge.ts", import.meta.url)
    .pathname;
  let output = "";
  let resized = false;
  let sent = false;
  let outer: Bun.Terminal;
  let relay: Bun.Subprocess;
  outer = new Bun.Terminal({
    cols: 97,
    rows: 31,
    data: (_terminal, data) => {
      output += new TextDecoder().decode(data);
      if (!resized && output.includes("READY")) {
        resized = true;
        setTimeout(() => {
          outer.resize(101, 37);
          relay.kill("SIGWINCH");
          setTimeout(() => {
            outer.write(new Uint8Array([0xe3, 0x81]));
            outer.write(
              new Uint8Array([0x82, 0xff, 0x1b, 0x5b, 0x3c, 0x30, 0x4d]),
            );
          }, 300);
        }, 150);
      }
      if (output.includes("GOT:")) sent = true;
    },
  });
  const program =
    "process.stdin.setRawMode(true);process.on('SIGWINCH',()=>setTimeout(()=>process.stdout.write('RESIZED:'+process.stdout.columns+'x'+process.stdout.rows),50));process.stdout.write('\\x1b[?1000;25hREADY:'+process.stdout.columns+'x'+process.stdout.rows);process.stdin.on('data',d=>{process.stdout.write('GOT:'+Buffer.from(d).toString('hex')+' SIZE:'+process.stdout.columns+'x'+process.stdout.rows);process.exit(7)})";
  relay = Bun.spawn(["bun", launcher, "bun", "-e", program], {
    terminal: outer,
    timeout: 5000,
    killSignal: "SIGKILL",
  });
  const code = await relay.exited;
  await delay(50);
  outer.close();
  expect(sent).toBe(true);
  expect(code).toBe(7);
  expect(output).toContain("\u001B[?25hREADY:97x31");
  expect(output).not.toContain("\u001B[?1000;25h");
  expect(output).toContain("RESIZED:101x37");
  expect(output).toContain("GOT:e38182ff1b5b3c304d SIZE:101x37");
  expect(output).not.toContain("\u001B[?1007");
});

test("PTY relay forwards termination and waits for its child to exit", async () => {
  const launcher = new URL("../terminal/codex-mouse-bridge.ts", import.meta.url)
    .pathname;
  let output = "";
  const marker = join(tmpdir(), `codex-bridge-signal-${crypto.randomUUID()}`);
  let outer: Bun.Terminal;
  let relay: Bun.Subprocess;
  outer = new Bun.Terminal({
    data: (_terminal, data) => {
      output += new TextDecoder().decode(data);
      if (output.includes("READY")) {
        setTimeout(() => {
          relay.kill("SIGTERM");
        }, 150);
      }
    },
  });
  const program =
    "process.stdin.setRawMode(true);setInterval(()=>{},1000);process.on('SIGTERM',()=>Bun.write(process.env.BRIDGE_SIGNAL_MARKER,'signaled').then(()=>process.exit(17)));process.stdout.write('READY')";
  relay = Bun.spawn(["bun", launcher, "bun", "-e", program], {
    terminal: outer,
    timeout: 5000,
    killSignal: "SIGKILL",
    env: { ...process.env, BRIDGE_SIGNAL_MARKER: marker },
  });
  const code = await relay.exited;
  await delay(50);
  outer.close();
  expect(code).toBe(17);
  expect(output).toContain("READY");
  expect(await Bun.file(marker).text()).toBe("signaled");
  await rm(marker, { force: true });
});

test("bridge restores shell terminal mode after Codex exit and spawn failure", async () => {
  const temp = await mkdtemp(join(tmpdir(), "codex-bridge-raw-"));
  const home = join(temp, "home");
  const prefix = join(temp, "brew");
  const codexDir = join(temp, "bin");
  const bridge = join(home, ".codex/terminal/codex-mouse-bridge.ts");
  const prefixFile = join(home, ".config/dotfiles/brew-prefix");
  const codex = join(codexDir, "codex");
  await mkdir(join(home, ".codex/terminal"), { recursive: true });
  await mkdir(join(home, ".config/dotfiles"), { recursive: true });
  await mkdir(join(prefix, "bin"), { recursive: true });
  await mkdir(codexDir, { recursive: true });
  await symlink(
    new URL("../terminal/codex-mouse-bridge.ts", import.meta.url).pathname,
    bridge,
  );
  await symlink(process.execPath, join(prefix, "bin/bun"));
  await writeFile(prefixFile, `${prefix}\n`);
  await writeFile(codex, "#!/bin/sh\nprintf 'CODEX_DONE\\n'\n");
  await chmod(codex, 0o755);
  let output = "";
  const terminal = new Bun.Terminal({
    data: (_terminal, data) => {
      output += new TextDecoder().decode(data);
    },
  });
  const shell = Bun.spawn(
    [
      "zsh",
      "-f",
      "-c",
      'bun "$HOME/.codex/terminal/codex-mouse-bridge.ts" "$CODEX_BIN"; FIRST=$?; bun "$HOME/.codex/terminal/codex-mouse-bridge.ts" "$MISSING_CODEX"; SECOND=$?; printf "BRIDGE_STATUSES=%s,%s\\n" "$FIRST" "$SECOND"; stty -a',
    ],
    {
      terminal,
      timeout: 5000,
      killSignal: "SIGKILL",
      env: {
        ...process.env,
        HOME: home,
        CODEX_BIN: codex,
        MISSING_CODEX: "/this/path/does/not/exist/codex",
        HERDR_ENV: "1",
        PATH: `${prefix}/bin:${codexDir}:${process.env.PATH ?? ""}`,
      },
    },
  );
  const code = await shell.exited;
  await delay(50);
  terminal.close();
  expect(code).toBe(0);
  expect(output).toContain("CODEX_DONE");
  expect(output).toContain("could not start Codex");
  expect(output).toContain("BRIDGE_STATUSES=0,1");
  expect(output).toContain("icanon");
  expect(output).toContain("echo");
  await rm(temp, { recursive: true, force: true });
});
