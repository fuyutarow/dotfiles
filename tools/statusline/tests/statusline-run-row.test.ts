import { createConsola } from "consola";

import { agxJobRunsAsync } from "./support/job-runs.ts";
import { afterAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync as writeFile,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fromThrowable } from "neverthrow";
// Historical marker strings are fixture inputs only, never a production schema.
const serializeActiveMarker = (value: unknown) => ({
  success: true,
  text: JSON.stringify(value),
});
import { agxRouteRunsAsync } from "../src/dispatch-runs.ts";
const FixtureObject = z.record(z.string(), z.unknown());
import { decodedJson } from "./decode.ts";
import {
  coreSnapshot,
  isolatedStatuslineEnv,
  seedAgxSnapshot,
} from "./helpers.ts";
import { jsonOf, z } from "../src/zod.ts";
import { fleetLine } from "../src/fleet-line.ts";
import {
  deadOwnMarker,
  malformedMarker,
  ownFreshMarker,
  ownResumedMarker,
  unreadableMarker,
} from "../../shared/tests/fixtures/active-markers.ts";

// The legacy enriched Run rows (no "Run:" head; each line starts with its row id): agx's running workers, read from its markers
// (the released agx-worker command). One line per live worker (row, elapsed time, label), the
// longest-running first; a marker whose process is gone is counted as stale, never hidden; more
// than RUN_LINES workers say `+N more`; no state dir at all means no row.

const STATUSLINE = join(import.meta.dir, "route-render-fixture.ts");
const scratch = mkdtempSync(join(tmpdir(), "statusline-run-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});
const bin = join(scratch, "bin");
mkdirSync(bin);
for (const [name, body] of Object.entries({
  claude: "echo '[]'",
  agx: 'if [ -n "$AGX_LOG" ]; then printf x >> "$AGX_LOG"; fi; printf "%s\\n" "${AGX_JSON:-[]}"',
  ps: "printf '%s\\n' \"${PS_OUTPUT:-}\"",
  git: "echo 'fatal: not a git repository' >&2; exit 128",
})) {
  const path = join(bin, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
}
const SESSION = "00000000-0000-0000-0000-000000000000";
const TestMarkerSchema = z.object({
  run_id: z.string().optional(),
  pid: z.number(),
  label: z.string(),
  choice: z.string(),
  pick_source: z.string().optional(),
  phase: z.string().optional(),
  cost_usd: z.number().optional(),
  dispatcher_session: z.string().nullable().optional(),
  worker_session: z.string().nullable().optional(),
  started_at: z.string(),
  cwd: z.string().optional(),
});
const ANSI = new RegExp(`${String.fromCodePoint(27)}\\[[0-9;]*m`, "gu");
const PAYLOAD = JSON.stringify({
  session_id: SESSION,
  cwd: scratch,
  workspace: { current_dir: scratch },
  model: { id: "claude-opus-5-5", display_name: "Opus 5.5" },
});

function marker(
  dir: string,
  name: string,
  pid: number,
  label: string,
  ageS = 90,
  dispatcherSession: string | null = SESSION,
  choice = "luna-high",
  pickSource = "jev",
  displayId?: string,
  phase?: string,
): void {
  mkdirSync(join(dir, "active"), { recursive: true });
  writeFileSync(
    join(dir, "active", `${name}.json`),
    JSON.stringify({
      schema: 1,
      run_id: name,
      ...(displayId === undefined ? {} : { display_id: displayId }),
      ...(phase === undefined ? {} : { phase }),
      pid,
      label,
      choice,
      pick_source: pickSource,
      started_at: Temporal.Now.instant().subtract({ seconds: ageS }).toString(),
      cwd: scratch,
      ...(dispatcherSession === null
        ? {}
        : { dispatcher_session: dispatcherSession }),
      ticket: { writes: ["tools/statusline/**"] },
    }),
  );
}

const progress = (last: string, ageS: number, session?: string): string =>
  JSON.stringify({
    schema: 1,
    at: Temporal.Now.instant().subtract({ seconds: ageS }).toString(),
    last,
    commands: 12,
    files: 3,
    ...(session === undefined ? {} : { session }),
  });

const tokenLine = (
  input: number,
  cached: number,
  output: number,
  reasoning: number,
): string =>
  JSON.stringify({
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        total_token_usage: {
          input_tokens: input,
          cached_input_tokens: cached,
          output_tokens: output,
          reasoning_output_tokens: reasoning,
          total_tokens: input + output + reasoning,
        },
      },
    },
  });

function listedProgress(path: string) {
  if (!existsSync(path)) return null;
  const parsed = jsonOf(FixtureObject).safeParse(readFileSync(path, "utf8"));
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    cost_usd: parsed.data["cost_usd"] ?? null,
    session: parsed.data["session"] ?? null,
  };
}

async function render(
  stateDir?: string,
  xdgStateHome?: string,
  dispatcherSession?: string,
  agxJson?: string,
  psOutput?: string,
  home = scratch,
): Promise<string> {
  const active = stateDir === undefined ? undefined : join(stateDir, "active");
  const agxRows =
    agxJson ??
    JSON.stringify(
      active === undefined || !existsSync(active)
        ? []
        : readdirSync(active)
            .filter(
              (name) =>
                name.endsWith(".json") && !name.endsWith(".progress.json"),
            )
            .flatMap((name) => {
              const path = join(active, name);
              const checked = jsonOf(TestMarkerSchema).safeParse(
                readFileSync(path, "utf8"),
              );
              if (!checked.success) return [{}];
              const source = checked.data;
              const id = source.run_id ?? name.replace(/\.json$/u, "");
              const alive = fromThrowable((pid: number) =>
                process.kill(pid, 0),
              )(source.pid).isOk();
              const progressPath = join(active, `${id}.progress.json`);
              let vendorSession = source.worker_session ?? null;
              let lastProgressPath: string | null = null;
              let state = "ended";
              let outcome: string | null = "lost";
              if (alive) {
                state = "running";
                outcome = null;
              }
              let continues: string | null = null;
              let health: string | null = null;
              if (!alive) health = "orphaned";
              if (source.pick_source === "resume") continues = "previous";
              if (existsSync(progressPath)) {
                const progressText = readFileSync(progressPath, "utf8");
                const progressInfo = jsonOf(
                  z.object({ session: z.string().optional() }),
                ).safeParse(progressText);
                if (progressInfo.success) {
                  vendorSession ??= progressInfo.data.session ?? null;
                  lastProgressPath = progressPath;
                }
              }
              return [
                {
                  progress: listedProgress(progressPath),
                  elapsed_seconds: Math.max(
                    0,
                    Math.floor(
                      Temporal.Now.instant()
                        .since(Temporal.Instant.from(source.started_at))
                        .total("seconds"),
                    ),
                  ),
                  id,
                  ticket: source.label,
                  state,
                  outcome,
                  health,
                  row: source.choice,
                  exit: null,
                  cwd: source.cwd ?? scratch,
                  workspace: source.cwd ?? scratch,
                  writes: ["tools/statusline/**"],
                  judgment: null,
                  report_path: null,
                  pick_source: source.pick_source,
                  phase: source.phase,
                  cost_usd: source.cost_usd,
                  dispatcher_session: source.dispatcher_session ?? null,
                  vendor_session: vendorSession,
                  started_at: source.started_at,
                  continues,
                  last_progress_path: lastProgressPath,
                  verify: [],
                },
              ];
            }),
    );
  const renderEnv = isolatedStatuslineEnv({
    HOME: home,
    PATH: bin,
    TZ: "UTC",
    AGX_STATE_DIR: stateDir,
    XDG_STATE_HOME: xdgStateHome,
  });
  seedAgxSnapshot(
    renderEnv,
    coreSnapshot(agxRows, Temporal.Now.instant().epochMilliseconds),
  );
  const p = Bun.spawn([process.execPath, STATUSLINE], {
    stdin: new Blob([PAYLOAD]),
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...renderEnv,
      ...(dispatcherSession === undefined
        ? {}
        : {
            AGX_DISPATCHER_SESSION: dispatcherSession,
            CLAUDE_CODE_SESSION_ID: "environment-session-mismatch",
          }),
      AGX_JSON: agxRows,
      ...(psOutput === undefined ? {} : { PS_OUTPUT: psOutput }),
    },
    timeout: 30_000,
  });
  const out = await new Response(p.stdout).text();
  const stderr = await new Response(p.stderr).text();
  const exitCode = await p.exited;
  expect(exitCode, stderr).toBe(0);
  return out.replace(ANSI, "");
}

describe("legacy enriched Run row", () => {
  test("accepts captured released agx 1.4.0 C2 rows", async () => {
    const dir = join(scratch, "captured-agx-ls-sample");
    const stateDir = join(dir, "state");
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, "records.jsonl"), "");
    const rows = await Bun.file(
      join(import.meta.dir, "fixtures", "agx-c2-1.4.0.json"),
    ).text();
    const env = isolatedStatuslineEnv({
      HOME: dir,
      PATH: bin,
      XDG_STATE_HOME: join(dir, "xdg"),
      AGX_STATE_DIR: stateDir,
      AGX_JSON: rows,
    });
    seedAgxSnapshot(env, {
      output: rows,
      capturedAt: Temporal.Now.instant().epochMilliseconds,
    });
    const scan = await agxRouteRunsAsync(env);
    expect(scan.unreadable).toBe(0);
    expect(scan.runs.filter((run) => !run.alive)).toHaveLength(0);
  });

  test("late count comes from the published core summary, not row metadata", async () => {
    const late = {
      at: "2026-10-19T00:01:00Z",
      first_return_s: 60,
      elapsed: 61,
    };
    const row = {
      id: "legacy",
      ticket: "legacy",
      state: "running",
      row: "luna-high",
      dispatcher_session: SESSION,
      started_at: "2026-10-18T00:00:00Z",
      late,
    };
    const dir = join(scratch, "published-late-summary");
    const env = isolatedStatuslineEnv({ HOME: scratch, AGX_STATE_DIR: dir });
    for (const [count, expected] of [
      [7, "late 7 (agx worker ls)"],
      [0, ""],
      [undefined, ""],
    ] as const) {
      seedAgxSnapshot(env, {
        output: JSON.stringify({
          runs: [row],
          summary: {
            late: count,
            running: 1,
            unattributed: 0,
            sessions: { [SESSION]: { here: 1, other: 0 } },
            noSession: { here: 0, other: 1 },
          },
        }),
        capturedAt: Temporal.Now.instant().epochMilliseconds,
      });
      const scan = await agxRouteRunsAsync(env, SESSION);
      expect(scan.late).toBe(count);
      expect(fleetLine(scan)).toBe(expected);
    }
  });

  test("renders worker and workspace names from an agx worker run record", async () => {
    const row = {
      id: "named-run",
      ticket: "fixture-ticket",
      state: "running",
      row: "luna-high",
      dispatcher_session: SESSION,
      started_at: Temporal.Now.instant().subtract({ seconds: 5 }).toString(),
      worker_name: "agt_systemd-unit",
      workspace_name: "ws_fixture",
    };
    const out = await render(
      undefined,
      undefined,
      SESSION,
      JSON.stringify([row]),
    );
    expect(out).toContain("agt_systemd-unit@ws_fixture tkt_fixture-ticket");
  });

  test.each([false, true])(
    "renders released progress and cost (future field: %s)",
    async (future) => {
      const dir = join(scratch, `real-shaped-progress-${future}`);
      const session = "real-shaped-rollout-session";
      marker(
        dir,
        "real",
        process.pid,
        "live progress",
        10,
        SESSION,
        "sol-high",
        "fixture",
        undefined,
        "working",
      );
      const active = join(dir, "active");
      const progressPath = join(active, "real.progress.json");
      copyFileSync(
        join(import.meta.dir, "fixtures", "live-progress.json"),
        progressPath,
      );
      const sidecar = decodedJson(
        FixtureObject,
        await Bun.file(progressPath).text(),
      );
      writeFileSync(
        progressPath,
        JSON.stringify({
          ...sidecar,
          cost_usd: 2.74,
          at: Temporal.Now.instant().toString(),
          ...(future ? { future_progress_field: { events: 84 } } : {}),
        }),
      );
      const day = Temporal.Now.plainDateISO("UTC");
      const rolloutDir = join(
        scratch,
        ".codex",
        "sessions",
        String(day.year),
        String(day.month).padStart(2, "0"),
        String(day.day).padStart(2, "0"),
      );
      mkdirSync(rolloutDir, { recursive: true });
      copyFileSync(
        join(import.meta.dir, "fixtures", "live-rollout.jsonl"),
        join(rolloutDir, `rollout-fixture-${session}.jsonl`),
      );
      const line = (await render(dir))
        .split("\n")
        .find((value) => value.startsWith("sol-high "));
      expect(line).toContain(
        "working · $ bun test tools/statusline tools/shared",
      );
      expect(line).toContain("84 cmd · 3 files");
      expect(line).toContain("$2.74");
      expect(line).not.toContain("no event yet");
    },
  );

  test("shared writer fixtures render fresh and resumed own rows, skip malformed, and count stale only", async () => {
    const dir = join(scratch, "shared-marker-contract");
    const active = join(dir, "active");
    mkdirSync(active, { recursive: true });
    const now = Temporal.Now.instant().toString();
    for (const [name, fixture] of [
      ["fresh", ownFreshMarker],
      ["resumed", ownResumedMarker],
    ] as const) {
      const written = serializeActiveMarker({
        ...fixture,
        run_id: name,
        pid: process.pid,
        started_at: now,
        cwd: scratch,
        dispatcher_session: SESSION,
      });
      expect(written.success).toBe(true);
      if (written.success)
        writeFileSync(join(active, `${name}.json`), written.text);
    }
    writeFileSync(
      join(active, "malformed.json"),
      JSON.stringify(malformedMarker),
    );
    writeFileSync(
      join(active, "unreadable.json"),
      JSON.stringify(unreadableMarker),
    );
    const dead = serializeActiveMarker(deadOwnMarker);
    expect(dead.success).toBe(true);
    if (dead.success) writeFileSync(join(active, "dead.json"), dead.text);

    const out = await render(dir);
    const rows = out
      .split("\n")
      .filter((line) => line.startsWith("luna-xhigh"));
    expect(rows).toHaveLength(2);
    expect(rows.join("\n")).toContain("Repo: dotfiles");
    expect(rows.join("\n")).toContain("resume:");
    expect(out).not.toContain("unreadable 2");
  });

  test("a live worker shows its row, elapsed time and label", async () => {
    const dir = join(scratch, "live");
    marker(dir, "a", process.pid, "lint batch 7");
    const out = await render(dir);
    expect(out).toMatch(
      /^luna-high 1m3\d+s \$n\/a \(not reported\) tkt_lint batch 7 │ working · no event yet$/mu,
    );
  });

  test("a worker from this session shows its full row", async () => {
    const dir = join(scratch, "own-session");
    marker(dir, "own", process.pid, "my worker", 90, SESSION);
    expect(await render(dir)).toMatch(
      /^luna-high 1m3\d+s \$n\/a \(not reported\) tkt_my worker │ working · no event yet$/mu,
    );
  });

  test.each([
    [0, "$0"],
    [0.0004, "<$0.01"],
    [0.004, "<$0.01"],
    [0.0099, "<$0.01"],
    [0.01, "$0.01"],
    [0.0149, "$0.01"],
    [0.0295, "$0.03"],
    [0.548, "$0.55"],
    [1.234, "$1.23"],
  ])("formats reported cost %s as %s", async (costUsd, expected) => {
    const dir = join(scratch, `cost-column-${costUsd}`);
    marker(dir, "priced", process.pid, "priced worker");
    writeFileSync(
      join(dir, "active", "priced.progress.json"),
      JSON.stringify({
        schema: 1,
        at: Temporal.Now.instant().toString(),
        last: "$ bun test",
        commands: 1,
        files: 0,
        usage: { input_tokens: 1_000_000, output_tokens: 100_000 },
        cost_usd: costUsd,
      }),
    );
    const line = (await render(dir))
      .split("\n")
      .find((value) => value.startsWith("luna-high "));
    expect(line).toContain(` ${expected} tkt_priced worker │`);
  });

  test("marks the cost unknown when usage is unknown", async () => {
    const unknown = join(scratch, "unknown-cost-column");
    marker(unknown, "unknown", process.pid, "unknown worker");
    writeFileSync(
      join(unknown, "active", "unknown.progress.json"),
      progress("$ bun test", 1),
    );
    const out = await render(unknown);
    expect(out).toMatch(
      /^luna-high 1m3\ds \$n\/a \(not reported\) tkt_unknown worker │/mu,
    );
  });

  test("post-worker verification uses marker phase, final cost and vendor session without progress sidecar", async () => {
    const dir = join(scratch, "post-worker-verify");
    const active = join(dir, "active");
    mkdirSync(active, { recursive: true });
    const written = serializeActiveMarker({
      schema: 1,
      run_id: "post-worker-verify",
      pid: process.pid,
      kind: "token",
      labels: ["harness"],
      label: "verify worker",
      choice: "luna-max",
      pick_source: "resume",
      started_at: Temporal.Now.instant().subtract({ seconds: 300 }).toString(),
      cwd: scratch,
      dispatcher_session: SESSION,
      phase: "verifying 3/6 bun test tools/agx",
      worker_session: "thread-new",
      cost_usd: 0.0563,
      worker_usage: { input_tokens: 900_000, output_tokens: 120_000 },
      ticket: { writes: ["src/**"] },
    });
    expect(written.success).toBe(true);
    if (written.success)
      writeFileSync(join(active, "post-worker-verify.json"), written.text);

    const line = (await render(dir))
      .split("\n")
      .find((value) => value.startsWith("luna-max "));
    expect(line).toContain("$0.06");
    expect(line).not.toContain("thre..dnew");
    expect(line).toContain("resume:");
    expect(line).toContain("verifying 3/6 bun test tools/agx");
    expect(line).not.toContain("no event yet");
  });

  test("grading phase stays visible for a Claude row with unreported cost", async () => {
    const dir = join(scratch, "claude-grading");
    const active = join(dir, "active");
    mkdirSync(active, { recursive: true });
    const written = serializeActiveMarker({
      schema: 1,
      run_id: "claude-grading",
      pid: process.pid,
      label: "claude worker",
      choice: "sonnet-medium",
      pick_source: "jev",
      started_at: Temporal.Now.instant().subtract({ seconds: 60 }).toString(),
      cwd: scratch,
      dispatcher_session: SESSION,
      phase: "grading",
      ticket: { writes: [] },
    });
    expect(written.success).toBe(true);
    if (written.success)
      writeFileSync(join(active, "claude-grading.json"), written.text);

    const line = (await render(dir))
      .split("\n")
      .find((value) => value.startsWith("sonnet-medium "));
    expect(line).toContain("$n/a (not reported)");
    expect(line).toContain("grading");
    expect(line).not.toContain("no event yet");
  });

  test("working phase says no event only before the first worker event", async () => {
    const dir = join(scratch, "working-no-event");
    const active = join(dir, "active");
    mkdirSync(active, { recursive: true });
    const written = serializeActiveMarker({
      schema: 1,
      run_id: "working-no-event",
      pid: process.pid,
      label: "new worker",
      choice: "luna-high",
      pick_source: "jev",
      started_at: Temporal.Now.instant().toString(),
      cwd: scratch,
      dispatcher_session: SESSION,
      phase: "working",
    });
    expect(written.success).toBe(true);
    if (written.success)
      writeFileSync(join(active, "working-no-event.json"), written.text);

    const line = (await render(dir))
      .split("\n")
      .find((value) => value.startsWith("luna-high "));
    expect(line).toContain("working · no event yet");
  });

  test("uses the listed cost without consulting a Codex rollout", async () => {
    const dir = join(scratch, "rollout-cost");
    const session = "livecost-unique-session-20261009";
    marker(dir, "rollout", process.pid, "live codex", 10, SESSION, "luna-high");
    writeFileSync(
      join(dir, "active", "rollout.progress.json"),
      JSON.stringify({
        schema: 1,
        at: Temporal.Now.instant().toString(),
        last: "$ bun test",
        commands: 12,
        files: 3,
        session,
        cost_usd: 0.14,
      }),
    );
    const day = Temporal.Now.plainDateISO("UTC");
    const rolloutDir = join(
      scratch,
      ".codex",
      "sessions",
      String(day.year),
      String(day.month).padStart(2, "0"),
      String(day.day).padStart(2, "0"),
    );
    mkdirSync(rolloutDir, { recursive: true });
    writeFile(
      join(rolloutDir, `rollout-2026-10-09T00-00-00-${session}.jsonl`),
      [
        tokenLine(100_000, 40_000, 7_000, 3_000),
        tokenLine(500_000, 200_000, 30_000, 10_000),
        tokenLine(1_000_000, 400_000, 100_000, 50_000),
      ].join("\n") + "\n",
    );
    const line = (await render(dir))
      .split("\n")
      .find((value) => value.startsWith("luna-high "));
    expect(line).toContain("$0.14");
    expect(line).toContain("live codex");
  });

  test("does not invent a cost when the session rollout is absent", async () => {
    const dir = join(scratch, "no-rollout-cost");
    marker(dir, "norollout", process.pid, "missing rollout");
    writeFileSync(
      join(dir, "active", "norollout.progress.json"),
      progress("$ bun test", 1, "session-with-no-rollout"),
    );
    const line = (await render(dir))
      .split("\n")
      .find((value) => value.startsWith("luna-high "));
    expect(line).toContain("missing rollout");
    expect(line).not.toMatch(/\$\d/u);
  });

  test("Run activity comes from C2 despite a conflicting vendor rollout", async () => {
    const session = "fixture-run-activity";
    const cwd = "/home/fuyu/dotfiles-ws-hooksearch";
    const day = Temporal.PlainDate.from("2026-10-14");
    const rolloutDir = join(
      scratch,
      ".codex",
      "sessions",
      String(day.year),
      String(day.month).padStart(2, "0"),
      String(day.day).padStart(2, "0"),
    );
    mkdirSync(rolloutDir, { recursive: true });
    const fixture = readFileSync(
      join(import.meta.dir, "fixtures", "codex-rollout-run-activity.jsonl"),
      "utf8",
    );
    writeFileSync(
      join(rolloutDir, `rollout-fixture-${session}.jsonl`),
      `${JSON.stringify({
        type: "session_meta",
        payload: {
          id: session,
          session_id: session,
          cwd,
          timestamp: "2026-10-14T04:01:00Z",
        },
      })}\n${fixture}`,
    );
    const line = (
      await render(
        undefined,
        undefined,
        SESSION,
        JSON.stringify([
          {
            progress: {
              last: "editing tools/shared/src/shape.ts",
              at: Temporal.Now.instant().toString(),
              commands: 2,
              files: 1,
              turns: null,
              usage: null,
              cost_usd: null,
              session: null,
            },
            id: "run-activity",
            ticket: "rollout worker",
            state: "running",
            row: "luna-high",
            exit: null,
            cwd,
            workspace: cwd,
            writes: [],
            judgment: null,
            report_path: null,
            dispatcher_session: SESSION,
            vendor_session: null,
            started_at: "2026-10-14T04:01:00Z",
            continues: null,
            verify: [],
            last_progress_path: null,
          },
        ]),
        undefined,
        scratch,
      )
    )
      .split("\n")
      .find((value) => value.startsWith("luna-high "));
    expect(line).toContain("editing tools/shared/src/shape.t");
    expect(line).not.toContain("\\n");
    expect(line).toContain("2 cmd · 1 files");
  });

  test("worker rows omit session IDs for named and legacy markers", async () => {
    const dir = join(scratch, "display-id-row");
    marker(
      dir,
      "named",
      process.pid,
      "Repo: dotfiles",
      90,
      SESSION,
      "luna-high",
      "jev",
      "agt_lfix",
    );
    writeFileSync(
      join(dir, "active", "named.progress.json"),
      progress("$ bun test", 2, "0191abcd-0000-7000-8000-11111111abcd"),
    );
    const out = await render(dir);
    expect(out).toMatch(
      /^luna-high 1m3\ds \$n\/a \(not reported\) tkt_Repo: dotfiles │ working · \$ bun test/mu,
    );

    const legacyDir = join(scratch, "legacy-session-row");
    marker(legacyDir, "legacy", process.pid, "legacy row");
    writeFileSync(
      join(legacyDir, "active", "legacy.progress.json"),
      progress("$ ls", 2, "0191abcd-0000-7000-8000-11111111abcd"),
    );
    expect(await render(legacyDir)).toContain("legacy row");
  });

  test("a resumed ticketed worker from this session shows its full row", async () => {
    const dir = join(scratch, "resumed-own-session");
    marker(
      dir,
      "resumed",
      process.pid,
      "resume: J1 gated commit",
      90,
      SESSION,
      "sol-max",
      "resume",
    );
    const out = await render(dir);
    expect(out).toMatch(
      /^sol-max 1m3\d+s \$n\/a \(not reported\) resume: tkt_J1 gated commit │ working · no event yet$/mu,
    );
    expect(out).not.toContain("in other sessions");
  });

  test("a worker from another session is represented only by the count", async () => {
    const dir = join(scratch, "other-session");
    marker(dir, "other", process.pid, "private worker", 90, "other-session-id");
    const out = await render(dir);
    expect(out).toContain(`+1 workers outside session ${SESSION}`);
    expect(
      out
        .split("\n")
        .map((line) => line.replace(ANSI, ""))
        .filter((line) => line.includes("outside session")),
    ).toEqual([`+1 workers outside session ${SESSION}`]);
    expect(out).not.toContain("private worker");
    expect(out).not.toContain("luna-high");
  });

  test("a live worker without a dispatcher is unattributed", async () => {
    const dir = join(scratch, "no-dispatcher");
    marker(dir, "unowned", process.pid, "undispatched worker", 90, null);
    const out = await render(dir);
    expect(out).not.toContain("unattributed");
    expect(out).toContain(`+1 workers outside session ${SESSION}`);
    expect(out).not.toContain("undispatched worker");
  });

  test("mixed markers separate own, other, unattributed and stale workers", async () => {
    const dir = join(scratch, "mixed-sessions");
    marker(dir, "own", process.pid, "my worker", 90, SESSION);
    marker(dir, "other", process.pid, "other worker", 80, "other-session-id");
    marker(dir, "none", process.pid, "unowned worker", 70, null);
    marker(dir, "empty", process.pid, "empty dispatcher", 70, "");
    marker(dir, "dead-own", 2_147_483_000, "dead own", 70, SESSION);
    marker(
      dir,
      "dead-other",
      2_147_483_000,
      "dead other",
      70,
      "other-session-id",
    );
    marker(dir, "dead-none", 2_147_483_000, "dead none", 70, null);
    const out = await render(dir);
    expect(out).toMatch(
      /^luna-high 1m3\d+s \$n\/a \(not reported\) tkt_my worker │ working · no event yet$/mu,
    );
    expect(
      out
        .split("\n")
        .map((line) => line.replace(ANSI, ""))
        .filter((line) => line.includes("outside session")),
    ).toEqual([`+3 workers outside session ${SESSION}`]);
    expect(
      out
        .replaceAll(ANSI, "")
        .split("\n")
        .find((line) => line.startsWith("agx ")),
    ).toBeUndefined();
    expect(out).not.toContain("other worker");
    expect(out).not.toContain("unowned worker");
    expect(out).not.toContain("dead own");
    expect(out).not.toContain("dead other");
    expect(out).not.toContain("dead none");
  });

  test("no attribution summary is rendered when every count is zero", async () => {
    const dir = join(scratch, "no-attribution-summary");
    marker(dir, "own", process.pid, "my worker", 90, SESSION);
    const out = await render(dir);
    expect(out).not.toMatch(/in other sessions|unattributed/u);
    expect(out).not.toContain("lost");
  });

  test("legacy active directories no longer supply Run rows", async () => {
    const base = join(scratch, "migration");
    const current = join(base, "agx");
    const legacy = join(base, "agent-router");
    marker(current, "duplicate", process.pid, "current copy");
    marker(legacy, "duplicate", process.pid, "legacy copy");
    marker(legacy, "legacy-own", process.pid, "legacy worker");
    marker(
      legacy,
      "legacy-other",
      process.pid,
      "other",
      80,
      "other-session-id",
    );
    marker(legacy, "legacy-none", process.pid, "none", 70, null);
    marker(legacy, "legacy-dead", 2_147_483_000, "dead");
    writeFileSync(
      join(legacy, "active", "legacy-own.progress.json"),
      progress("$ legacy progress", 1),
    );
    const out = await render(undefined, base);
    expect(out.split("\n").some((line) => line.startsWith("luna-high "))).toBe(
      false,
    );
    expect(out).not.toContain("current copy");
    expect(out).not.toContain("legacy copy");
  });

  test("the legacy directory is read when the new directory is absent", async () => {
    const base = join(scratch, "legacy-only");
    marker(join(base, "agent-router"), "legacy", process.pid, "legacy only");
    expect(await render(undefined, base)).not.toContain("legacy only");
  });

  test("several workers: one line each, longest-running first", async () => {
    const dir = join(scratch, "several");
    marker(dir, "short", process.pid, "short one", 30);
    marker(dir, "long", process.pid, "long one", 600);
    const lines = (await render(dir)).split("\n");
    const at = lines.findIndex((l) => l.startsWith("luna-high "));
    expect(lines[at]).toMatch(
      /^luna-high 10m0\ds \$n\/a \(not reported\) tkt_long one +│ working · no event yet$/u,
    );
    expect(lines[at + 1]).toMatch(
      /^luna-high +0m3\ds \$n\/a \(not reported\) tkt_short one │ working · no event yet$/u,
    );
  });

  test("rows align names, elapsed, ids and labels using terminal columns", async () => {
    const dir = join(scratch, "aligned");
    marker(
      dir,
      "luna",
      process.pid,
      "link-dots reloads a launchd agent",
      14,
      SESSION,
      "luna-high",
    );
    marker(
      dir,
      "sonnet",
      process.pid,
      "tools/ migration: move rr",
      723,
      SESSION,
      "sonnet-high",
    );
    marker(
      dir,
      "japanese",
      process.pid,
      "日本語のラベル",
      3720,
      SESSION,
      "fable-xhigh",
    );
    for (const [name, session] of [
      ["luna", "01a113e0-1111-1111-1111-111111111111"],
      ["sonnet", "20e32723-2222-2222-2222-222222222222"],
      ["japanese", "30e32723-3333-3333-3333-333333333333"],
    ])
      writeFileSync(
        join(dir, "active", `${name}.progress.json`),
        progress("$ cmd", 2, session),
      );
    const lines = (await render(dir))
      .split("\n")
      .filter((line) => /^(luna|sonnet|fable)-/u.test(line));
    expect(lines).toHaveLength(3);
    const widths = lines.map((line) =>
      Bun.stringWidth(line.slice(0, line.indexOf("│"))),
    );
    expect(new Set(widths).size).toBe(1);
    expect(lines.join("\n")).not.toMatch(/[0-9a-f]{4}\.\.[0-9a-f]{4}/u);
    expect(lines.some((line) => line.includes("luna-high"))).toBe(true);
    expect(lines.some((line) => line.includes("sonnet-high"))).toBe(true);
    expect(lines.some((line) => line.includes("日本語のラベル"))).toBe(true);
  });

  test("a worker with a progress file shows its latest event and its counts", async () => {
    const dir = join(scratch, "progress");
    marker(dir, "p", process.pid, "nothrow-0");
    writeFileSync(
      join(dir, "active", "p.progress.json"),
      progress("$ bun test kernel.test.ts", 2),
    );
    expect(await render(dir)).toMatch(
      /^luna-high 1m3\d+s \$n\/a \(not reported\) tkt_nothrow-0 │ working · \$ bun test kernel\.test\.ts · 12 cmd · 3 files$/mu,
    );
    // a quiet worker (reasoning) is shown with the age of its last event, not as if it were live
    writeFileSync(
      join(dir, "active", "p.progress.json"),
      progress("✎ kernel.ts", 125),
    );
    expect(await render(dir)).toMatch(
      /│ working · ✎ kernel\.ts \(2m0\ds ago\) · 12 cmd · 3 files$/mu,
    );
    // the progress file is never mistaken for a second worker
    expect(
      (await render(dir)).split("\n").filter((l) => l.includes("luna-high"))
        .length,
    ).toBe(1);
  });

  test("a worker's vendor session id is omitted from its row", async () => {
    const dir = join(scratch, "session");
    marker(dir, "s", process.pid, "nothrow-1");
    writeFileSync(
      join(dir, "active", "s.progress.json"),
      progress("$ ls", 2, "01a1111b-7dab-7d61-8f9b-231c4cc9568a"),
    );
    expect(await render(dir)).toMatch(
      /^luna-high 1m3\d+s \$n\/a \(not reported\) tkt_nothrow-1 │ working · \$ ls · 12 cmd · 3 files$/mu,
    );
  });

  test("six workers remain visible without UUIDv7 fragments", async () => {
    const dir = join(scratch, "six-colliding-prefixes");
    const ids = Array.from(
      { length: 6 },
      (_, i) => `01a11a74-0000-7000-8000-00000000000${i + 1}`,
    );
    ids.forEach((id, i) => {
      const name = `w${i}`;
      marker(
        dir,
        name,
        process.pid,
        `worker ${i}`,
        60 + i,
        SESSION,
        `choice-${i}`,
      );
      writeFileSync(
        join(dir, "active", `${name}.progress.json`),
        progress("$ cmd", 2, id),
      );
    });
    const lines = (await render(dir)).split("\n");
    const rendered = ids.map((id) => {
      const short = `01a1..${id.slice(-4)}`;
      expect(lines.some((line) => line.includes(short))).toBe(false);
      return short;
    });
    expect(new Set(rendered).size).toBe(6);
  });

  test("colliding session tails remain hidden", async () => {
    const dir = join(scratch, "growing-tails");
    const ids = [
      "01a11a74-0000-7000-8000-00000001abc0",
      "01a11a74-0000-7000-8000-00000002abc0",
    ];
    ids.forEach((id, i) => {
      const name = `tail${i}`;
      marker(dir, name, process.pid, `tail ${i}`, 60 + i, SESSION, `tail-${i}`);
      writeFileSync(
        join(dir, "active", `${name}.progress.json`),
        progress("$ cmd", 2, id),
      );
    });
    const out = await render(dir);
    expect(out).not.toContain("01a1..1abc0");
    expect(out).not.toContain("01a1..2abc0");
  });

  test("resume label identifies a resumed worker", async () => {
    const dir = join(scratch, "resume");
    marker(
      dir,
      "resume",
      process.pid,
      "resume: continued worker",
      90,
      SESSION,
      "luna-high",
      "resume",
    );
    writeFileSync(
      join(dir, "active", "resume.progress.json"),
      progress("$ ls", 2, "01a11a74-cd83-7de1-b627-16537d8de67d"),
    );
    expect(await render(dir)).toMatch(
      /^luna-high 1m3\d+s \$n\/a \(not reported\) resume: tkt_continued worker │ working · \$ ls · 12 cmd · 3 files$/mu,
    );
  });

  // Ported from the pre-port suite (agents/claude/hooks/tests/statusline-run-row.test.ts, cbc82bdc).
  test("UUIDv7 ids sharing their timestamp prefix remain hidden", async () => {
    const dir = join(scratch, "uuidv7-prefix-collision");
    marker(dir, "a", process.pid, "first", 30, SESSION, "luna-high");
    marker(dir, "b", process.pid, "second", 20, SESSION, "sonnet-high");
    writeFileSync(
      join(dir, "active", "a.progress.json"),
      progress("$ ls", 2, "0191abcd-0000-7000-8000-11111111abcd"),
    );
    writeFileSync(
      join(dir, "active", "b.progress.json"),
      progress("$ ls", 2, "0191abcd-0000-7000-8000-22222222bcde"),
    );
    const out = await render(dir);
    expect(out).not.toContain("0191..abcd");
    expect(out).not.toContain("0191..bcde");
  });

  test("ids sharing their last four digits remain hidden", async () => {
    const dir = join(scratch, "uuid-tail-collision");
    marker(dir, "a", process.pid, "first", 30, SESSION, "luna-high");
    marker(dir, "b", process.pid, "second", 20, SESSION, "sonnet-high");
    writeFileSync(
      join(dir, "active", "a.progress.json"),
      progress("$ ls", 2, "01234567-0000-7000-8000-11111111abcd"),
    );
    writeFileSync(
      join(dir, "active", "b.progress.json"),
      progress("$ ls", 2, "01239999-0000-7000-8000-22222222abcd"),
    );
    const out = await render(dir);
    expect(out).not.toContain("0123..1abcd");
    expect(out).not.toContain("0123..2abcd");
  });

  test("resume workers omit their reused session id without a duplicate marker", async () => {
    const dir = join(scratch, "resume-session");
    marker(
      dir,
      "resume",
      process.pid,
      "resume: resumed",
      30,
      SESSION,
      "luna-high",
      "resume",
    );
    writeFileSync(
      join(dir, "active", "resume.progress.json"),
      progress("$ ls", 2, "0191abcd-0000-7000-8000-11111111abcd"),
    );
    const out = await render(dir);
    expect(out).toContain("resume: tkt_resumed");
    expect(out).not.toContain("↻");
    expect(out.match(/resume:/gu)).toHaveLength(1);
  });

  test("fresh and prefix-colliding resumed rows omit ids and align", async () => {
    const dir = join(scratch, "aligned-resumes");
    const rows = [
      {
        name: "fresh",
        choice: "sonnet-high",
        label: "Scope: put nncp v3.3 on example-repo",
        pickSource: "jev",
        session: "8066abcd-0000-7000-8000-11111111e1b6",
        age: 619,
      },
      {
        name: "resume-a",
        choice: "sol-max",
        label: "resume: Scope: one new FireOps method",
        pickSource: "explicit",
        session: "01a113e0-1111-1111-1111-1111111115b6",
        age: 530,
      },
      {
        name: "resume-b",
        choice: "sol-max",
        label: "resume: Scope: the lineage editing",
        pickSource: "resume",
        session: "01a113e0-2222-2222-2222-2222222214f5",
        age: 530,
      },
    ];
    rows.forEach((row) => {
      marker(
        dir,
        row.name,
        process.pid,
        row.label,
        row.age,
        SESSION,
        row.choice,
        row.pickSource,
      );
      writeFileSync(
        join(dir, "active", `${row.name}.progress.json`),
        progress("$ command", 2, row.session),
      );
    });

    const lines = (await render(dir))
      .split("\n")
      .filter((line) => /^(sonnet|sol)-/u.test(line));
    expect(lines).toHaveLength(3);
    expect(lines.some((line) => line.includes("8066..e1b6"))).toBe(false);
    expect(lines.some((line) => line.includes("01a1..15b6"))).toBe(false);
    expect(lines.some((line) => line.includes("01a1..14f5"))).toBe(false);
    expect(lines.every((line) => !line.includes("↻"))).toBe(true);
    expect(lines.filter((line) => line.includes("resume:")).length).toBe(2);
    expect(
      new Set(
        lines.map((line) => Bun.stringWidth(line.slice(0, line.indexOf("│")))),
      ).size,
    ).toBe(1);
  });

  test("all own workers render as rows above the former cap", async () => {
    const dir = join(scratch, "many");
    for (let i = 0; i < 8; i++)
      marker(dir, `w${i}`, process.pid, `worker ${i}`, 60 + i);
    const out = await render(dir);
    expect(out.split("\n").filter((l) => l.includes("luna-high")).length).toBe(
      8,
    );
    expect(out).not.toContain("more");
  });

  test("Job summary includes this session's named detached runs", async () => {
    const dir = join(scratch, "detached-summary");
    marker(
      dir,
      "run-t20arch",
      process.pid,
      "architecture",
      60,
      "dispatcher-short",
      "sol-high",
      "fixture",
      "t20arch",
    );
    marker(
      dir,
      "run-integrev",
      process.pid,
      "integration review",
      30,
      "dispatcher-short",
      "sonnet-high",
      "fixture",
      "integrev",
    );

    const out = await render(
      dir,
      undefined,
      "dispatcher-short",
      JSON.stringify([
        {
          id: "run-1",
          ticket: "t20arch",
          state: "running",
          row: "luna-high",
          exit: null,
          cwd: scratch,
          workspace: scratch,
          writes: [],
          judgment: null,
          report_path: null,
          verify: [],
          last_progress_path: null,
          continues: null,
          vendor_session: null,
          dispatcher_session: "dispatcher-short",
        },
        {
          id: "run-2",
          ticket: "integrev",
          state: "running",
          row: "luna-high",
          exit: null,
          cwd: scratch,
          workspace: scratch,
          writes: [],
          judgment: null,
          report_path: null,
          verify: [],
          last_progress_path: null,
          continues: null,
          vendor_session: null,
          dispatcher_session: "dispatcher-short",
        },
      ]),
    );
    expect(out).not.toContain("Job: 2 (t20arch, integrev)");
    expect(out).not.toContain("architecture");
    expect(out).not.toContain("integration review");
  });

  test("Job ignores agx records; its source is the compute process scan", async () => {
    const dir = join(scratch, "records-job-count");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "records.jsonl"), "fixture records\n");
    const out = await render(
      dir,
      undefined,
      "dispatcher-short",
      JSON.stringify([
        {
          id: "a-id",
          ticket: "a",
          state: "running",
          dispatcher_session: "dispatcher-short",
          row: "luna-high",
          exit: null,
          cwd: scratch,
          workspace: scratch,
          writes: [],
          judgment: null,
          report_path: null,
          verify: [],
          last_progress_path: null,
          continues: null,
          vendor_session: null,
        },
        {
          id: "b-id",
          ticket: "b",
          state: "running",
          dispatcher_session: "dispatcher-short",
          row: "luna-high",
          exit: null,
          cwd: scratch,
          workspace: scratch,
          writes: [],
          judgment: null,
          report_path: null,
          verify: [],
          last_progress_path: null,
          continues: null,
          vendor_session: null,
        },
        {
          id: "other-id",
          ticket: "other",
          state: "running",
          dispatcher_session: "elsewhere",
          row: "luna-high",
          exit: null,
          cwd: scratch,
          workspace: scratch,
          writes: [],
          judgment: null,
          report_path: null,
          verify: [],
          last_progress_path: null,
          continues: null,
          vendor_session: null,
        },
        {
          id: "ended-id",
          ticket: "ended",
          state: "ended",
          dispatcher_session: "dispatcher-short",
          row: "luna-high",
          exit: 0,
          cwd: scratch,
          workspace: scratch,
          writes: [],
          judgment: null,
          report_path: null,
          verify: [],
          last_progress_path: null,
          continues: null,
          vendor_session: null,
        },
      ]),
    );
    expect(out).not.toContain("Job: 2 (a, b)");
  });

  test("Job displays admitted compute jobs and orphans only", async () => {
    const out = await render(
      join(scratch, "job-compute-only"),
      undefined,
      undefined,
      "[]",
      "1 00:10:00 agent-resource-run --manifest /tmp/compute.resource.json\n1 00:02:00 /tmp/scratchpad/orphan",
      join(scratch, "job-home"),
    );
    expect(out).toContain("Job: compute 10m00s orphan×1");
    expect(
      out.split("\n").find((line) => line.startsWith("Job:")),
    ).not.toContain("agx");
    expect(out).not.toContain("lost");
  });

  test("Job entries share one name + elapsed format in every session", async () => {
    const ps = [
      "1 00:00:22 agent-resource-run --manifest /tmp/cpu.resource.json",
      "1 00:00:32 agent-resource-run --manifest /tmp/job2610-modtest-gpu-3g.resource.json",
    ];
    const first = await render(
      join(scratch, "job-fmt-a"),
      undefined,
      undefined,
      "[]",
      ps.join("\n"),
      join(scratch, "job-fmt-home-a"),
    );
    const reversed = await render(
      join(scratch, "job-fmt-b"),
      undefined,
      "other",
      "[]",
      ps.toReversed().join("\n"),
      join(scratch, "job-fmt-home-b"),
    );
    const line = "Job: job2610-modtest-gpu-3g 0m32s cpu 0m22s";
    expect(first).toContain(line);
    expect(reversed).toContain(line);
    expect(first).not.toMatch(/cpu\+1/u);
  });

  test("agx worker ls rows without started_at show explicit n/a elapsed", async () => {
    const out = await render(
      join(scratch, "missing-start-time"),
      undefined,
      SESSION,
      JSON.stringify([
        {
          id: "run-no-start",
          ticket: "worker without time",
          state: "running",
          row: "luna-high",
          exit: null,
          cwd: scratch,
          workspace: scratch,
          writes: [],
          judgment: null,
          report_path: null,
          dispatcher_session: SESSION,
          vendor_session: null,
          last_progress_path: null,
          continues: null,
          verify: [],
        },
      ]),
    );
    expect(out).toMatch(
      /^luna-high n\/a \(start time unavailable\) \$n\/a \(not reported\) tkt_worker without time │ working · no event yet$/mu,
    );
  });

  test("ended rows with completed verify receipts do not render as live runs", async () => {
    const stateDir = join(scratch, "ended-row-state");
    mkdirSync(stateDir, { recursive: true });
    const out = await render(
      stateDir,
      undefined,
      SESSION,
      JSON.stringify([
        {
          id: "run-ended-verify",
          ticket: "finished worker",
          state: "ended",
          row: "luna-high",
          exit: 0,
          cwd: scratch,
          workspace: scratch,
          writes: [],
          judgment: null,
          report_path: null,
          dispatcher_session: SESSION,
          vendor_session: null,
          started_at: Temporal.Now.instant().toString(),
          continues: null,
          verify: [
            { cmd: "bun test tools/agx", exit: 0, log_path: "/tmp/verify.log" },
          ],
          last_progress_path: null,
        },
      ]),
    );
    expect(out).not.toMatch(/^luna-high /mu);
    expect(out).not.toContain("verifying");
    expect(
      out
        .split("\n")
        .filter((line) => !line.startsWith("Sys:"))
        .join("\n"),
    ).not.toContain("stale ");
  });

  test("Job and Run readers share the last-good snapshot without spawning agx", async () => {
    const dir = join(scratch, "records-cache-hit");
    const home = join(scratch, "records-cache-home");
    mkdirSync(dir, { recursive: true });
    mkdirSync(home, { recursive: true });
    const records = join(dir, "records.jsonl");
    const log = join(dir, "agx-invocations");
    writeFileSync(records, "fixture records\n");
    const env = {
      ...isolatedStatuslineEnv({ HOME: home, PATH: bin }),
      HOME: home,
      PATH: bin,
      AGX_STATE_DIR: dir,
      AGX_LOG: log,
      AGX_JSON: JSON.stringify([
        {
          id: "a-id",
          ticket: "a",
          state: "running",
          row: "luna-high",
          exit: null,
          cwd: scratch,
          workspace: scratch,
          writes: [],
          judgment: null,
          report_path: null,
          vendor_session: null,
          started_at: Temporal.Now.instant().toString(),
          continues: null,
          verify: [],
          last_progress_path: null,
          dispatcher_session: "dispatcher-short",
        },
      ]),
    };
    seedAgxSnapshot(env, {
      output: env.AGX_JSON,
      capturedAt: Temporal.Now.instant().epochMilliseconds,
    });
    const first = await agxJobRunsAsync("dispatcher-short", env);
    const started = performance.now();
    const second = await agxJobRunsAsync("dispatcher-short", env);
    const warmMs = performance.now() - started;
    expect(first.map(({ ticket }) => ticket)).toEqual(["a"]);
    expect(second).toEqual(first);
    expect(existsSync(log)).toBe(false);
    createConsola({ level: 4 }).info(
      `agx snapshot read warm cache: ${warmMs.toFixed(2)}ms`,
    );
  });

  // These fixtures carry doctor's orphaned classification, regardless of age or judgment.
  const orphanRow = (id: string, ageS: number, judgment: unknown = null) => ({
    id,
    ticket: `old ${id}`,
    state: "ended",
    outcome: "lost",
    health: "orphaned",
    row: "luna-high",
    exit: null,
    cwd: scratch,
    workspace: scratch,
    writes: [],
    judgment,
    report_path: null,
    dispatcher_session: "other-session-id",
    vendor_session: null,
    started_at: Temporal.Now.instant().subtract({ seconds: ageS }).toString(),
    last_progress_path: null,
    continues: null,
    verify: [],
  });

  test("lost count includes doctor-classified orphans regardless of age or judgment", async () => {
    const old = Array.from({ length: 62 }, (_, i) =>
      orphanRow(`old-${i}`, 3 * 3600 + i),
    );
    const foldedRows = [
      ...old,
      orphanRow("judged", 120, { decision: "reject", note: "" }),
    ];
    const out = await render(
      join(scratch, "orphan-old"),
      undefined,
      SESSION,
      JSON.stringify(foldedRows),
    );
    expect(out).not.toContain("lost");
    const agxLine = out.split("\n").find((line) => line.startsWith("agx "));
    expect(agxLine).toBeUndefined();
    expect(
      out.split("\n").filter((line) => line.startsWith("agx ")),
    ).toHaveLength(0);
  });

  test("a claude run shows its worker-progress.jsonl, not no event yet", async () => {
    const dir = join(scratch, "claude-progress");
    const runDir = join(dir, "runs", "claude-run");
    mkdirSync(runDir, { recursive: true });
    writeFileSync(
      join(runDir, "worker-progress.jsonl"),
      progress("$ bun test tests/x.ts", 5, "claude-session") + "\n",
    );
    const out = await render(
      dir,
      undefined,
      SESSION,
      JSON.stringify([
        {
          ...orphanRow("claude-run", 30),
          progress: {
            last: "$ bun test tests/x.ts",
            at: Temporal.Now.instant().toString(),
            commands: 12,
            files: 3,
            turns: null,
            usage: null,
            cost_usd: null,
            session: "claude-session",
          },
          state: "running",
          row: "sonnet-high",
          ticket: "claude job",
          dispatcher_session: SESSION,
        },
      ]),
    );
    expect(out).not.toContain("no event yet");
    expect(out).toMatch(/\$ bun test tests\/x\.ts .*12 cmd · 3 files/u);
  });

  test.each([
    {
      name: "explicit override",
      override: "custom",
      xdg: "xdg",
      path: "custom",
    },
    { name: "empty override", override: "", xdg: "xdg", path: "xdg/agx" },
    {
      name: "absent override",
      override: undefined,
      xdg: "xdg",
      path: "xdg/agx",
    },
    { name: "empty XDG home", override: "", xdg: "", path: ".local/state/agx" },
    {
      name: "absent XDG home",
      override: undefined,
      xdg: undefined,
      path: ".local/state/agx",
    },
  ])(
    "worker progress state directory: $name",
    async ({ name, override, xdg, path }) => {
      const home = join(scratch, `progress-state-${name.replaceAll(" ", "-")}`);
      const env = {
        HOME: home,
        AGX_STATE_DIR:
          override === undefined || override === ""
            ? override
            : join(home, override),
        XDG_STATE_HOME: xdg === undefined || xdg === "" ? xdg : join(home, xdg),
      };
      const runDir = join(home, path, "runs", "state-contract-run");
      mkdirSync(runDir, { recursive: true });
      writeFileSync(
        join(runDir, "worker-progress.jsonl"),
        progress("$ state-contract-progress", 1) + "\n",
      );
      seedAgxSnapshot(
        env,
        {
          capturedAt: Temporal.Now.instant().epochMilliseconds,
          output: JSON.stringify([
            {
              progress: {
                last: "$ state-contract-progress",
                at: Temporal.Now.instant().toString(),
                commands: 12,
                files: 3,
                turns: null,
                usage: null,
                cost_usd: null,
                session: null,
              },
              id: "state-contract-run",
              ticket: "state-contract",
              state: "running",
              row: "sonnet-high",
              dispatcher_session: SESSION,
            },
          ]),
        },
        home,
      );
      const scan = await agxRouteRunsAsync(env, SESSION, true, home);
      expect(scan.runs).toHaveLength(1);
      expect(scan.runs[0]?.doing?.last).toBe("$ state-contract-progress");
      expect(scan.runs[0]?.doing?.commands).toBe(12);
    },
  );

  test("a marker whose process is gone is counted as lost, not hidden", async () => {
    const dir = join(scratch, "stale");
    marker(dir, "b", 2_147_483_000, "killed");
    const out = await render(dir);
    expect(out).not.toContain("lost");
    expect(
      out.split("\n").filter((line) => line.startsWith("agx ")),
    ).toHaveLength(0);
    expect(out).not.toMatch(/^luna-high .* killed/mu);
  });

  test("no last-good agx snapshot renders an explicit n/a", async () => {
    const home = join(scratch, "no-snapshot-home");
    const p = Bun.spawn([process.execPath, STATUSLINE], {
      stdin: new Blob([PAYLOAD]),
      stdout: "pipe",
      stderr: "pipe",
      env: isolatedStatuslineEnv({ HOME: home, PATH: bin, TZ: "UTC" }),
      timeout: 30_000,
    });
    const out = await new Response(p.stdout).text();
    const stderr = await new Response(p.stderr).text();
    expect(await p.exited, stderr).toBe(0);
    expect(out.replace(ANSI, "")).not.toContain("agx n/a");
  });
});
