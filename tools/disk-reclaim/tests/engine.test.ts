import { afterEach, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { hostname, tmpdir } from "node:os";
import { tryAcquire } from "../../shared/src/dir-lock.ts";
import { loadConfig, plan, run, type EngineOptions } from "../src/engine.ts";
import { Plan, ReceiptV2 } from "../src/model.ts";
import { readReceipts } from "../src/receipt.ts";
import { createSystemTarget } from "../src/targets/system.ts";
import { candidate, fakeTarget } from "./fixtures/fake-target.ts";

const dirs: string[] = [];
function options(extra: Partial<EngineOptions> = {}): EngineOptions {
  const state = mkdtempSync(join(tmpdir(), "reclaim-engine-"));
  const procDir = join(state, "proc");
  mkdirSync(procDir);
  dirs.push(state);
  const loaded = loadConfig();
  expect(loaded.config).not.toBeNull();
  return {
    context: {
      mode: "plan",
      explicit: false,
      config: loaded.config!,
      procDir,
      log: () => {},
    },
    headroom: { drives: [] },
    state,
    yes: true,
    ...extra,
  };
}
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

test("plan is read-only, validates reclaim.plan/1, and ASK/KEEP do not fail", async () => {
  const { target, acted } = fakeTarget();
  const opts = options();
  const result = await plan([target], opts);
  expect(result.exit).toBe(0);
  expect(Plan.safeParse(result.plan).success).toBe(true);
  expect(result.plan?.targets[0]?.totals).toEqual({
    reclaim: 1,
    ask: 1,
    keep: 1,
  });
  expect(acted).toEqual([]);
  expect(existsSync(join(opts.state!, "lock"))).toBe(false);
  expect(existsSync(join(opts.state!, "log.jsonl"))).toBe(false);
});
test("plan reports progress while a slow target is discovering candidates", async () => {
  const { target } = fakeTarget();
  const lines: string[] = [];
  target.plan = async () => {
    await Bun.sleep(2200);
    return [candidate("found")];
  };
  const opts = options({
    context: {
      mode: "plan",
      explicit: false,
      config: loadConfig().config!,
      progressTty: false,
      reportProgress: (name, root) => {
        lines.push(`[reclaim] ${name}: scanning ${root}`);
      },
      log: () => {},
    },
  });
  const result = await plan([target], opts);
  expect(result.exit).toBe(0);
  expect(lines.length).toBeGreaterThanOrEqual(2);
  expect(lines[0]).toContain("scanning fake");
});
test("plan reports overlapping owners as ASK and emits a valid JSON plan", async () => {
  const left = candidate("shared");
  const right = candidate("shared/child");
  const first = fakeTarget({ name: "first", candidates: [left] });
  const second = fakeTarget({ name: "second", candidates: [right] });
  const result = await plan([first.target, second.target], options());
  expect(result.exit).toBe(0);
  expect(Plan.safeParse(result.plan).success).toBe(true);
  expect(result.plan?.targets.flatMap((row) => row.candidates)).toMatchObject([
    { verdict: "ASK", reason: "ownership conflict: first, second" },
    { verdict: "ASK", reason: "ownership conflict: first, second" },
  ]);
  expect(result.plan?.targets.map((row) => row.totals.ask)).toEqual([1, 1]);
});
test("run acts only on RECLAIM, records before/after free space, and writes v2 with action results", async () => {
  const { target, acted } = fakeTarget();
  const opts = options();
  const result = await run([target], opts);
  expect(result.exit).toBe(0);
  expect(acted).toEqual(["delete"]);
  expect(Plan.safeParse(result.plan).success).toBe(true);
  expect(result.plan?.totals.freed_bytes).toBe(100);
  const receipt = readReceipts(10, opts.state).receipts[0];
  expect(ReceiptV2.safeParse(receipt).success).toBe(true);
  const parsed = ReceiptV2.safeParse(receipt);
  if (parsed.success) {
    expect(Number.isFinite(parsed.data.free_before)).toBe(true);
    expect(Number.isFinite(parsed.data.free_after)).toBe(true);
    expect(parsed.data.actions[0]).toMatchObject({
      verdict_at_act: "RECLAIM",
      ok: true,
      bytes_freed: 100,
    });
  }
  expect(existsSync(join(opts.state!, "lock"))).toBe(false);
});
test("under-lock recheck flips RECLAIM to KEEP", async () => {
  const { target, acted } = fakeTarget({ flip: true });
  const opts = options();
  const original = target.plan;
  target.plan = (ctx) => {
    if (ctx.mode === "run")
      expect(existsSync(join(opts.state!, "lock"))).toBe(true);
    return original(ctx);
  };
  const result = await run([target], opts);
  expect(result.exit).toBe(0);
  expect(acted).toEqual([]);
  expect(result.plan?.targets[0]?.candidates[0]?.verdict).toBe("KEEP");
});
test("blind targets continue after a candidate failure and still run later targets", async () => {
  const first = fakeTarget({
    candidates: [candidate("a"), candidate("b")],
    failIds: ["a"],
  });
  const second = fakeTarget({ name: "next" });
  const result = await run([first.target, second.target], options());
  expect(result.exit).toBe(1);
  expect(first.acted).toEqual(["a", "b"]);
  expect(second.acted).toEqual(["delete"]);
});
test("stopOnError restores stop-after-first-failure behavior", async () => {
  const fake = fakeTarget({
    candidates: [candidate("a"), candidate("b")],
    failIds: ["a"],
  });
  expect((await run([fake.target], options({ stopOnError: true }))).exit).toBe(
    1,
  );
  expect(fake.acted).toEqual(["a"]);
});
test("non-blind targets retain stop-after-first-failure behavior", async () => {
  const fake = fakeTarget({
    tier: "owner",
    candidates: [candidate("a"), candidate("b")],
    failIds: ["a"],
  });
  expect((await run([fake.target], options())).exit).toBe(1);
  expect(fake.acted).toEqual(["a"]);
});
test("run requires yes and refuses plan-only/unnamed irreversible targets", async () => {
  expect((await run([fakeTarget().target], options({ yes: false }))).exit).toBe(
    2,
  );
  expect(
    (await run([fakeTarget({ tier: "plan-only" }).target], options())).exit,
  ).toBe(2);
  expect(
    (await run([fakeTarget({ tier: "irreversible" }).target], options())).exit,
  ).toBe(2);
});
test("explicit unavailable precondition exits 4; implicit selection skips successfully", async () => {
  const { target } = fakeTarget({ available: false });
  expect((await run([target], options({ explicit: ["fake"] }))).exit).toBe(4);
  expect((await run([target], options())).exit).toBe(0);
});
test("system precondition skips successfully for tier selection and exits 4 when named", async () => {
  for (const systemOptions of [
    { wsl: true, sudo: false },
    { wsl: false, sudo: true },
  ]) {
    const logs: string[] = [];
    const target = createSystemTarget(systemOptions);
    const implicit = await run(
      [target],
      options({
        context: {
          mode: "plan",
          explicit: false,
          config: loadConfig().config!,
          log: (line) => {
            logs.push(line);
          },
        },
      }),
    );
    expect(implicit.exit).toBe(0);
    expect(logs.some((line) => line.startsWith("SKIP system:"))).toBe(true);

    logs.length = 0;
    const named = await run(
      [target],
      options({
        explicit: ["system"],
        context: {
          mode: "plan",
          explicit: false,
          config: loadConfig().config!,
          log: (line) => {
            logs.push(line);
          },
        },
      }),
    );
    expect(named.exit).toBe(4);
    expect(logs.some((line) => line.startsWith("SKIP system:"))).toBe(true);
  }
});
test("busy lock waits briefly, returns 3 and never acts", async () => {
  const opts = options();
  const fake = fakeTarget();
  const held = tryAcquire(join(opts.state!, "lock"), {
    pid: process.pid,
    host: hostname(),
    what: "other",
    since: "now",
  });
  const old = process.env.RECLAIM_LOCK_WAIT_S;
  process.env.RECLAIM_LOCK_WAIT_S = "0.01";
  const result = await run([fake.target], opts);
  if (old === undefined) delete process.env.RECLAIM_LOCK_WAIT_S;
  else process.env.RECLAIM_LOCK_WAIT_S = old;
  if (held.ok) held.release();
  expect(result.exit).toBe(3);
  expect(result.error).toContain("held by other");
  expect(fake.acted).toEqual([]);
});
test("unknown check cannot masquerade as RECLAIM", async () => {
  const bad = candidate("x");
  bad.checks[0]!.ok = null;
  expect(
    (await plan([fakeTarget({ candidates: [bad] }).target], options())).exit,
  ).toBe(2);
});

function missingCandidates(): ReturnType<typeof candidate>[] {
  readFileSync("/no/such/reclaim-recheck-fixture");
  return [];
}

test("recheck ASK is not acted on, and failed rechecks fail closed", async () => {
  const fake = fakeTarget();
  const original = fake.target.plan;
  fake.target.plan = (ctx) =>
    ctx.mode === "run" ? [candidate("delete", "ASK")] : original(ctx);
  const result = await run([fake.target], options());
  expect(result.exit).toBe(0);
  expect(fake.acted).toEqual([]);
  expect(result.plan?.targets[0]?.candidates[0]?.verdict).toBe("ASK");
  fake.target.plan = (ctx) =>
    ctx.mode === "run" ? missingCandidates() : original(ctx);
  expect(
    (await run([fake.target], options())).plan?.targets[0]?.candidates[0]
      ?.reason,
  ).toContain("ENOENT");
  expect(fake.acted).toEqual([]);
});
test("a thrown action is a partial failure with a receipt and releases the lock", async () => {
  const fake = fakeTarget();
  const opts = options();
  fake.target.act = () => {
    readFileSync("/no/such/reclaim-action-fixture");
    return { ok: true, bytes_freed: 0, error: null };
  };
  const result = await run([fake.target], opts);
  expect(result.exit).toBe(1);
  expect(existsSync(join(opts.state!, "lock"))).toBe(false);
  const receipt = ReceiptV2.safeParse(readReceipts(1, opts.state).receipts[0]);
  expect(receipt.success).toBe(true);
  if (receipt.success)
    expect(receipt.data.actions[0]?.error).toContain("ENOENT");
});
