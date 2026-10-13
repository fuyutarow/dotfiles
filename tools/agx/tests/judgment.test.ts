import { afterAll, expect, test } from "bun:test";
import { FFIType, dlopen } from "bun:ffi";
import {
  appendFileSync,
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendLifecycle,
  lifecyclePath,
  readLifecycle,
  readLifecycleTail,
} from "../src/lifecycle-log.ts";
import { listWriteLeases } from "../src/write-leases.ts";

const scratch = mkdtempSync(join(tmpdir(), "agx-judgment-"));
const CLI = join(import.meta.dir, "..", "src", "main.ts");
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});
const row = (id: string, extra = {}) => ({
  kind: "run",
  run_id: id,
  cwd: scratch,
  pick: { source: "fixture", choice: "luna-low" },
  worker: { outcome: "returned", last_message: "RETURN" },
  ...extra,
});
function fixture(name: string, rows: unknown[]) {
  const state = join(scratch, name);
  mkdirSync(state, { recursive: true });
  writeFileSync(
    join(state, "runs.jsonl"),
    rows.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
  );
  return state;
}
async function run(state: string, args: string[]) {
  const child = Bun.spawn([process.execPath, CLI, ...args], {
    env: { ...process.env, AGX_STATE_DIR: state },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5000,
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { out, err, code };
}

test("judgment appends immediately for a live ticket without scanning its run log", async () => {
  const state = fixture("return-race", [
    row("old", { ticket: { name: "work", writes: [] } }),
  ]);
  mkdirSync(join(state, "active"));
  writeFileSync(
    join(state, "active", "new.json"),
    JSON.stringify({
      schema: 1,
      run_id: "new",
      display_id: "agt_work",
      kind: "token",
      labels: [],
      pid: process.pid,
      label: "returned",
      choice: "luna-low",
      pick_source: "fixture",
      started_at: Temporal.Now.instant().toString(),
      cwd: scratch,
      ticket: { name: "work", writes: [] },
      phase: "verifying",
    }),
  );
  const result = await run(state, [
    "ledger",
    "note",
    "work",
    "--accept",
    "--no-review",
    "live check",
  ]);
  expect(result.code, result.err).toBe(0);
  expect(result.out).toContain('"run_id":"new"');
  expect(result.out).toContain('"no_review":"live check"');
  appendFileSync(
    join(state, "runs.jsonl"),
    JSON.stringify(row("new", { ticket: { name: "work", writes: [] } })) + "\n",
  );
  expect((await run(state, ["show", "work", "--json"])).out).toContain(
    '"accept":true',
  );
});

test("accept without a review reference refuses and leaves the ledger unchanged", async () => {
  const state = fixture("missing-review", [row("work")]);
  const before = readFileSync(join(state, "runs.jsonl"), "utf8");
  const result = await run(state, ["ledger", "note", "work", "--accept"]);
  expect(result.code).toBe(2);
  expect(result.err).toContain("--review");
  expect(result.err).toContain("--no-review");
  expect(readFileSync(join(state, "runs.jsonl"), "utf8")).toBe(before);
});

test("review reference is appended without scanning the ledger", async () => {
  const state = fixture("reviews", [
    row("parent"),
    row("work", {
      resumed_from: "parent",
      ticket: { name: "task", writes: [] },
      worker: {
        outcome: "returned",
        last_message: "RETURN",
        session: "same-session",
      },
    }),
    row("child", { resumed_from: "work" }),
    row("grandchild", { predecessor: "child" }),
    row("cousin", { predecessor: "parent" }),
    row("session-peer", { worker: { session: "same-session" } }),
    row("sibling", { ticket: { name: "task", writes: [] } }),
    row("review"),
  ]);
  const accepted = await run(state, [
    "ledger",
    "note",
    "work",
    "--accept",
    "--review",
    "missing-review-id",
  ]);
  expect(accepted.code, accepted.err).toBe(0);
  expect(accepted.out).toContain('"review":"missing-review-id"');
  const shown = await run(state, ["show", "work", "--json"]);
  expect(shown.out).toContain('"review":"missing-review-id"');
  expect((await run(state, ["show", "work"])).out).toContain(
    "review=missing-review-id",
  );
});

test("judgment appends while another same-repo run keeps its live lease", async () => {
  const state = fixture("judgment-with-live-peer", [row("work")]);
  const admitted = appendLifecycle(state, {
    type: "admitted",
    run_id: "live-peer",
    repo: "/repo",
    workspace: scratch,
    ticket: "live-peer",
    writes: ["src/**"],
    resource: null,
    session_id: "fixture",
    record: {
      kind: "admitted",
      run_id: "live-peer",
      repo: "/repo",
      cwd: scratch,
      ticket: { name: "live-peer", writes: ["src/**"] },
      lease_writes: ["src/**"],
      dispatcher_session: "fixture",
      started_at: Temporal.Now.instant().toString(),
    },
  });
  expect(admitted.ok).toBe(true);
  const running = appendLifecycle(state, {
    type: "running",
    run_id: "live-peer",
    pid: process.pid,
    started_at: Temporal.Now.instant().toString(),
    record: { kind: "started", run_id: "live-peer" },
  });
  expect(running.ok).toBe(true);

  const before = listWriteLeases({ stateDir: state, repo: "/repo" });
  expect(before.ok && before.value.map((lease) => lease.run_id)).toContain(
    "live-peer",
  );
  const legacyLock = join(state, "write-leases", "legacy.lock");
  mkdirSync(join(state, "write-leases"), { recursive: true });
  const lockFd = openSync(legacyLock, "a+");
  const library = dlopen(
    process.platform === "darwin" ? "/usr/lib/libSystem.B.dylib" : "libc.so.6",
    {
      flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
    },
  );
  expect(library.symbols.flock(lockFd, 2 | 4)).toBe(0);
  const judgment = await run(state, [
    "ledger",
    "note",
    "work",
    "--accept",
    "--no-review",
    "live peer check",
  ]);
  library.symbols.flock(lockFd, 8);
  closeSync(lockFd);
  library.close();
  expect(judgment.code, judgment.err).toBe(0);
  const events = readLifecycle(state).events;
  expect(
    events.some((event) => event.type === "judged" && event.run_id === "work"),
  ).toBe(true);
  expect(
    events.some(
      (event) => event.type === "disposed" && event.run_id === "live-peer",
    ),
  ).toBe(false);
  const after = listWriteLeases({ stateDir: state, repo: "/repo" });
  expect(after.ok && after.value.map((lease) => lease.run_id)).toContain(
    "live-peer",
  );
});

test("ledger reject appends in milliseconds with a 100,000-event lifecycle log", async () => {
  const state = join(scratch, "judgment-100k-events");
  mkdirSync(state, { recursive: true });
  const at = Temporal.Now.instant().toString();
  const rows = Array.from({ length: 100_000 }, (_, index) =>
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
  writeFileSync(lifecyclePath(state), `${rows.join("\n")}\n`);
  const started = performance.now();
  const result = await run(state, ["ledger", "note", "target-run", "--reject"]);
  const elapsed = performance.now() - started;
  expect(result.code, result.err).toBe(0);
  expect(elapsed).toBeLessThan(1_000);
  const tail = readLifecycleTail(state, 1_024);
  expect(tail.errors).toEqual([]);
  expect(tail.events.at(-1)).toMatchObject({
    type: "judged",
    run_id: "target-run",
    decision: "reject",
  });
});

test("review flag combinations refuse; rejection needs neither", async () => {
  const state = fixture("flag-combinations", [row("work"), row("review")]);
  for (const flags of [
    ["--accept", "--no-review", "   "],
    ["--accept", "--review", "review", "--no-review", "check"],
    ["--reject", "--review", "review"],
    ["--consumed", "--no-review", "check"],
  ]) {
    expect((await run(state, ["ledger", "note", "work", ...flags])).code).toBe(
      2,
    );
  }
  expect((await run(state, ["ledger", "note", "work", "--reject"])).code).toBe(
    0,
  );
});

test("judgment appends an explicit run id without scanning the ledger", async () => {
  const state = fixture("unknown", []);
  const result = await run(state, [
    "ledger",
    "note",
    "missing",
    "--reject",
    "--note",
    "not used",
  ]);
  expect(result.code, result.err).toBe(0);
  expect(result.out).toContain('"run_id":"missing"');
  expect(readLifecycle(state).events.at(-1)).toMatchObject({
    type: "judged",
    run_id: "missing",
    decision: "reject",
  });
});
