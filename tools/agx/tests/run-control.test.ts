import { afterAll, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
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
import { completeTicket } from "./fixture-ticket.ts";
import { workspaceRoot } from "../src/lifecycle.ts";

const CLI = join(import.meta.dir, "..", "src", "agx.ts");
const hashText = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
// Each integration case can launch several bounded CLI children; allow loaded CI hosts.
setDefaultTimeout(20_000);
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
    timeout: 15_000,
  });
  return {
    code: result.exitCode ?? -1,
    out: result.stdout.toString(),
    err: result.stderr.toString(),
  };
}

function detachedAdmissionEnv(stubDir: string): Record<string, string> {
  const codex = join(stubDir, "codex");
  writeFileSync(
    codex,
    `#!${process.execPath}\nprocess.stdout.write("codex 0.162.0-fixture\\n");\n`,
  );
  chmodSync(codex, 0o755);
  return { AGX_CODEX_WORKER: codex, CODEX_BIN: codex };
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

test("wait --all-live snapshots fake workers, prints each receipt once and returns timeout failure", async () => {
  const state = join(scratch, "wait-all-live");
  const active = join(state, "active");
  const release = join(state, "release-second");
  mkdirSync(active, { recursive: true });
  const worker = Bun.spawn(
    [
      process.execPath,
      "-e",
      `
    import { appendFileSync, existsSync, rmSync } from "node:fs";
    const state = ${JSON.stringify(state)};
    for (const [id, result, exit] of [["first", "delivered", 0], ["second", "failed", 3]]) {
      while (id === "second" && !existsSync(state + "/release-second")) await Bun.sleep(10);
      await Bun.sleep(250);
      appendFileSync(state + "/runs.jsonl", JSON.stringify({ kind: "run", run_id: id, pick: { source: "fixture", choice: "luna-low" }, result, exit, worker: { outcome: exit === 3 ? "timeout" : "ok" } }) + "\\n");
      rmSync(state + "/active/" + id + ".json");
    }
  `,
    ],
    { stdout: "ignore", stderr: "ignore", timeout: 15_000 },
  );
  for (const id of ["first", "second"])
    writeFileSync(
      join(active, `${id}.json`),
      JSON.stringify(
        marker(id, worker.pid, "session", Temporal.Now.instant().toString()),
      ),
    );
  const waiter = Bun.spawn(
    [process.execPath, CLI, "wait", "first", "--all-live"],
    {
      env: { ...process.env, AGX_STATE_DIR: state },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 15_000,
    },
  );
  const output = async (): Promise<string> => {
    let text = "";
    const decoder = new TextDecoder();
    for await (const chunk of waiter.stdout) {
      text += decoder.decode(chunk);
      if (text.includes('"run_id":"first"'))
        writeFileSync(release, "first received");
    }
    return text;
  };
  const [out, err, code, workerExit] = await Promise.all([
    output(),
    new Response(waiter.stderr).text(),
    waiter.exited,
    worker.exited,
  ]);
  expect(code, err).toBe(3);
  const receipts = out
    .trim()
    .split("\n")
    .map(
      (line) => decodedJson(z.looseObject({ run_id: z.string() }), line).run_id,
    );
  expect(receipts).toEqual(["first", "second"]);
  expect(workerExit).toBe(0);
});

test("ps hides runs superseded by a resume unless --all is set", () => {
  const state = join(scratch, "ps-superseded");
  mkdirSync(state, { recursive: true });
  const base = {
    kind: "run",
    ticket: { name: "same-ticket", path: "/tmp/same-ticket.md", writes: [] },
    pick: { source: "fixture", choice: "luna-low" },
    result: "delivered",
    worker: { outcome: "ok" },
    report: {
      summary: "done",
      changes: [],
      checks: [],
      for_coordinator: [],
      open: [],
    },
  };
  writeFileSync(
    join(state, "runs.jsonl"),
    [
      JSON.stringify({ ...base, run_id: "old-run" }),
      JSON.stringify({ ...base, run_id: "new-run", resumed_from: "old-run" }),
    ].join("\n") + "\n",
  );
  const normal = cli(["ps", "--json"], state);
  const all = cli(["ps", "--all", "--json"], state);
  expect(normal.code).toBe(0);
  expect(all.code).toBe(0);
  expect(decodedJson(PsResult, normal.out).runs.map((run) => run.id)).toEqual([
    "new-run",
  ]);
  expect(
    decodedJson(PsResult, all.out)
      .runs.map((run) => run.id)
      .toSorted(),
  ).toEqual(["new-run", "old-run"]);
});

test("follow replays picked, started, interim RETURN and verification in timestamp order and ends", () => {
  const state = join(scratch, "follow-replay");
  mkdirSync(join(state, "events"), { recursive: true });
  const pick = { source: "fixture", choice: "luna-low" };
  const runId = "ordered";
  const events = [
    {
      kind: "started",
      run_id: runId,
      pick,
      started_at: "2026-10-11T00:00:00Z",
      sandbox: "read-only",
    },
    {
      kind: "verify",
      run_id: runId,
      pick,
      at: "2026-10-11T00:00:02Z",
      verify: [{ cmd: "true", exit: 0 }],
    },
  ];
  writeFileSync(
    join(state, "events/ordered.jsonl"),
    events.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
  );
  const log = [
    {
      kind: "interim",
      run_id: runId,
      pick,
      at: "2026-10-11T00:00:01Z",
      interim_report: { return: { interim: true } },
    },
    {
      kind: "run",
      run_id: runId,
      pick,
      ended_at: "2026-10-11T00:00:03Z",
      result: "returned",
      worker: { outcome: "returned" },
    },
  ];
  writeFileSync(
    join(state, "runs.jsonl"),
    log.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
  );
  const followed = cli(["follow", runId, "--json"], state);
  expect(followed.code, followed.err).toBe(0);
  const states = followed.out
    .trim()
    .split("\n")
    .map(
      (line) => decodedJson(z.looseObject({ state: z.string() }), line).state,
    );
  expect(states).toEqual([
    "picked",
    "started",
    "interim RETURN",
    "verify result",
    "terminal",
  ]);
  expect(cli(["follow", runId, "extra"], state).code).toBe(2);
  expect(cli(["wait", runId, "extra"], state).code).toBe(2);
});

test("show exposes interim progress for a live run and its statusline phase", () => {
  const state = join(scratch, "live-interim-state");
  const active = join(state, "active");
  mkdirSync(active, { recursive: true });
  const phase = "working after interim RETURN 1";
  writeFileSync(
    join(active, "live-interim.json"),
    JSON.stringify({
      ...marker(
        "live-interim",
        process.pid,
        "session",
        Temporal.Now.instant().toString(),
      ),
      phase,
      interim_reports: [
        { return: { interim: true, findings: [{ text: "CLI shapes ready" }] } },
      ],
    }),
  );
  const shown = cli(["show", "live-interim", "--json"], state);
  expect(shown.code, shown.err).toBe(0);
  const progress = decodedJson(
    z.looseObject({ phase: z.string(), interim_reports: z.array(z.unknown()) }),
    shown.out,
  );
  expect(progress.phase).toBe(phase);
  expect(progress.interim_reports).toHaveLength(1);
  expect(cli(["show", "live-interim"], state).out).toContain(
    "CLI shapes ready",
  );
});

test("show and ps expose the ticket and live selection, cost, activity and elapsed fields", () => {
  const state = join(scratch, "live-ticket-fields");
  const active = join(state, "active");
  mkdirSync(active, { recursive: true });
  const started = Temporal.Now.instant().subtract({ seconds: 65 }).toString();
  const at = Temporal.Now.instant().toString();
  writeFileSync(
    join(active, "ticket-fields.json"),
    JSON.stringify({
      ...marker("ticket-fields", process.pid, "session", started),
      ticket: { name: "u24_copyfix", writes: [] },
      picked_probability: 0.73,
      cost_usd: 0.125,
      phase: "working",
    }),
  );
  writeFileSync(
    join(active, "ticket-fields.progress.json"),
    JSON.stringify({
      schema: 1,
      at,
      last: "checking ticket lookup",
      commands: 2,
      files: 1,
      cost_usd: 0.25,
      session: "vendor-live-fields",
    }),
  );
  const shown = cli(["show", "u24_copyfix"], state);
  expect(shown.code, shown.err).toBe(0);
  for (const field of [
    "ticket=u24_copyfix",
    "row=luna-low",
    "probability=0.73",
    "cost=$0.250000",
    "phase=working",
    "checking ticket lookup",
    at,
    "elapsed=1m",
  ])
    expect(shown.out).toContain(field);
  const json = cli(["show", "vendor-live-fields", "--json"], state);
  expect(json.code, json.err).toBe(0);
  expect(
    decodedJson(
      z.looseObject({
        name: z.string(),
        row: z.string(),
        picked_probability: z.number(),
        cost_usd: z.number(),
        last_activity: z.string(),
        elapsed_s: z.number(),
      }),
      json.out,
    ),
  ).toMatchObject({
    name: "u24_copyfix",
    row: "luna-low",
    picked_probability: 0.73,
    cost_usd: 0.25,
    last_activity: "checking ticket lookup",
  });
  const listed = cli(["ps", "--json"], state);
  expect(decodedJson(PsResult, listed.out).runs[0]?.name).toBe("u24_copyfix");
});

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
    "returned-other",
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
  expect(ownRuns[0]?.state).toBe("running");

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
  expect(collected.out.trim().split("\n")).toHaveLength(2);
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

test("ticket lookup orders fractional timestamps chronologically for show and ledger note", () => {
  const state = join(scratch, "fractional-timestamp-lookup");
  mkdirSync(state);
  const rows = [
    { run_id: "earlier", started_at: "2026-10-13T04:00:00.1Z" },
    { run_id: "latest", started_at: "2026-10-13T04:00:00.11Z" },
  ].map(({ run_id, started_at }) => ({
    run_id,
    started_at,
    kind: "run",
    cwd: scratch,
    ticket: { name: "latest_note", writes: [] },
    pick: { source: "fixture", choice: "luna-low" },
    worker: { outcome: "ok", last_message: "done" },
  }));
  writeFileSync(
    join(state, "runs.jsonl"),
    rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
  );
  const shown = cli(["show", "latest_note", "--json"], state);
  expect(shown.code, shown.err).toBe(0);
  expect(
    decodedJson(z.looseObject({ run_id: z.string() }), shown.out).run_id,
  ).toBe("latest");
  const noted = cli(["ledger", "note", "latest_note", "--consumed"], state);
  expect(noted.code, noted.err).toBe(0);
  expect(
    decodedJson(z.looseObject({ run_id: z.string() }), noted.out).run_id,
  ).toBe("latest");
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
    completeTicket(
      "+++\nschema = 2\n+++\nRESOURCE-CLASS(NONCOMPUTE): detached test\nBuild argv only.\n",
    ),
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
      "--row",
      "luna-low",
      "--approval",
      "fixture",
      "--no-grader",
    ],
    state,
    {
      ...detachedAdmissionEnv(stubDir),
      AGX_DETACH_PLATFORM: "linux",
      AGX_CAPTURE: capture,
      AGX_PROBE: "forwarded",
      CLAUDE_CODE_SESSION_ID: "session-detached",
      CLAUDE_PID: "4321",
      PATH: `${stubDir}:${process.env.PATH ?? ""}`,
    },
  );
  expect(result.code, result.err).toBe(0);
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
  expect(args).toContain(`--setenv=AGX_DISPATCH_ROOT=${resolve(scratch)}`);

  const separator = args.indexOf("--");
  const childArgs = args.slice(separator + 1);
  expect(childArgs).toContain(process.execPath);
  expect(childArgs).toContain("dispatch");
  expect(childArgs).not.toContain("--detach");
  const runIdIndex = childArgs.indexOf("--run-id");
  const runId = childArgs[runIdIndex + 1];
  expect(runId).toBeDefined();
  expect(result.out).toContain(`run_id: ${runId}`);
  const decisionArg = args.find((arg) =>
    arg.startsWith("--setenv=AGX_ADMITTED_LAUNCH="),
  );
  expect(decisionArg).toBeDefined();
  const decision = decodedJson(
    z.looseObject({
      flags: z.looseObject({ name: z.string(), runId: z.string() }),
      pick: z.looseObject({ choice: z.string() }),
    }),
    readFileSync(
      decisionArg?.slice("--setenv=AGX_ADMITTED_LAUNCH=".length) ?? "",
      "utf8",
    ),
  );
  expect(decision.flags.name).toBe("detach_test");
  expect(runId).toBe(decision.flags.runId);
  expect(decision.pick.choice).toBe("luna-low");
});

test("dispatch --detach refuses a GPU ticket when nvidia-smi is absent", () => {
  const state = join(scratch, "detach-gpu-state");
  const emptyPath = join(scratch, "detach-gpu-path");
  mkdirSync(emptyPath, { recursive: true });
  const prompt = join(scratch, "detached-gpu-brief.md");
  writeFileSync(
    prompt,
    completeTicket(
      "+++\nschema = 2\nrequires_gpu = true\n+++\nRESOURCE-CLASS(NONCOMPUTE): fixture visibility probe\nGPU task\n",
    ),
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
      "detach_gpu",
      "--detach",
      "--row",
      "luna-low",
      "--approval",
      "fixture",
      "--no-grader",
    ],
    state,
    { AGX_DETACH_PLATFORM: "linux", PATH: emptyPath },
  );
  expect(result.code).not.toBe(0);
  expect(result.err).toContain("GPU not visible in this unit");
  expect(result.err).toContain(`nvidia-smi not found on PATH=${emptyPath}`);
});

test("host snapshot lists detached writers without admissions or visible PIDs, while empty writes stay unleased", () => {
  const state = join(scratch, "host-liveness");
  mkdirSync(state);
  const ids = ["m10_v2", "ed_unify", "si_unify", "sbk_restore2"];
  const rows = ids.flatMap((run_id) => [
    {
      kind: "detached",
      run_id,
      cwd: process.cwd(),
      ticket: { name: run_id, writes: [] },
    },
    ...(run_id === "sbk_restore2"
      ? []
      : [
          {
            kind: "started",
            run_id,
            pid: 2147483647,
            cwd: process.cwd(),
            ticket: { name: run_id, writes: [`${run_id}/**`] },
          },
        ]),
  ]);
  writeFileSync(
    join(state, "runs.jsonl"),
    rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
  );
  const snapshot = join(state, "live.json");
  writeFileSync(snapshot, JSON.stringify(ids));
  const result = cli(["ps", "--leases", "--json"], state, {
    AGX_LIVE_RUN_IDS_FILE: snapshot,
  });
  expect(result.code).toBe(0);
  expect(result.out).toContain("m10_v2");
  expect(result.out).toContain("ed_unify");
  expect(result.out).toContain("si_unify");
  expect(result.out).not.toContain("sbk_restore2");
  expect(existsSync(join(state, "write-leases"))).toBe(false);
  expect(existsSync(join(state, "admissions"))).toBe(false);
  writeFileSync(snapshot, "[]");
  expect(
    cli(["ps", "--leases", "--json"], state, {
      AGX_LIVE_RUN_IDS_FILE: snapshot,
    }).out.trim(),
  ).toBe('{"schema":1,"leases":[]}');
});

test("ledger gc prunes judged write leases and ps --leases uses the same result", () => {
  const state = join(scratch, "gc-write-lease-state");
  const repo = workspaceRoot(process.cwd());
  const runId = "judged-write-lease";
  const hash = hashText;
  const leaseDir = join(state, "write-leases", hash(repo));
  mkdirSync(leaseDir, { recursive: true });
  writeFileSync(
    join(leaseDir, `${hash(runId)}.json`),
    JSON.stringify({
      repo,
      run_id: runId,
      cwd: scratch,
      writes: ["tools/agx/**"],
      ticket: "judged",
      dispatcher_session: "fixture-session",
      since: "2026-10-12T00:00:00Z",
    }),
  );
  writeFileSync(
    join(state, "runs.jsonl"),
    `${JSON.stringify({ kind: "run", run_id: runId, repo, cwd: scratch, ticket: { name: "judged", writes: ["tools/agx/**"] }, facts: { changed_files: ["tools/agx/src/agx.ts"] }, pick: { source: "fixture", choice: "luna-low" } })}\n${JSON.stringify({ kind: "acceptance", run_id: runId, accept: false, at: "2026-10-12T00:01:00Z" })}\n`,
  );

  const beforeGc = cli(["ps", "--leases", "--json"], state);
  expect(beforeGc.code, beforeGc.err).toBe(0);
  expect(
    decodedJson(z.looseObject({ leases: z.array(z.unknown()) }), beforeGc.out)
      .leases,
  ).toEqual([]);
  expect(existsSync(join(leaseDir, `${hash(runId)}.json`))).toBe(true);
  expect(existsSync(join(leaseDir, ".lock"))).toBe(false);

  const collected = cli(["ledger", "gc"], state);
  expect(collected.code, collected.err).toBe(0);
  expect(existsSync(join(leaseDir, `${hash(runId)}.json`))).toBe(false);
  const listed = cli(["ps", "--leases", "--json"], state);
  expect(listed.code, listed.err).toBe(0);
  expect(
    decodedJson(z.looseObject({ leases: z.array(z.unknown()) }), listed.out)
      .leases,
  ).toEqual([]);
});

test("dispatch --detach reports lease refusal before creating a unit or run_id", () => {
  const state = join(scratch, "detach-lease-state");
  const active = join(state, "active");
  const stubDir = join(scratch, "detach-lease-stub");
  mkdirSync(active, { recursive: true });
  mkdirSync(stubDir, { recursive: true });
  const runId = "existing-live-holder";
  const repo = resolve(scratch);
  const timestamp = Temporal.Now.instant().toString();
  const hash = hashText;
  writeFileSync(
    join(active, `${runId}.json`),
    JSON.stringify({
      ...marker(runId, process.pid, "holder-session", timestamp),
      ticket: { name: "existing-holder", writes: ["tools/agx/**"] },
    }),
  );
  const leaseDir = join(state, "write-leases", hash(repo));
  mkdirSync(leaseDir, { recursive: true });
  writeFileSync(
    join(leaseDir, `${hash(runId)}.json`),
    JSON.stringify({
      repo,
      run_id: runId,
      cwd: scratch,
      writes: ["tools/agx/**"],
      ticket: "existing-holder",
      dispatcher_session: "holder-session",
      since: timestamp,
    }),
  );
  writeFileSync(
    join(state, "runs.jsonl"),
    JSON.stringify({
      kind: "admitted",
      lease_version: 1,
      run_id: runId,
      repo,
      cwd: scratch,
      ticket: { name: "existing-holder", writes: ["tools/agx/**"] },
    }) + "\n",
  );
  const capture = join(scratch, "detach-lease-argv.txt");
  const stub = join(stubDir, "systemd-run");
  writeFileSync(stub, '#!/bin/sh\nprintf "%s\\n" "$@" > "$AGX_CAPTURE"\n');
  chmodSync(stub, 0o755);
  const prompt = join(scratch, "detached-lease-brief.md");
  writeFileSync(
    prompt,
    completeTicket(
      '+++\nschema = 2\nwrites = ["tools/agx/**"]\n+++\nRESOURCE-CLASS(NONCOMPUTE): detached lease test\nMust refuse before launch.\n',
    ),
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
      "detach_lease",
      "--detach",
      "--row",
      "luna-low",
      "--approval",
      "fixture",
      "--no-grader",
    ],
    state,
    {
      ...detachedAdmissionEnv(stubDir),
      AGX_DETACH_PLATFORM: "linux",
      AGX_CAPTURE: capture,
      CLAUDE_CODE_SESSION_ID: "session-detached-lease",
      PATH: `${stubDir}:${process.env.PATH ?? ""}`,
    },
  );
  expect(result.code, result.err).toBe(2);
  expect(result.err).toContain("existing-live-holder");
  expect(result.out).not.toContain("run_id:");
  expect(existsSync(capture)).toBe(false);
});
