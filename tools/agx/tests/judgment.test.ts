import { afterAll, expect, test } from "bun:test";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

test("note immediately after RETURN waits for the exact live attempt to finalize", async () => {
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
  const pending = run(state, [
    "ledger",
    "note",
    "work",
    "--accept",
    "--no-review",
    "live check",
  ]);
  await Bun.sleep(400);
  appendFileSync(
    join(state, "runs.jsonl"),
    JSON.stringify(row("new", { ticket: { name: "work", writes: [] } })) + "\n",
  );
  const result = await pending;
  expect(result.code, result.err).toBe(0);
  expect(result.out).toContain('"run_id":"new"');
  expect(result.out).toContain('"no_review":"live check"');
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

test("independent review is stored and shown; self, missing and lineage reviews refuse", async () => {
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
  for (const id of [
    "work",
    "parent",
    "child",
    "grandchild",
    "cousin",
    "session-peer",
    "sibling",
    "missing",
  ]) {
    const result = await run(state, [
      "ledger",
      "note",
      "work",
      "--accept",
      "--review",
      id,
    ]);
    expect(result.code, id).toBe(2);
  }
  const accepted = await run(state, [
    "ledger",
    "note",
    "work",
    "--accept",
    "--review",
    "review",
  ]);
  expect(accepted.code, accepted.err).toBe(0);
  expect(accepted.out).toContain('"review":"review"');
  const shown = await run(state, ["show", "work", "--json"]);
  expect(shown.out).toContain('"review":"review"');
  expect((await run(state, ["show", "work"])).out).toContain("review=review");
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

test("unknown run refusal includes observed state and an exact retry command", async () => {
  const state = fixture("unknown", []);
  const result = await run(state, [
    "ledger",
    "note",
    "missing",
    "--reject",
    "--note",
    "not used",
  ]);
  expect(result.code).toBe(2);
  expect(result.err).toContain("state=unknown");
  expect(result.err).toContain(
    "retry: agx ledger note 'missing' --reject --note 'not used'",
  );
});
