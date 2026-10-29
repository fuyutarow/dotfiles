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
  darwinProcessSource,
  payloadForSession,
} from "../src/session-discovery.ts";

test("Darwin source discovers live Claude and Codex using injected commands", async () => {
  const { root, home, cwd } = await fixture();
  const sessionsDir = join(home, ".claude/sessions");
  const project = join(home, ".claude/projects", cwd.replaceAll("/", "-"));
  await mkdir(sessionsDir, { recursive: true });
  await mkdir(project, { recursive: true });
  const socket = join(root, "socket");
  await writeFile(socket, "socket");
  await writeFile(
    join(sessionsDir, "101.json"),
    JSON.stringify({
      sessionId: "claude-a",
      cwd,
      startedAt: 1792200000000,
      messagingSocketPath: socket,
    }),
  );
  await writeFile(join(project, "claude-a.jsonl"), "{}\n");
  const rollout = join(root, "rollout-test.jsonl");
  await writeFile(
    rollout,
    JSON.stringify({
      type: "session_meta",
      payload: { id: "codex-b", cwd, timestamp: "2026-10-17T10:00:00Z" },
    }) + "\n",
  );
  const source = darwinProcessSource((args) => {
    if (args[0] === "ps")
      return Promise.resolve({
        output:
          " 101 /usr/bin/claude\n 102 /usr/bin/codex\n 103 /bin/sh -c codex\n",
      });
    if (args.includes("cwd"))
      return Promise.resolve({ output: `p${args[3]}\nfcwd\nn${cwd}\n` });
    return Promise.resolve({ output: `p102\nf7\nn${rollout}\n` });
  });
  const found = await discoverSessions(cwd, false, fs, source);
  expect(found.map((row) => row.session_id).toSorted()).toEqual([
    "claude-a",
    "codex-b",
  ]);
  expect(found.map((row) => row.pid).toSorted((a, b) => a - b)).toEqual([
    101, 102,
  ]);
  expect(
    await discoverSessions(cwd, false, fs, {
      rows: () => Promise.resolve([]),
      files: () => Promise.resolve([]),
    }),
  ).toEqual([]);
  let reason: string | undefined;
  await discoverSessions(
    cwd,
    false,
    fs,
    darwinProcessSource(() => Promise.resolve({ error: "ps unavailable" })),
    (error) => {
      reason = error;
    },
  );
  expect(reason).toBe("ps unavailable");
});
import { decodedJson } from "./decode.ts";
import { z } from "../src/zod.ts";
import { ESC } from "../src/ansi.ts";
import { encodePresentation, presentation } from "../src/presentation.ts";
import { version } from "../package.json";
import {
  readCodexPinnedSessionStatus,
  readCodexThreadStatus,
  readCodexSessionStatus,
} from "../src/adapters/codex-rollout.ts";

const roots: string[] = [];
const previousHome = process.env["HOME"];
const previousProcRoot = process.env["STATUSLINE_PROC_ROOT"];
const previousCodexSessionId = process.env["CODEX_SESSION_ID"];
const previousOwnerState = process.env["STATUSLINE_OWNER_STATE"];
afterEach(async () => {
  process.env["HOME"] = previousHome;
  process.env["STATUSLINE_PROC_ROOT"] = previousProcRoot;
  process.env["CODEX_SESSION_ID"] = previousCodexSessionId;
  process.env["STATUSLINE_OWNER_STATE"] = previousOwnerState;
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
  process.env["HOME"] = home;
  process.env["STATUSLINE_PROC_ROOT"] = proc;
  return { root, home, proc, cwd, elsewhere };
}

async function fakeProcess(
  proc: string,
  pid: number,
  binary: string,
  cwd: string,
  generation = "100",
) {
  const directory = join(proc, String(pid));
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(join(directory, "cmdline"), `${binary}\0--fixture\0`),
    writeFile(
      join(directory, "stat"),
      `${pid} (fixture) S ${Array.from({ length: 18 }, () => "0").join(" ")} ${generation}\n`,
    ),
  ]);
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
    "process_generation",
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
  expect(automatic.stdout.toString()).toContain("Codex (transcript)");
  expect(automatic.stdout.toString()).toContain("Claude (transcript)");
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

  // A misplaced Claude payload under the Codex key must never supply selected facts.
  await writeFile(
    ownerPath,
    JSON.stringify({
      schema: 1,
      fields: {
        sessions: {
          at: Temporal.Now.instant().epochMilliseconds,
          value: sessions,
        },
        "session:codex-session-b": {
          at: Temporal.Now.instant().epochMilliseconds,
          value: {
            cwd,
            sessionId: claudeId,
            model: { name: "claude-opus-5-5" },
            context: { inputTokens: 678354 },
          },
        },
      },
    }),
  );
  for (const flags of [["--session", "codex-session-b"], []]) {
    const picked = Bun.spawnSync([process.execPath, script, ...flags], {
      cwd,
      env,
    });
    const body = picked.stdout.toString();
    expect(picked.exitCode, picked.stderr.toString()).toBe(0);
    expect(body).toContain("Codex (transcript)");
    expect(body).toContain("codex-session-b");
    expect(body).toContain("GPT-6.1-Sol");
    expect(body).toContain("21.0k");
    const plain = body.replaceAll(new RegExp(`${ESC}\\[[0-9;]*m`, "gu"), "");
    expect(
      plain.split("\n").find((line) => line.startsWith("Codex (transcript)")),
    ).toBe(
      (
        await readFile(
          join(import.meta.dir, "fixtures/selected-codex-source.txt"),
          "utf8",
        )
      ).trim(),
    );
    if (flags.length > 0) {
      expect(body).not.toContain("Opus");
      expect(body).not.toContain(claudeId);
      expect(body).not.toContain("input has no Claude");
    }
  }
  const unbound = Bun.spawnSync(
    [process.execPath, script, "--codex", "--cwd", cwd],
    {
      cwd,
      env: { ...env, CODEX_SESSION_ID: "" },
    },
  );
  expect(unbound.exitCode).toBe(2);
  expect(unbound.stderr.toString()).toContain("missing Codex runtime identity");
  expect(unbound.stdout.toString()).not.toContain("GPT");
  // Exact-ID lookup either returns a session or exits with a diagnostic; it has
  // no successful "session absent" state and must never fall back to the cwd.
  for (const flags of [
    ["--thread", "absent-exact-session"],
    ["--codex", "--cwd", cwd],
  ]) {
    const absent = Bun.spawnSync([process.execPath, script, ...flags], {
      cwd,
      env: { ...env, CODEX_SESSION_ID: "absent-exact-session" },
    });
    expect(absent.exitCode).toBe(2);
    expect(absent.stderr.toString()).toContain("absent-exact-session");
    expect(absent.stdout.toString()).toBe("");
  }
  const conflicting = Bun.spawnSync(
    [process.execPath, script, "--codex", "--session", claudeId],
    { cwd, env },
  );
  expect(conflicting.exitCode).toBe(2);
  expect(conflicting.stderr.toString()).toContain("use --thread ID");
  const wrongStdin = Bun.spawnSync(
    [process.execPath, script, "--session", "codex-session-b"],
    {
      cwd,
      env,
      stdin: Buffer.from(
        JSON.stringify({
          cwd,
          session_id: claudeId,
          model: { display_name: "Opus 5.5" },
        }),
      ),
    },
  );
  expect(wrongStdin.exitCode).toBe(2);
  expect(wrongStdin.stderr.toString()).toContain(
    "stdin session does not match",
  );
  expect(wrongStdin.stdout.toString()).toBe("");

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
  // This integration test writes 3000 fixtures and invokes several real CLIs.
}, 30_000);

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
  expect(output).toContain("Claude (stdin)");
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

test("exact Desktop identity survives a newer auxiliary rollout and same-cwd session", async () => {
  const { home, cwd } = await fixture();
  const day = Temporal.Now.plainDateISO();
  const root = join(home, ".codex/sessions");
  const dir = join(
    root,
    String(day.year),
    String(day.month).padStart(2, "0"),
    String(day.day).padStart(2, "0"),
  );
  await mkdir(dir, { recursive: true });
  for (const [id, sessionId, model, tokens] of [
    ["desktop-owner", "desktop-owner", "gpt-6.1-sol", 21000],
    ["auxiliary", "desktop-owner", "gpt-6-luna", 99000],
    ["same-cwd-newer", "same-cwd-newer", "gpt-6-luna", 88000],
  ] as const) {
    await writeFile(
      join(dir, `rollout-fixture-${id}.jsonl`),
      [
        {
          type: "session_meta",
          payload: {
            id,
            session_id: sessionId,
            cwd,
            originator: "Codex Desktop",
          },
        },
        { type: "turn_context", payload: { model, effort: "medium" } },
        {
          type: "event_msg",
          payload: {
            type: "token_count",
            info: {
              last_token_usage: { input_tokens: tokens },
              model_context_window: 200000,
            },
          },
        },
      ]
        .map((row) => JSON.stringify(row))
        .join("\n") + "\n",
    );
  }
  for (const read of [readCodexThreadStatus, readCodexPinnedSessionStatus]) {
    const selected = await read("desktop-owner", root);
    expect(selected?.sessionId).toBe("desktop-owner");
    expect(selected?.model?.name).toBe("gpt-6.1-sol");
    expect(selected?.context?.inputTokens).toBe(21000);
    expect(selected?.context?.usedPercent).toBe(10.5);
  }
  process.env["CODEX_SESSION_ID"] = "";
  expect(await readCodexSessionStatus(cwd, root)).toBeUndefined();
  process.env["CODEX_SESSION_ID"] = "desktop-owner";
  expect((await readCodexSessionStatus(cwd, root))?.sessionId).toBe(
    "desktop-owner",
  );
});

test("prepared displays require source labels protocol and report sample age separately", async () => {
  const { home, proc, cwd } = await fixture();
  process.env["STATUSLINE_OWNER_STATE"] = join(home, "owner.json");
  await fakeProcess(proc, 301, "/usr/bin/codex", cwd);
  const view = encodePresentation({
    schema: 1,
    version,
    at: Temporal.Now.instant().epochMilliseconds - 59000,
    rows: [
      {
        cwd,
        location: "location",
        shared: "Rate: codex sampler",
        runSource: {
          kind: "current",
          capturedAt: Temporal.Now.instant().epochMilliseconds - 59000,
        },
        sessions: [
          {
            id: "selected",
            pid: 301,
            process_generation: "100",
            line: "Codex (transcript) | Session: selected",
          },
        ],
      },
    ],
  });
  const path = `${process.env["STATUSLINE_OWNER_STATE"]}.view`;
  await writeFile(
    path,
    view.replace(
      "session-inventory-worker-scope-v4",
      "session-inventory-worker-scope-v3",
    ),
  );
  expect(await presentation(cwd)).toBeUndefined();
  await writeFile(path, view);
  const output = await presentation(cwd);
  expect(output).toContain("Codex (transcript) | Session: selected");
  expect(output).toContain("samples 59s old");
  // Shared repository rows cannot be reused for a selected session's display.
  expect(await presentation(cwd, "selected")).toBeUndefined();
});

test("prepared membership rejects a reused PID instead of retaining its old shared scope", async () => {
  const { home, proc, cwd } = await fixture();
  process.env["STATUSLINE_OWNER_STATE"] = join(home, "owner.json");
  await Promise.all([
    fakeProcess(proc, 401, "/usr/bin/codex", cwd, "401"),
    fakeProcess(proc, 402, "/usr/bin/codex", cwd, "402"),
  ]);
  const at = Temporal.Now.instant().epochMilliseconds;
  await writeFile(
    `${process.env["STATUSLINE_OWNER_STATE"]}.view`,
    encodePresentation({
      schema: 1,
      version,
      at,
      rows: [
        {
          cwd,
          location: "location",
          shared: "old worker scope",
          runSource: { kind: "current", capturedAt: at },
          sessions: [
            {
              id: "A",
              pid: 401,
              process_generation: "401",
              line: "Session: A",
            },
            {
              id: "B",
              pid: 402,
              process_generation: "402",
              line: "Session: B",
            },
          ],
        },
      ],
    }),
  );
  expect(await presentation(cwd)).toContain("Session: B");
  await writeFile(
    join(proc, "402", "stat"),
    `402 (replacement) S ${Array.from({ length: 18 }, () => "0").join(" ")} 999\n`,
  );
  expect(await presentation(cwd)).toBeUndefined();
});
