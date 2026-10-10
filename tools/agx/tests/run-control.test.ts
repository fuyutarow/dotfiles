import { afterAll, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "../../shared/src/zod.ts";
import { decodedJson } from "./decode.ts";

const CLI = join(import.meta.dir, "..", "src", "agx.ts");
const scratch = mkdtempSync(join(tmpdir(), "agx-run-control-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function cli(
  args: string[],
  state: string,
  env: Record<string, string> = {},
): { code: number; out: string; err: string } {
  const result = Bun.spawnSync([process.execPath, CLI, ...args], {
    env: { ...process.env, AGX_STATE_DIR: state, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: result.exitCode ?? -1,
    out: result.stdout.toString(),
    err: result.stderr.toString(),
  };
}

function marker(
  runId: string,
  pid: number,
  dispatcherSession: string,
  startedAt: string,
): Record<string, unknown> {
  return {
    schema: 1,
    run_id: runId,
    display_id: `agt_${runId}`,
    kind: "token",
    labels: ["fixture"],
    pid,
    label: `work for ${runId}`,
    choice: "luna-low",
    pick_source: "jev",
    started_at: startedAt,
    cwd: scratch,
    dispatcher_session: dispatcherSession,
  };
}

const PsRun = z.looseObject({
  id: z.string(),
  name: z.string(),
  row: z.string(),
  kind: z.string(),
  labels: z.array(z.string()),
  state: z.enum(["running", "returned", "done", "failed", "abandoned"]),
  age: z.string(),
  summary: z.string().nullable(),
});
const PsResult = z.looseObject({ runs: z.array(PsRun) });

test("ps filters to this Claude session and --all includes other sessions", () => {
  const state = join(scratch, "ps-state");
  const active = join(state, "active");
  mkdirSync(active, { recursive: true });
  const started = Temporal.Now.instant().subtract({ seconds: 65 }).toString();
  const ended = Temporal.Now.instant().toString();
  writeFileSync(
    join(active, "running-own.json"),
    JSON.stringify(marker("running-own", process.pid, "session-own", started)),
  );
  const report = {
    summary: "Finished successfully\nwith the final check passing.",
    changes: [],
    checks: [],
    for_coordinator: [],
    open: [],
  };
  const records = [
    {
      kind: "run",
      run_id: "done-own",
      display_id: "agt_done",
      dispatcher_session: "session-own",
      started_at: started,
      ended_at: ended,
      resource: { kind: "compute", labels: ["gpu"] },
      pick: { source: "jev", choice: "terra-high" },
      worker: { outcome: "ok" },
      report,
    },
    {
      kind: "run",
      run_id: "returned-other",
      display_id: "agt_other",
      dispatcher_session: "session-other",
      started_at: started,
      ended_at: ended,
      resource: { kind: "token", labels: ["docs"] },
      pick: { source: "jev", choice: "luna-low" },
      worker: { outcome: "returned" },
    },
  ];
  writeFileSync(
    join(state, "runs.jsonl"),
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
  );

  const own = cli(["ps", "--json"], state, {
    CLAUDE_CODE_SESSION_ID: "session-own",
  });
  expect(own.code).toBe(0);
  const ownRuns = decodedJson(PsResult, own.out).runs;
  expect(ownRuns.map((run) => run.id).toSorted()).toEqual([
    "done-own",
    "running-own",
  ]);
  expect(ownRuns.find((run) => run.id === "done-own")).toMatchObject({
    state: "done",
    kind: "compute",
    labels: ["gpu"],
    summary: "Finished successfully with the final check passing.",
  });
  expect(ownRuns.find((run) => run.id === "running-own")?.state).toBe(
    "running",
  );

  const all = cli(["ps", "--all", "--json"], state, {
    CLAUDE_CODE_SESSION_ID: "session-own",
  });
  expect(all.code).toBe(0);
  expect(decodedJson(PsResult, all.out).runs).toHaveLength(3);
});

test("ledger gc records dead markers, leaves live markers, and supports dry-run", () => {
  const state = join(scratch, "gc-state");
  const active = join(state, "active");
  mkdirSync(active, { recursive: true });
  const started = Temporal.Now.instant().subtract({ seconds: 10 }).toString();
  const dead = join(active, "dead-run.json");
  const live = join(active, "live-run.json");
  writeFileSync(
    dead,
    JSON.stringify(marker("dead-run", 2_147_483_647, "old", started)),
  );
  writeFileSync(
    live,
    JSON.stringify(marker("live-run", process.pid, "current", started)),
  );

  const dry = cli(["ledger", "gc", "--dry-run"], state);
  expect(dry.code).toBe(0);
  expect(dry.out).toContain("would mark 1 abandoned");
  expect(existsSync(dead)).toBe(true);
  expect(existsSync(join(state, "runs.jsonl"))).toBe(false);

  const collected = cli(["ledger", "gc"], state);
  expect(collected.code).toBe(0);
  expect(collected.out.trim().split("\n")).toHaveLength(1);
  expect(collected.out).toContain("marked 1 abandoned");
  expect(existsSync(dead)).toBe(false);
  expect(existsSync(live)).toBe(true);
  const record = decodedJson(
    z.looseObject({
      kind: z.literal("abandoned"),
      run_id: z.string(),
      when: z.string(),
      last_known_state: z.string(),
    }),
    readFileSync(join(state, "runs.jsonl"), "utf8").trim(),
  );
  expect(record.run_id).toBe("dead-run");
  expect(record.last_known_state).toBe("running");
  const listed = cli(["ps", "--all", "--json"], state);
  expect(listed.code).toBe(0);
  expect(
    decodedJson(PsResult, listed.out).runs.find((run) => run.id === "dead-run")
      ?.state,
  ).toBe("abandoned");
});

test("dispatch --detach builds Linux systemd-run argv through a stub and reaps stale markers", () => {
  const state = join(scratch, "detach-state");
  const active = join(state, "active");
  const stubDir = join(scratch, "systemd-stub");
  mkdirSync(active, { recursive: true });
  mkdirSync(stubDir, { recursive: true });
  const staleMarker = join(active, "stale-before-dispatch.json");
  writeFileSync(
    staleMarker,
    JSON.stringify(
      marker(
        "stale-before-dispatch",
        2_147_483_647,
        "old-session",
        Temporal.Now.instant().subtract({ seconds: 10 }).toString(),
      ),
    ),
  );
  const capture = join(scratch, "systemd-run-argv.txt");
  const stub = join(stubDir, "systemd-run");
  writeFileSync(stub, '#!/bin/sh\nprintf "%s\\n" "$@" > "$AGX_CAPTURE"\n');
  chmodSync(stub, 0o755);
  const prompt = join(scratch, "detached-brief.md");
  writeFileSync(
    prompt,
    "RESOURCE-CLASS(NONCOMPUTE): detached test\nBuild argv only.\n",
  );

  const result = cli(
    [
      "dispatch",
      "--prompt-file",
      prompt,
      "--cd",
      scratch,
      "--sandbox",
      "none",
      "--name",
      "detach_test",
      "--detach",
    ],
    state,
    {
      AGX_DETACH_PLATFORM: "linux",
      AGX_CAPTURE: capture,
      AGX_PROBE: "forwarded",
      CLAUDE_CODE_SESSION_ID: "session-detached",
      CLAUDE_PID: "4321",
      PATH: `${stubDir}:${process.env.PATH ?? ""}`,
    },
  );
  expect(result.code).toBe(0);
  expect(result.err).toContain("marked 1 abandoned run");
  expect(existsSync(staleMarker)).toBe(false);
  expect(result.out).toContain("journalctl --user -u agx-detach_test-");

  const args = readFileSync(capture, "utf8").trim().split("\n");
  expect(args).toContain("--user");
  expect(args).toContain("--collect");
  expect(args).toContain(`--working-directory=${resolve(scratch)}`);
  expect(args.some((arg) => arg.startsWith("--unit=agx-detach_test-"))).toBe(
    true,
  );
  expect(args.some((arg) => arg.startsWith("--setenv=PATH="))).toBe(true);
  expect(args.some((arg) => arg.startsWith("--setenv=HOME="))).toBe(true);
  expect(args).toContain("--setenv=CLAUDE_CODE_SESSION_ID=session-detached");
  expect(args).toContain("--setenv=CLAUDE_PID=4321");
  expect(args).toContain(`--setenv=AGX_STATE_DIR=${state}`);
  expect(args).toContain("--setenv=AGX_PROBE=forwarded");

  const separator = args.indexOf("--");
  const childArgs = args.slice(separator + 1);
  expect(childArgs).toContain(process.execPath);
  expect(childArgs).toContain("dispatch");
  expect(childArgs).not.toContain("--detach");
  const runIdIndex = childArgs.indexOf("--run-id");
  const runId = childArgs[runIdIndex + 1];
  expect(runId).toBeDefined();
  expect(result.out).toContain(`run_id: ${runId}`);
  expect(childArgs).toContain("--name");
  expect(childArgs).toContain("detach_test");
});
