import { afterAll, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendLifecycle,
  dualWriteLifecycle,
  foldByRun,
  foldBySession,
  foldLiveRuns,
  lifecyclePath,
  LifecycleEventSchema,
  readLifecycle,
  readLifecycleTail,
} from "../src/lifecycle-log.ts";
import { appendLedgerLine } from "../src/ledger.ts";
import { z } from "../../shared/src/zod.ts";
import { decodedJson } from "./decode.ts";

const root = mkdtempSync(join(tmpdir(), "agx-lifecycle-log-"));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});
const admission = (run_id: string) =>
  ({
    type: "admitted",
    run_id,
    repo: root,
    workspace: root,
    ticket: run_id,
    writes: [],
    resource: { kind: "token" },
    session_id: "fixture-session",
    record: {},
  }) satisfies Parameters<typeof appendLifecycle>[1];

test("concurrent appenders produce strictly increasing seq and complete unique lines", async () => {
  const state = join(root, "concurrent");
  const module = join(import.meta.dir, "../src/lifecycle-log.ts");
  const source = `import {appendLifecycle} from ${JSON.stringify(module)}; for(let i=0;i<12;i++){const r=appendLifecycle(process.env.TEST_STATE,{type:"admitted",run_id:process.pid+"-"+i,repo:"fixture",workspace:"fixture",ticket:"fixture",writes:[],resource:null,record:{payload:"x".repeat(16000)}});if(!r.ok){process.stderr.write(r.error);process.exit(1);}}`;
  const children = Array.from({ length: 8 }, () =>
    Bun.spawn([process.execPath, "-e", source], {
      env: { ...process.env, TEST_STATE: state },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30000,
    }),
  );
  const results = await Promise.all(
    children.map(async (child) => {
      const [exit, out, err] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      return { exit, out, err };
    }),
  );
  for (const result of results) expect(result.exit, result.err).toBe(0);
  const read = readLifecycle(state);
  expect(read.errors).toEqual([]);
  expect(read.events).toHaveLength(96);
  expect(read.events.map((event) => event.seq)).toEqual(
    Array.from({ length: 96 }, (_, index) => index + 1),
  );
  expect(new Set(read.events.map((event) => event.event_id)).size).toBe(96);
});

test("judgment append stays below 500ms with 100,000 lifecycle events", () => {
  const state = join(root, "judgment-100k");
  mkdirSync(state, { recursive: true });
  const at = Temporal.Now.instant().toString();
  const lines = Array.from({ length: 100_000 }, (_, index) =>
    JSON.stringify({
      schema: 1,
      seq: index + 1,
      event_id: crypto.randomUUID(),
      at,
      run_id: `run-${index}`,
      lineage_id: `run-${index}`,
      session_id: null,
      record: {},
      type: "judged",
      decision: "reject",
    }),
  );
  writeFileSync(lifecyclePath(state), `${lines.join("\n")}\n`);
  const started = performance.now();
  const appended = appendLifecycle(state, {
    type: "judged",
    run_id: "target-run",
    decision: "reject",
    record: { kind: "acceptance", run_id: "target-run", accept: false },
  });
  const elapsed = performance.now() - started;
  expect(appended.ok).toBe(true);
  expect(elapsed).toBeLessThan(500);
  const tail = readLifecycleTail(state, 1024);
  expect(tail.errors).toEqual([]);
  expect(tail.events.at(-1)?.run_id).toBe("target-run");
});

test("read-only and missing state readers create no files", () => {
  const state = join(root, "readonly");
  expect(appendLifecycle(state, admission("read-only")).ok).toBe(true);
  const before = readdirSync(state);
  chmodSync(state, 0o555);
  chmodSync(lifecyclePath(state), 0o444);
  expect(
    foldBySession(readLifecycle(state).events, "fixture-session"),
  ).toHaveLength(1);
  expect(foldLiveRuns(readLifecycle(state).events)).toEqual([]);
  expect(readdirSync(state)).toEqual(before);
  chmodSync(state, 0o755);
  const missing = join(root, "missing");
  expect(readLifecycle(missing)).toEqual({ events: [], errors: [] });
  expect(existsSync(missing)).toBe(false);
});

test("corrupt tail is reported and ignored, and writer refuses without changing bytes", () => {
  const state = join(root, "tail");
  expect(appendLifecycle(state, admission("tail")).ok).toBe(true);
  writeFileSync(lifecyclePath(state), '{"torn":', { flag: "a" });
  const before = readFileSync(lifecyclePath(state));
  expect(readLifecycle(state).events).toHaveLength(1);
  expect(readLifecycle(state).errors).toHaveLength(1);
  expect(appendLifecycle(state, admission("refused")).ok).toBe(false);
  expect(readFileSync(lifecyclePath(state))).toEqual(before);
  expect(readLifecycle(state).events).toHaveLength(1);
});

const invokeEvents = (
  state: string,
  args: string[] = [],
  extra: NodeJS.ProcessEnv = {},
) =>
  Bun.spawnSync(
    [
      process.execPath,
      join(import.meta.dir, "../src/main.ts"),
      "events",
      ...args,
    ],
    {
      env: {
        ...process.env,
        AGX_STATE_DIR: state,
        AGX_DISPATCHER_SESSION: "fixture-session",
        ...extra,
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10000,
    },
  );

test("events mine/json filters share ps session precedence, and readers leave bytes unchanged", () => {
  const state = join(root, "events");
  expect(appendLifecycle(state, admission("mine")).ok).toBe(true);
  expect(
    appendLifecycle(state, {
      ...admission("other"),
      session_id: "other-session",
    }).ok,
  ).toBe(true);
  const before = readFileSync(lifecyclePath(state));
  const result = invokeEvents(state, ["--mine", "--json"], {
    CLAUDE_CODE_SESSION_ID: "other-session",
  });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(
    decodedJson(LifecycleEventSchema, result.stdout.toString()).run_id,
  ).toBe("mine");
  expect(invokeEvents(state).stdout.toString().trim().split("\n")).toHaveLength(
    2,
  );
  expect(
    invokeEvents(state, ["--mine", "--json"], {
      AGX_DISPATCHER_SESSION: "",
      CLAUDE_CODE_SESSION_ID: "",
    }).stdout.toString(),
  ).toBe("");
  expect(readFileSync(lifecyclePath(state))).toEqual(before);
  for (const args of [["extra"], ["--unknown"], ["--__proto__"]])
    expect(invokeEvents(state, args).exitCode).not.toBe(0);
  writeFileSync(lifecyclePath(state), "invalid\n", { flag: "a" });
  const corrupt = invokeEvents(state, ["--json"]);
  expect(corrupt.exitCode).toBe(1);
  expect(corrupt.stderr.toString()).toContain("corrupt line");
  expect(corrupt.stdout.toString().trim().split("\n")).toHaveLength(2);
});

test("events follow replays then emits appended events once, including mine/json combined", async () => {
  const state = join(root, "follow");
  expect(appendLifecycle(state, admission("follow-first")).ok).toBe(true);
  const child = Bun.spawn(
    [
      process.execPath,
      join(import.meta.dir, "../src/main.ts"),
      "events",
      "--follow",
      "--mine",
      "--json",
    ],
    {
      env: {
        ...process.env,
        AGX_STATE_DIR: state,
        AGX_DISPATCHER_SESSION: "fixture-session",
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5000,
    },
  );
  const reader = child.stdout.getReader();
  const first = await reader.read();
  expect(
    decodedJson(LifecycleEventSchema, new TextDecoder().decode(first.value))
      .run_id,
  ).toBe("follow-first");
  expect(
    appendLifecycle(state, { ...admission("hidden"), session_id: "other" }).ok,
  ).toBe(true);
  expect(appendLifecycle(state, admission("follow-next")).ok).toBe(true);
  const next = await reader.read();
  expect(
    decodedJson(LifecycleEventSchema, new TextDecoder().decode(next.value))
      .run_id,
  ).toBe("follow-next");
  child.kill("SIGTERM");
  const [exit, err] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);
  expect(exit).not.toBe(0);
  expect(err).toBe("");
});

test("terminal appends are idempotent, cannot restart, and preserve timeout for consumers", () => {
  const state = join(root, "terminal");
  expect(appendLifecycle(state, admission("terminal")).ok).toBe(true);
  for (const outcome of ["timeout", "abandoned"] satisfies (
    | "timeout"
    | "abandoned"
  )[])
    expect(
      appendLifecycle(state, {
        type: "terminal",
        run_id: "terminal",
        outcome,
        record: {},
      }).ok,
    ).toBe(true);
  expect(readLifecycle(state).events).toHaveLength(2);
  expect(foldByRun(readLifecycle(state).events).get("terminal")?.state).toBe(
    "failed",
  );
  expect(
    foldByRun(readLifecycle(state).events).get("terminal")?.terminal,
  ).toMatchObject({ outcome: "timeout" });
  expect(
    appendLifecycle(state, {
      type: "running",
      run_id: "terminal",
      pid: process.pid,
      started_at: "now",
      record: {},
    }).ok,
  ).toBe(false);
});

test("fold retains terminal and judgment and groups lineage/session", () => {
  const state = join(root, "fold");
  expect(appendLifecycle(state, admission("run")).ok).toBe(true);
  expect(
    appendLifecycle(state, {
      type: "running",
      run_id: "run",
      pid: process.pid,
      started_at: "2026-10-13T00:00:00Z",
      record: {},
    }).ok,
  ).toBe(true);
  expect(foldLiveRuns(readLifecycle(state).events)).toHaveLength(1);
  expect(
    appendLifecycle(state, {
      type: "terminal",
      run_id: "run",
      outcome: "done",
      record: {},
    }).ok,
  ).toBe(true);
  expect(
    appendLifecycle(state, {
      type: "judged",
      run_id: "run",
      decision: "accept",
      record: {},
    }).ok,
  ).toBe(true);
  expect(foldByRun(readLifecycle(state).events).get("run")?.state).toBe("done");
  expect(
    foldBySession(readLifecycle(state).events, "fixture-session")[0]?.judgment
      ?.type,
  ).toBe("judged");
});

test("dual-written fixture folds equal today's ps fields", () => {
  const state = join(root, "ps-equivalence");
  const started_at = "2026-10-13T00:00:00Z";
  const common = {
    run_id: "ps-fixture",
    dispatcher_session: "fixture-session",
    cwd: root,
    ticket: {
      name: "ps-fixture",
      writes: [],
      proposition: { id: "H-FIXTURE" },
    },
    pick: { source: "fixture", choice: "terra-high" },
    resource: { kind: "token", labels: ["fixture"] },
    started_at,
  };
  dualWriteLifecycle(state, { ...common, kind: "admitted", repo: root });
  dualWriteLifecycle(state, { ...common, kind: "started", pid: process.pid });
  const terminal = {
    ...common,
    kind: "run",
    ended_at: "2026-10-13T00:01:00Z",
    worker: { outcome: "ok", session: "vendor-fixture" },
    report: {
      summary: "Fixture complete",
      changes: [],
      checks: [],
      for_coordinator: [],
      open: [],
    },
  };
  expect(appendLedgerLine(state, `${JSON.stringify(terminal)}\n`).ok).toBe(
    true,
  );
  expect(
    appendLedgerLine(
      state,
      `${JSON.stringify({ kind: "acceptance", run_id: common.run_id, accept: true })}\n`,
    ).ok,
  ).toBe(true);
  const result = Bun.spawnSync(
    [
      process.execPath,
      join(import.meta.dir, "../src/main.ts"),
      "ps",
      "--all",
      "--json",
    ],
    {
      env: { ...process.env, AGX_STATE_DIR: state },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 15000,
    },
  );
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const row = decodedJson(
    z.object({
      runs: z.array(
        z.looseObject({
          id: z.string(),
          name: z.string(),
          row: z.string(),
          kind: z.string(),
          labels: z.array(z.string()),
          state: z.string(),
          summary: z.string().nullable(),
          dispatcher_session: z.string().nullable(),
          proposition: z.string().nullable(),
        }),
      ),
    }),
    result.stdout.toString(),
  ).runs[0];
  const folded = foldByRun(readLifecycle(state).events).get(common.run_id);
  expect(folded?.state === row?.state).toBe(true);
  expect(folded?.session_id).toBe(row?.dispatcher_session);
  expect(folded?.record.ticket).toEqual(common.ticket);
  expect(row).toMatchObject({
    id: folded?.run_id,
    name: common.ticket.name,
    row: common.pick.choice,
    kind: common.resource.kind,
    labels: common.resource.labels,
    proposition: common.ticket.proposition.id,
    summary: "Fixture complete",
  });
  expect(folded?.judgment?.type).toBe("judged");
});
