import { afterAll, expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FleetSessionSchema,
  readFleetSession,
} from "@dotfiles/shared/src/fleet-session.ts";
import { writeStatuslineFleetSession } from "../src/fleet-session.ts";

const root = await mkdtemp(join(tmpdir(), "fleet-session-writer-"));
afterAll(() => rm(root, { recursive: true, force: true }));

test("Claude status writes its normalized statusline facts atomically", async () => {
  const runtime = join(root, "claude-runtime");
  const priorRuntime = process.env["XDG_RUNTIME_DIR"];
  const priorExe = process.env["CLAUDE_CODE_EXECPATH"];
  process.env["XDG_RUNTIME_DIR"] = runtime;
  process.env["CLAUDE_CODE_EXECPATH"] = join(root, "missing-claude");
  using _env = {
    [Symbol.dispose]: () => {
      if (priorRuntime === undefined) delete process.env["XDG_RUNTIME_DIR"];
      else process.env["XDG_RUNTIME_DIR"] = priorRuntime;
      if (priorExe === undefined) delete process.env["CLAUDE_CODE_EXECPATH"];
      else process.env["CLAUDE_CODE_EXECPATH"] = priorExe;
    },
  };

  await writeStatuslineFleetSession(
    {
      sessionId: "claude-session",
      sessionName: "hint-only",
      cwd: "/work/example-project",
      model: { name: "Claude Example" },
      effort: "high",
      context: { inputTokens: 1200, usedPercent: 12.5 },
      rateLimits: {
        fiveHour: { usedPercent: 10, resetsAt: 1_800_000_000 },
        sevenDay: { usedPercent: 25, resetsAt: 1_800_000_000 },
      },
    },
    "claude",
    "dotfiles-agt_fixture",
  );

  const stored = await readFleetSession("claude-session", {
    XDG_RUNTIME_DIR: runtime,
  });
  expect(stored).toMatchObject({
    schema: 1,
    session_id: "claude-session",
    vendor: "claude",
    name: "dotfiles-agt_fixture",
    model: "Claude Example",
    effort: "high",
    ctx: { tokens: 1200, pct: 12.5 },
    rate: {
      five_h_pct: 10,
      seven_d_pct: 25,
      resets: "5h=2027-01-15T08:00:00Z;7d=2027-01-15T08:00:00Z",
    },
    cwd: "/work/example-project",
    pane_id: null,
  });
  const parsedStored = FleetSessionSchema.safeParse(stored);
  if (parsedStored.success)
    expect(parsedStored.data.updated_at).toMatch(/^\d{4}-\d\d-\d\dT/u);
  expect(await readdir(join(runtime, "fleet", "sessions"))).toEqual([
    "claude-session.json",
  ]);
});

test("Codex rollout status is written with explicit unavailable provider fields", async () => {
  const runtime = join(root, "codex-runtime");
  const priorRuntime = process.env["XDG_RUNTIME_DIR"];
  process.env["XDG_RUNTIME_DIR"] = runtime;
  using _env = {
    [Symbol.dispose]: () => {
      if (priorRuntime === undefined) delete process.env["XDG_RUNTIME_DIR"];
      else process.env["XDG_RUNTIME_DIR"] = priorRuntime;
    },
  };
  await writeStatuslineFleetSession(
    {
      sessionId: "codex-thread",
      cwd: "/work/codex-project",
      model: { name: "gpt-example" },
      effort: "medium",
      context: { inputTokens: 800, usedPercent: 8 },
    },
    "codex",
  );
  const stored = await readFleetSession("codex-thread", {
    XDG_RUNTIME_DIR: runtime,
  });
  expect(stored).toMatchObject({
    vendor: "codex",
    name: { na: true, why: "Codex rollout has no addressable agent name" },
    model: "gpt-example",
    effort: "medium",
    ctx: { tokens: 800, pct: 8 },
    rate: { na: true },
    cwd: "/work/codex-project",
  });
  expect(
    await readFile(join(runtime, "fleet/sessions/codex-thread.json"), "utf8"),
  ).toContain('"schema":1');
});

test("Claude statusline payload writes the session handoff on the entrypoint", async () => {
  const home = join(root, "entry-home");
  const runtime = join(root, "entry-runtime");
  const cwd = join(root, "entry-project");
  const claudeBin = join(root, "claude-fixture");
  const agentFixture = join(import.meta.dir, "fixtures/claude-agents.json");
  await Promise.all([
    mkdir(join(home, ".claude"), { recursive: true }),
    mkdir(cwd, { recursive: true }),
  ]);
  await writeFile(claudeBin, '#!/bin/sh\ncat "$STATUSLINE_AGENT_FIXTURE"\n');
  await chmod(claudeBin, 0o755);
  const child = Bun.spawn(
    [process.execPath, join(import.meta.dir, "../src/statusline-main.ts")],
    {
      env: {
        ...process.env,
        HOME: home,
        PWD: cwd,
        XDG_RUNTIME_DIR: runtime,
        HERDR_ENV: "1",
        CLAUDE_CODE_EXECPATH: claudeBin,
        STATUSLINE_AGENT_FIXTURE: agentFixture,
      },
      stdin: new Blob([
        JSON.stringify({
          session_id: "entrypoint-session",
          session_name: "statusline-title-hint",
          cwd,
          model: { display_name: "Claude Entry" },
          effort: { level: "low" },
          context_window: {
            total_input_tokens: 100,
            used_percentage: 12,
          },
        }),
      ]),
      stdout: "pipe",
      stderr: "pipe",
      timeout: 20000,
    },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code, stderr).toBe(0);
  expect(stdout).toContain("Claude Entry");
  expect(
    await readFleetSession("entrypoint-session", { XDG_RUNTIME_DIR: runtime }),
  ).toMatchObject({
    vendor: "claude",
    session_id: "entrypoint-session",
    cwd,
    model: "Claude Entry",
    name: "dotfiles-agt_g67e",
    effort: "low",
    ctx: { tokens: 100, pct: 12 },
  });
});

test("Codex rollout selection writes its session handoff on the entrypoint", async () => {
  const home = join(root, "codex-entry-home");
  const runtime = join(root, "codex-entry-runtime");
  const cwd = join(root, "codex-entry-project");
  const sessionId = "codex-entry-session";
  const today = Temporal.Now.plainDateISO();
  const sessionDir = join(
    home,
    ".codex/sessions",
    String(today.year),
    String(today.month).padStart(2, "0"),
    String(today.day).padStart(2, "0"),
  );
  await mkdir(sessionDir, { recursive: true });
  await mkdir(cwd, { recursive: true });
  await Bun.write(
    join(sessionDir, `rollout-test-${sessionId}.jsonl`),
    [
      JSON.stringify({
        type: "session_meta",
        payload: {
          id: sessionId,
          cwd,
          model: "gpt-entry",
          originator: "codex-tui",
        },
      }),
      JSON.stringify({
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            last_token_usage: { input_tokens: 100 },
            model_context_window: 1000,
          },
        },
      }),
    ].join("\n") + "\n",
  );
  const child = Bun.spawn(
    [
      process.execPath,
      join(import.meta.dir, "../src/statusline-main.ts"),
      "--codex",
      "--cwd",
      cwd,
      "--once",
    ],
    {
      env: { ...process.env, HOME: home, PWD: cwd, XDG_RUNTIME_DIR: runtime },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 20000,
    },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code, stderr).toBe(0);
  expect(stdout).toContain("GPT-Entry");
  expect(
    await readFleetSession(sessionId, { XDG_RUNTIME_DIR: runtime }),
  ).toMatchObject({
    vendor: "codex",
    session_id: sessionId,
    cwd,
    model: "gpt-entry",
    ctx: { tokens: 100, pct: 10 },
  });
});
