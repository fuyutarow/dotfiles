import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isolatedStatuslineEnv } from "./helpers.ts";

const script = join(import.meta.dir, "..", "src", "statusline.ts");
const esc = "\u001B[";
const homes: string[] = [];
const processes: ReturnType<typeof Bun.spawn>[] = [];
const renderEnv = (home: string, pwd = home): NodeJS.ProcessEnv =>
  isolatedStatuslineEnv({ ...process.env, HOME: home, PWD: pwd });

afterEach(async () => {
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
  return check();
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
  const proc = Bun.spawn(
    [process.execPath, script, "--codex", "--interval", "1"],
    {
      cwd: home,
      env: renderEnv(home, "/fixture/codex"),
      terminal: {
        cols: 100,
        rows: 24,
        data: (_terminal, bytes) => {
          output += Buffer.from(bytes).toString();
        },
      },
    },
  );
  processes.push(proc);
  expect(
    await waitUntil(
      () =>
        output.includes("gpt-6-luna") && output.includes("Updated every 1s"),
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
        output.includes("gpt-6-orbit") &&
        output.split(`${esc}2J`).length - 1 >= 2,
      15000,
    ),
  ).toBe(true);
  expect(output).not.toContain("gpt-6-newer");
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
  const proc = Bun.spawn(
    [process.execPath, script, "--codex", "--interval", "1"],
    {
      cwd: home,
      env: renderEnv(home, "/fixture/codex"),
      terminal: {
        cols: 100,
        rows: 24,
        data: (_terminal, bytes) => {
          output += Buffer.from(bytes).toString();
        },
      },
    },
  );
  processes.push(proc);
  expect(await waitUntil(() => output.includes(`${esc}?1049h`), 3000)).toBe(
    true,
  );
  proc.terminal?.write(Buffer.from([3]));
  expect(await waitUntil(() => proc.exitCode !== null, 3000)).toBe(true);
  expect(proc.exitCode).toBe(130);
  expect(output).toContain(`${esc}?25h${esc}?1049l`);
});

test("live Codex rejects a selected rollout without a stable session ID", async () => {
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
  const proc = Bun.spawn([process.execPath, script, "--codex", "--watch"], {
    cwd: home,
    env: renderEnv(home, "/fixture/codex"),
    terminal: {
      cols: 100,
      rows: 24,
      data: (_terminal, bytes) => {
        output += Buffer.from(bytes).toString();
      },
    },
  });
  processes.push(proc);
  expect(await waitUntil(() => proc.exitCode !== null, 5000)).toBe(true);
  expect(proc.exitCode).toBe(2);
  expect(output).toContain("requires a session with a stable session ID");
  expect(output).toContain(`${esc}?25h${esc}?1049l`);
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
  const proc = Bun.spawn(
    [process.execPath, script, "--codex", "--interval", "1"],
    {
      cwd: home,
      env: renderEnv(home, "/fixture/codex"),
      terminal: {
        cols: 100,
        rows: 24,
        data: (_terminal, bytes) => {
          output += Buffer.from(bytes).toString();
        },
      },
    },
  );
  processes.push(proc);
  expect(await waitUntil(() => output.includes(`${esc}?1049h`), 3000)).toBe(
    true,
  );
  proc.kill("SIGTERM");
  expect(await waitUntil(() => proc.exitCode !== null, 3000)).toBe(true);
  expect(proc.exitCode).toBe(143);
  expect(output).toContain(`${esc}?25h${esc}?1049l`);
});

test("live CLI rejects invalid interval and explicit watch without a TTY", () => {
  const home = mkdtempSync(join(tmpdir(), "statusline-live-cli-"));
  homes.push(home);
  const invalid = Bun.spawnSync(
    [process.execPath, script, "--codex", "--watch", "--interval", "Infinity"],
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
  const once = Bun.spawnSync([process.execPath, script, "--codex", "--once"], {
    cwd: home,
    env: renderEnv(home, "/fixture/codex"),
  });
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
});
