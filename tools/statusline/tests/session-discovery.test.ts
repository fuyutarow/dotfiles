import { afterEach, expect, test, spyOn } from "bun:test";
import * as fs from "node:fs/promises";
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
          model: "gpt-6.1-sol",
          originator: "codex-tui",
        },
      }),
      JSON.stringify({
        type: "turn_context",
        payload: { model: "gpt-6.1-sol", effort: "medium" },
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
  await mkdir(join(proc, "102", "fd"));
  await symlink(codexTranscript, join(proc, "102", "fd", "7"));
  await symlink(codexTranscript, join(proc, "102", "fd", "8"));
  // Same cwd and valid headers must never make dormant sessions look live.
  await Promise.all(
    Array.from({ length: 3000 }, (_, i) =>
      writeFile(
        join(rolloutDir, `rollout-dormant-${i}.jsonl`),
        `${JSON.stringify({ type: "session_meta", payload: { id: `dormant-${i}`, cwd, originator: "codex-tui" } })}\n`,
      ),
    ),
  );
  await writeFile(join(claudeSessions, "999.json"), "dormant Claude session");
  await fakeProcess(proc, 104, "/bin/sh", cwd);
  await writeFile(join(proc, "104", "cmdline"), "sh\0-c\0codex claude-code\0");

  const io = { ...fs };
  const reads = spyOn(io, "readFile");
  const opens = spyOn(io, "open");
  const directories = spyOn(io, "readdir");
  const sessions = await discoverSessions(cwd, false, io);
  // Count session content opens, excluding process cmdline reads and metadata stat calls.
  expect(
    reads.mock.calls
      .map(([path]) =>
        typeof path === "string"
          ? path
          : expect.unreachable("Expected string read path"),
      )
      .filter((path) => !path.startsWith(proc)),
  ).toEqual([join(claudeSessions, "101.json")]);
  expect(opens.mock.calls.map(([path]) => String(path))).toEqual([
    codexTranscript,
  ]);
  expect(
    reads.mock.calls.filter(
      ([path]) => typeof path === "string" && !path.startsWith(proc),
    ).length + opens.mock.calls.length,
  ).toBe(2);
  expect(
    directories.mock.calls.every(([path]) => String(path).startsWith(proc)),
  ).toBe(true);
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
  const ownerPath = join(home, "owner.json");
  await writeFile(
    ownerPath,
    JSON.stringify({
      schema: 1,
      fields: {
        sessions: {
          at: Temporal.Now.instant().epochMilliseconds,
          value: sessions,
        },
      },
    }),
  );
  const env = {
    ...process.env,
    HOME: home,
    STATUSLINE_PROC_ROOT: proc,
    STATUSLINE_OWNER_STATE: ownerPath,
  };
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
  expect(automatic.stdout.toString()).toContain("Opus 4.8");
  expect(automatic.stdout.toString()).toContain("GPT-6.1-Sol");
  expect(automatic.stdout.toString()).toContain("medium");
  const output = automatic.stdout.toString();
  for (const label of ["Rate:", "Sys:", "Job:", "codex-session-b"])
    expect(output.split(label)).toHaveLength(2);
  expect(output).not.toContain("0s old");
  const selected = Bun.spawn(
    [process.execPath, script, "--session", claudeId],
    {
      cwd,
      env,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      timeout: 5000,
    },
  );
  const [selectedOutput, selectedErrors, selectedExit] = await Promise.all([
    selected.stdout.text(),
    selected.stderr.text(),
    selected.exited,
  ]);
  expect(selectedExit, selectedErrors).toBe(0);
  expect(selectedOutput).toContain(claudeId);
  expect(selectedOutput).not.toContain("codex-session-b");

  // Desktop sessions belong to their rollout cwd, not the app-server's cwd.
  await fs.unlink(join(proc, "102", "cwd"));
  await symlink(elsewhere, join(proc, "102", "cwd"));
  await writeFile(join(proc, "102", "cmdline"), "codex\0app-server\0");
  const desktopHeader = JSON.stringify({
    type: "session_meta",
    payload: {
      id: "codex-desktop",
      cwd,
      originator: "Codex Desktop",
      instructions: "x".repeat(100000),
    },
  });
  await writeFile(codexTranscript, `${desktopHeader}\n`);
  expect(
    (await discoverSessions(cwd)).map((session) => session.session_id),
  ).toContain("codex-desktop");
  await writeFile(
    join(proc, "101", "cmdline"),
    "node\0/opt/node_modules/@anthropic-ai/claude-code/cli.js\0",
  );
  await fs.unlink(join(proc, "102", "fd", "7"));
  await fs.unlink(join(proc, "102", "fd", "8"));
  expect(
    (await discoverSessions(cwd)).map((session) => session.vendor),
  ).toEqual(["claude"]);
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

test("Claude stdin payload performs no process discovery", async () => {
  const { root, home, cwd } = await fixture();
  const preload = join(root, "observe-proc.ts");
  await writeFile(
    preload,
    `
    import { mock } from "bun:test";
    import * as fs from "node:fs/promises";
    const read = fs.readdir;
    mock.module("node:fs/promises", () => ({ ...fs, readdir: (...args) => {
      if (String(args[0]).includes("discovery-proc")) process.stderr.write("DISCOVERY_RAN");
      return read(...args);
    } }));
  `,
  );
  const child = Bun.spawn(
    [
      process.execPath,
      "--preload",
      preload,
      join(import.meta.dir, "../src/statusline.ts"),
    ],
    {
      cwd,
      env: {
        ...process.env,
        HOME: home,
        PATH: "",
        STATUSLINE_PROC_ROOT: join(root, "discovery-proc"),
      },
      stdin: new Blob([
        JSON.stringify({ cwd, model: { display_name: "stdin-only" } }),
      ]),
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [output, errors, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(exit, errors).toBe(0);
  expect(output).toContain("stdin-only");
  expect(errors).not.toContain("DISCOVERY_RAN");
});

test("primary rollout wins over a newer auto-review carrying the same session ID", async () => {
  const { root, proc, cwd } = await fixture();
  await fakeProcess(proc, 201, "/usr/bin/codex", cwd);
  await mkdir(join(proc, "201/fd"));
  const primary = join(root, "rollout-primary.jsonl");
  const auxiliary = join(root, "rollout-auxiliary.jsonl");
  await writeFile(
    primary,
    JSON.stringify({
      type: "session_meta",
      payload: { id: "primary", cwd, timestamp: "2026-10-17T10:00:00Z" },
    }) + "\n",
  );
  await writeFile(
    auxiliary,
    JSON.stringify({
      type: "session_meta",
      payload: {
        id: "auxiliary",
        session_id: "primary",
        cwd,
        timestamp: "2026-10-17T11:00:00Z",
      },
    }) + "\n",
  );
  await symlink(primary, join(proc, "201/fd/7"));
  await symlink(auxiliary, join(proc, "201/fd/8"));
  const sessions = await discoverSessions(cwd);
  expect(sessions).toHaveLength(1);
  expect(sessions[0]?.transcript_path).toBe(primary);
});
