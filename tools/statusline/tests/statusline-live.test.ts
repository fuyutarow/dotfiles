import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { isolatedStatuslineEnv } from "./helpers.ts";

const script = join(import.meta.dir, "..", "src", "statusline.ts");
const esc = "\u001B[";
const homes: string[] = [];
const processes: ReturnType<typeof Bun.spawn>[] = [];
let diagnostic: (() => Promise<void>) | undefined;
const renderEnv = (home: string, pwd = home): NodeJS.ProcessEnv =>
  isolatedStatuslineEnv({
    ...process.env,
    HOME: home,
    PWD: pwd,
    CODEX_SESSION_ID: "",
  });
const codexEnv = (home: string): NodeJS.ProcessEnv => ({
  ...renderEnv(home, "/fixture/codex"),
  CODEX_SESSION_ID: "pinned-a",
});

afterEach(async () => {
  diagnostic = undefined;
  for (const proc of processes.splice(0)) {
    if (proc.exitCode === null) {
      proc.kill("SIGKILL");
      await proc.exited;
    }
    proc.terminal?.close();
  }
  await Promise.all(
    homes.splice(0).map((home) => rm(home, { recursive: true, force: true })),
  );
});

async function waitUntil(
  check: () => boolean,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (check()) return true;
    await Bun.sleep(40);
  }
  const ok = check();
  if (!ok) await diagnostic?.();
  return ok;
}

function captureTimeout(
  home: string,
  proc: ReturnType<typeof Bun.spawn>,
  output: () => string,
  chunks: Buffer[],
) {
  diagnostic = async () => {
    const bytes = output();
    const path = join(home, "pty-timeout.txt");
    const bytesPath = join(home, "pty-timeout.bin");
    const report = `exitCode: ${proc.exitCode}\nsignalCode: ${proc.signalCode}\noutput: ${JSON.stringify(bytes)}\n`;
    await writeFile(path, report);
    await writeFile(bytesPath, Buffer.concat(chunks));
    const index = homes.indexOf(home);
    if (index !== -1) homes.splice(index, 1);
    console.error(
      `PTY timeout diagnostics: ${path}; raw bytes: ${bytesPath}\n${report}`,
    );
  };
}

function rollout(model: string, inputTokens: number): string {
  return (
    [
      JSON.stringify({
        type: "session_meta",
        payload: {
          id: "pinned-a",
          session_id: "pinned-a",
          cwd: "/fixture/codex",
          model: "gpt-6-luna",
          originator: "codex-tui",
        },
      }),
      JSON.stringify({
        type: "turn_context",
        payload: { model, effort: "high" },
      }),
      JSON.stringify({
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            last_token_usage: { input_tokens: inputTokens },
            model_context_window: 100000,
          },
        },
      }),
    ].join("\n") + "\n"
  );
}

function rolloutWithoutSessionId(): string {
  return (
    [
      JSON.stringify({
        type: "session_meta",
        payload: {
          cwd: "/fixture/codex",
          model: "gpt-6-luna",
          originator: "codex-tui",
        },
      }),
      JSON.stringify({
        type: "turn_context",
        payload: { model: "gpt-6-luna", effort: "high" },
      }),
    ].join("\n") + "\n"
  );
}

test.each([{ flags: ["--watch", "--thread"] }, { flags: ["--thread"] }])(
  "thread selector under a PTY renders and keeps refreshing: %j",
  async ({ flags }) => {
    const home = await mkdtemp(join(tmpdir(), "statusline-thread-home-"));
    homes.push(home);
    const day = Temporal.Now.plainDateISO();
    const directory = join(
      home,
      ".codex",
      "sessions",
      String(day.year),
      String(day.month).padStart(2, "0"),
      String(day.day).padStart(2, "0"),
    );
    await mkdir(directory, { recursive: true });
    const pinned = join(
      directory,
      "rollout-2026-10-11T00-00-00-pinned-a.jsonl",
    );
    await writeFile(pinned, rollout("gpt-6-luna", 1000));
    let output = "";
    const chunks: Buffer[] = [];
    const proc = Bun.spawn([process.execPath, script, ...flags, "pinned-a"], {
      cwd: home,
      env: renderEnv(home),
      timeout: 20000,
      terminal: {
        cols: 100,
        rows: 24,
        data: (_terminal, bytes) => {
          chunks.push(Buffer.from(bytes));
          output += Buffer.from(bytes).toString();
        },
      },
    });
    processes.push(proc);
    captureTimeout(home, proc, () => output, chunks);
    expect(
      await waitUntil(
        () =>
          output.includes("Display redraw every 5s") || proc.exitCode !== null,
        5000,
      ),
    ).toBe(true);
    expect(stripVTControlCharacters(output)).toContain("Session: pinned-a");
    expect(proc.exitCode).toBeNull();
    await writeFile(pinned, rollout("gpt-6-orbit", 54000));
    await writeFile(
      join(directory, "rollout-2026-10-11T00-00-01-newer-b.jsonl"),
      rollout("gpt-6-newer", 99000).replaceAll("pinned-a", "newer-b"),
    );
    expect(await waitUntil(() => output.includes("GPT-6-Orbit"), 8000)).toBe(
      true,
    );
    expect(output).not.toContain("GPT-6-Newer");
    expect(proc.exitCode).toBeNull();
    proc.terminal?.write(Buffer.from([3]));
    expect(await waitUntil(() => proc.exitCode !== null, 3000)).toBe(true);
    expect(proc.exitCode).toBe(130);
    expect(output).toContain(`${esc}?25h${esc}?1049l`);
  },
  20000,
);

test.each(
  [
    ["--watch", "--thread", "missing-thread"],
    ["--thread", "missing-thread"],
    ["--watch", "--thread", "pinned-a", "--cwd", "/fixture/codex"],
    ["--watch", "--thread", "pinned-a", "--pid", "1"],
    ["--watch", "--thread", "pinned-a", "--once"],
    ["--watch", "--thread", "pinned-a", "--session", "other"],
    ["--watch", "--thread", "pinned-a", "--json"],
    ["--watch", "--thread", "pinned-a", "--interval", "0"],
    ["--watch", "--thread", ""],
    ["sessions", "--thread", "pinned-a"],
    ["payload", "--thread", "pinned-a"],
  ].map((flags) => ({ flags })),
)("thread usage failures under a PTY are visible: %j", async ({ flags }) => {
  const home = await mkdtemp(join(tmpdir(), "statusline-thread-error-"));
  homes.push(home);
  let output = "";
  const chunks: Buffer[] = [];
  const proc = Bun.spawn([process.execPath, script, ...flags], {
    cwd: home,
    env: renderEnv(home),
    timeout: 5000,
    terminal: {
      cols: 100,
      rows: 24,
      data: (_terminal, bytes) => {
        chunks.push(Buffer.from(bytes));
        output += Buffer.from(bytes).toString();
      },
    },
  });
  processes.push(proc);
  captureTimeout(home, proc, () => output, chunks);
  expect(await waitUntil(() => proc.exitCode !== null, 4000)).toBe(true);
  expect(proc.exitCode).toBe(2);
  expect(output).toContain("FATAL:");
  if (flags.includes("missing-thread"))
    expect(output).toContain("missing-thread");
});

test("thread snapshots render without a TTY and explicit watch refuses a pipe", async () => {
  const home = await mkdtemp(join(tmpdir(), "statusline-thread-snapshot-"));
  homes.push(home);
  const day = Temporal.Now.plainDateISO();
  const directory = join(
    home,
    ".codex",
    "sessions",
    String(day.year),
    String(day.month).padStart(2, "0"),
    String(day.day).padStart(2, "0"),
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "rollout-2026-10-11T00-00-00-pinned-a.jsonl"),
    rollout("gpt-6-luna", 1000),
  );
  for (const flags of [
    ["--thread", "pinned-a"],
    ["--thread", "pinned-a", "--once"],
    ["--watch", "--thread", "pinned-a"],
  ]) {
    const proc = Bun.spawn([process.execPath, script, ...flags], {
      cwd: home,
      env: renderEnv(home),
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5000,
    });
    processes.push(proc);
    const [out, error, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (flags.includes("--watch")) {
      expect(code).toBe(2);
      expect(error).toContain("--watch requires a TTY");
    } else {
      expect(code).toBe(0);
      expect(stripVTControlCharacters(out)).toContain("Session: pinned-a");
      expect(error).toBe("");
    }
  }
});

test("live Codex PTY redraws changed pinned session and restores the terminal on q", async () => {
  const home = await mkdtemp(join(tmpdir(), "statusline-live-home-"));
  homes.push(home);
  const root = join(home, ".codex", "sessions");
  const day = Temporal.Now.plainDateISO();
  const directory = join(
    root,
    String(day.year),
    String(day.month).padStart(2, "0"),
    String(day.day).padStart(2, "0"),
  );
  await mkdir(directory, { recursive: true });
  const pinned = join(directory, "rollout-2026-10-11T00-00-00-pinned-a.jsonl");
  await writeFile(pinned, rollout("gpt-6-luna", 1000));
  let output = "";
  const chunks: Buffer[] = [];
  const proc = Bun.spawn(
    [process.execPath, script, "--codex", "--interval", "1"],
    {
      cwd: home,
      env: codexEnv(home),
      terminal: {
        cols: 100,
        rows: 24,
        data: (_terminal, bytes) => {
          chunks.push(Buffer.from(bytes));
          output += Buffer.from(bytes).toString();
        },
      },
    },
  );
  processes.push(proc);
  captureTimeout(home, proc, () => output, chunks);
  expect(
    await waitUntil(
      () =>
        output.includes("GPT-6-Luna") &&
        output.includes("Display redraw every 1s"),
      15000,
    ),
  ).toBe(true);
  const newer = join(directory, "rollout-2026-10-11T00-00-01-newer-b.jsonl");
  await writeFile(
    newer,
    rollout("gpt-6-newer", 99000).replaceAll("pinned-a", "newer-b"),
  );
  const newerTime = Temporal.Now.instant().epochMilliseconds / 1000 + 2;
  await utimes(newer, newerTime, newerTime);
  await writeFile(pinned, rollout("gpt-6-orbit", 54000));
  proc.terminal?.resize(40, 12);
  expect(
    await waitUntil(
      () =>
        output.includes("GPT-6-Orbit") &&
        output.split(`${esc}2J`).length - 1 >= 2,
      15000,
    ),
  ).toBe(true);
  expect(output).not.toContain("GPT-6-Newer");
  expect(output).toContain("54.0k");
  proc.terminal?.write("q");
  expect(await waitUntil(() => proc.exitCode !== null, 5000)).toBe(true);
  expect(proc.exitCode).toBe(0);
  expect(output).toContain(`${esc}?25h${esc}?1049l`);
});

test("raw Ctrl+C cancels a frame collection with exit 130 and restores terminal modes", async () => {
  const home = await mkdtemp(join(tmpdir(), "statusline-signal-home-"));
  homes.push(home);
  const now = Temporal.Now.plainDateISO();
  const directory = join(
    home,
    ".codex",
    "sessions",
    String(now.year),
    String(now.month).padStart(2, "0"),
    String(now.day).padStart(2, "0"),
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "rollout-2026-10-11T00-00-00-pinned-a.jsonl"),
    rollout("gpt-6-luna", 1000),
  );
  let output = "";
  const chunks: Buffer[] = [];
  const proc = Bun.spawn(
    [process.execPath, script, "--codex", "--interval", "1"],
    {
      cwd: home,
      env: codexEnv(home),
      terminal: {
        cols: 100,
        rows: 24,
        data: (_terminal, bytes) => {
          chunks.push(Buffer.from(bytes));
          output += Buffer.from(bytes).toString();
        },
      },
    },
  );
  processes.push(proc);
  captureTimeout(home, proc, () => output, chunks);
  expect(await waitUntil(() => output.includes(`${esc}?1049h`), 3000)).toBe(
    true,
  );
  proc.terminal?.write(Buffer.from([3]));
  expect(await waitUntil(() => proc.exitCode !== null, 3000)).toBe(true);
  expect(proc.exitCode).toBe(130);
  expect(output).toContain(`${esc}?25h${esc}?1049l`);
});

test("live Codex rejects a rollout without runtime identity", async () => {
  const home = await mkdtemp(join(tmpdir(), "statusline-no-id-home-"));
  homes.push(home);
  const day = Temporal.Now.plainDateISO();
  const directory = join(
    home,
    ".codex",
    "sessions",
    String(day.year),
    String(day.month).padStart(2, "0"),
    String(day.day).padStart(2, "0"),
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "rollout-2026-10-11T00-00-00-no-id.jsonl"),
    rolloutWithoutSessionId(),
  );
  let output = "";
  const chunks: Buffer[] = [];
  const proc = Bun.spawn([process.execPath, script, "--codex", "--watch"], {
    cwd: home,
    env: renderEnv(home, "/fixture/codex"),
    terminal: {
      cols: 100,
      rows: 24,
      data: (_terminal, bytes) => {
        chunks.push(Buffer.from(bytes));
        output += Buffer.from(bytes).toString();
      },
    },
  });
  processes.push(proc);
  captureTimeout(home, proc, () => output, chunks);
  expect(await waitUntil(() => proc.exitCode !== null, 5000)).toBe(true);
  expect(proc.exitCode).toBe(2);
  expect(output).toContain("missing Codex runtime identity");
  expect(output).not.toContain(`${esc}?1049h`);
});

test("SIGTERM exits 143 and restores terminal modes", async () => {
  const home = await mkdtemp(join(tmpdir(), "statusline-term-home-"));
  homes.push(home);
  const now = Temporal.Now.plainDateISO();
  const directory = join(
    home,
    ".codex",
    "sessions",
    String(now.year),
    String(now.month).padStart(2, "0"),
    String(now.day).padStart(2, "0"),
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "rollout-2026-10-11T00-00-00-pinned-a.jsonl"),
    rollout("gpt-6-luna", 1000),
  );
  let output = "";
  const chunks: Buffer[] = [];
  const proc = Bun.spawn(
    [process.execPath, script, "--codex", "--interval", "1"],
    {
      cwd: home,
      env: codexEnv(home),
      terminal: {
        cols: 100,
        rows: 24,
        data: (_terminal, bytes) => {
          chunks.push(Buffer.from(bytes));
          output += Buffer.from(bytes).toString();
        },
      },
    },
  );
  processes.push(proc);
  captureTimeout(home, proc, () => output, chunks);
  expect(await waitUntil(() => output.includes(`${esc}?1049h`), 3000)).toBe(
    true,
  );
  proc.kill("SIGTERM");
  expect(await waitUntil(() => proc.exitCode !== null, 3000)).toBe(true);
  expect(proc.exitCode).toBe(143);
  expect(output).toContain(`${esc}?25h${esc}?1049l`);
});

test(
  "live CLI rejects invalid interval and explicit watch without a TTY",
  async () => {
    const home = mkdtempSync(join(tmpdir(), "statusline-live-cli-"));
    homes.push(home);
    const invalid = Bun.spawnSync(
      [
        process.execPath,
        script,
        "--codex",
        "--watch",
        "--interval",
        "Infinity",
      ],
      {
        cwd: home,
        env: renderEnv(home, "/fixture/codex"),
      },
    );
    expect(invalid.exitCode).toBe(2);
    expect(invalid.stderr.toString()).toContain("finite number from 1 to 3600");
    const noTty = Bun.spawnSync(
      [process.execPath, script, "--codex", "--watch"],
      {
        cwd: home,
        env: renderEnv(home, "/fixture/codex"),
      },
    );
    expect(noTty.exitCode).toBe(2);
    expect(noTty.stderr.toString()).toContain("--watch requires a TTY");
    const positionalInterval = Bun.spawnSync(
      [process.execPath, script, "--watch", "2"],
      { cwd: home, env: renderEnv(home) },
    );
    expect(positionalInterval.exitCode).toBe(2);
    expect(positionalInterval.stderr.toString()).toContain(
      "--watch requires a TTY",
    );
    const conflict = Bun.spawnSync(
      [process.execPath, script, "--codex", "--watch", "--once"],
      { cwd: home, env: renderEnv(home) },
    );
    expect(conflict.exitCode).toBe(2);
    expect(conflict.stderr.toString()).toContain("cannot be combined");
    const day = Temporal.Now.plainDateISO();
    const directory = join(
      home,
      ".codex",
      "sessions",
      String(day.year),
      String(day.month).padStart(2, "0"),
      String(day.day).padStart(2, "0"),
    );
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "rollout-2026-10-11T00-00-00-pinned-a.jsonl"),
      rollout("gpt-6-luna", 1000),
    );
    const once = Bun.spawnSync(
      [process.execPath, script, "--codex", "--once"],
      {
        cwd: home,
        env: codexEnv(home),
      },
    );
    expect(once.exitCode).toBe(0);
    expect(once.stdout.toString().endsWith("\n")).toBe(true);
    const misplacedInterval = Bun.spawnSync(
      [process.execPath, script, "--interval", "5"],
      { cwd: home, env: renderEnv(home) },
    );
    expect(misplacedInterval.exitCode).toBe(2);
    expect(misplacedInterval.stderr.toString()).toContain(
      "requires --watch or --codex",
    );
    const nonLiveInterval = Bun.spawnSync(
      [process.execPath, script, "--codex", "--interval", "5"],
      { cwd: home, env: renderEnv(home) },
    );
    expect(nonLiveInterval.exitCode).toBe(2);
    expect(nonLiveInterval.stderr.toString()).toContain("requires live mode");
  },
  { timeout: 30_000 },
); // Seven cold CLI processes; the render latency gate is separate.
