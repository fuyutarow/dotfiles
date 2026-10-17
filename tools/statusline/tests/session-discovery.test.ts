import { afterEach, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AgentSessionSchema,
  discoverSessions,
  payloadForSession,
} from "../src/session-discovery.ts";
import { decodedJson } from "./decode.ts";
import { z } from "../src/zod.ts";

const roots: string[] = [];
const previousHome = process.env.HOME;
const previousProcRoot = process.env.STATUSLINE_PROC_ROOT;
afterEach(async () => {
  process.env.HOME = previousHome;
  process.env.STATUSLINE_PROC_ROOT = previousProcRoot;
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "statusline-discovery-"));
  roots.push(root);
  const home = join(root, "home");
  const proc = join(root, "proc");
  const cwd = join(root, "project");
  const elsewhere = join(root, "elsewhere");
  await Promise.all(
    [home, proc, cwd, elsewhere].map((path) =>
      mkdir(path, { recursive: true }),
    ),
  );
  process.env.HOME = home;
  process.env.STATUSLINE_PROC_ROOT = proc;
  return { root, home, proc, cwd, elsewhere };
}

async function fakeProcess(
  proc: string,
  pid: number,
  binary: string,
  cwd: string,
) {
  const directory = join(proc, String(pid));
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "cmdline"), `${binary}\0--fixture\0`);
  await symlink(cwd, join(directory, "cwd"));
}

test("finds Claude and Codex only in the selected cwd and builds recorded payload fields", async () => {
  const { home, proc, cwd, elsewhere } = await fixture();
  const claudeId = "claude-session-a";
  const claudeProject = join(
    home,
    ".claude",
    "projects",
    cwd.replaceAll("/", "-"),
  );
  const claudeSessions = join(home, ".claude", "sessions");
  await Promise.all([
    mkdir(claudeProject, { recursive: true }),
    mkdir(claudeSessions, { recursive: true }),
  ]);
  const claudeTranscript = join(claudeProject, `${claudeId}.jsonl`);
  await writeFile(
    claudeTranscript,
    `${JSON.stringify({ type: "assistant", message: { model: "claude-opus-4-8", usage: { input_tokens: 48000, output_tokens: 900 } } })}\n`,
  );
  await writeFile(
    join(claudeSessions, "101.json"),
    JSON.stringify({
      pid: 101,
      sessionId: claudeId,
      cwd,
      startedAt: 1792200000000,
      messagingSocketPath: join(home, "claude-101.sock"),
    }),
  );
  await writeFile(join(home, "claude-101.sock"), "fixture socket presence");

  const day = Temporal.Now.plainDateISO();
  const rolloutDir = join(
    home,
    ".codex",
    "sessions",
    String(day.year),
    String(day.month).padStart(2, "0"),
    String(day.day).padStart(2, "0"),
  );
  await mkdir(rolloutDir, { recursive: true });
  const codexTranscript = join(rolloutDir, "rollout-fixture.jsonl");
  await writeFile(
    codexTranscript,
    [
      JSON.stringify({
        type: "session_meta",
        payload: {
          id: "codex-session-b",
          session_id: "codex-session-b",
          cwd,
          model: "gpt-6-luna",
          originator: "codex-tui",
        },
      }),
      JSON.stringify({
        type: "turn_context",
        payload: { model: "gpt-6-luna" },
      }),
      JSON.stringify({
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            last_token_usage: { input_tokens: 21000 },
            model_context_window: 200000,
          },
        },
      }),
    ].join("\n") + "\n",
  );
  await Promise.all([
    fakeProcess(proc, 101, "/usr/bin/claude", cwd),
    fakeProcess(proc, 102, "/usr/bin/codex", cwd),
    fakeProcess(proc, 103, "/usr/bin/claude", elsewhere),
  ]);

  const sessions = await discoverSessions(cwd);
  expect(
    sessions.map(({ vendor, cwd: sessionCwd }) => [vendor, sessionCwd]),
  ).toEqual([
    ["codex", cwd],
    ["claude", cwd],
  ]);
  expect(sessions.map((session) => session.pid)).toEqual([102, 101]);
  const claude =
    sessions.find((session) => session.vendor === "claude") ??
    expect.unreachable("Claude fixture session missing");
  const payload = await payloadForSession(claude);
  const recordedSchema = z.object({
    cwd: z.string(),
    session_id: z.string(),
    model: z.object({ display_name: z.string(), id: z.string() }),
    context_window: z.object({ total_input_tokens: z.number() }),
  });
  const recorded = decodedJson(
    recordedSchema,
    await readFile(
      join(import.meta.dir, "fixtures", "claude-recorded-statusline.json"),
      "utf8",
    ),
  );
  expect({
    cwd: payload.cwd,
    session_id: payload.session_id,
    model: payload.model,
    context_window: payload.context_window,
  }).toEqual({ ...recorded, cwd });

  const script = join(import.meta.dir, "..", "src", "statusline.ts");
  const env = { ...process.env, HOME: home, STATUSLINE_PROC_ROOT: proc };
  const listed = Bun.spawnSync(
    [process.execPath, script, "sessions", "--cwd", cwd, "--json"],
    { cwd, env },
  );
  const rows = listed.stdout
    .toString()
    .trim()
    .split("\n")
    .map((line) => decodedJson(AgentSessionSchema, line));
  expect(listed.exitCode, listed.stderr.toString()).toBe(0);
  expect(rows.map((row) => row.vendor)).toEqual(["codex", "claude"]);
  expect(Object.keys(rows[0] ?? {}).toSorted()).toEqual([
    "cwd",
    "pid",
    "session_id",
    "started_at",
    "transcript_path",
    "vendor",
  ]);
  const emitted = Bun.spawnSync(
    [process.execPath, script, "payload", claudeId],
    { cwd, env },
  );
  expect(emitted.exitCode, emitted.stderr.toString()).toBe(0);
  expect(
    decodedJson(z.object({ session_id: z.string() }), emitted.stdout.toString())
      .session_id,
  ).toBe(claudeId);
  const automatic = Bun.spawnSync([process.execPath, script], { cwd, env });
  expect(automatic.exitCode, automatic.stderr.toString()).toBe(0);
  expect(automatic.stdout.toString()).toContain("claude-opus-4-8");
  expect(automatic.stdout.toString()).toContain("gpt-6-luna");
});

test("no-session invocation renders shared rows and the explicit absence line", async () => {
  const { home, cwd } = await fixture();
  const script = join(import.meta.dir, "..", "src", "statusline.ts");
  const run = Bun.spawnSync([process.execPath, script], {
    cwd,
    env: {
      ...process.env,
      HOME: home,
      PWD: cwd,
      STATUSLINE_PROC_ROOT: join(home, "proc-empty"),
      AGX_STATE_DIR: join(home, "state"),
      XDG_STATE_HOME: "",
      XDG_RUNTIME_DIR: "",
    },
  });
  const output = run.stdout.toString();
  expect(run.exitCode, run.stderr.toString()).toBe(0);
  expect(output).toContain("Rate:");
  expect(output).toContain("Sys:");
  expect(output).toContain("Job:");
  expect(output).toContain(`no agent session in ${cwd}`);
});
