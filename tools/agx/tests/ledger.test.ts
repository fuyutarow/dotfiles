import { afterAll, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../shared/src/zod.ts";
import { ledgerFiles, ledgerLines, rotateRunsLog } from "../src/ledger.ts";

const CLI = join(import.meta.dir, "..", "src", "main.ts");
const scratch = mkdtempSync(join(tmpdir(), "agx-ledger-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function run(
  args: string[],
  state: string,
): { code: number; out: string; err: string } {
  const result = Bun.spawnSync([process.execPath, CLI, ...args], {
    env: { ...process.env, AGX_STATE_DIR: state },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: result.exitCode ?? -1,
    out: result.stdout.toString(),
    err: result.stderr.toString(),
  };
}

test("rotation preserves every JSONL record across the live ledger and archives", () => {
  const state = join(scratch, "rotation-state");
  mkdirSync(state, { recursive: true });
  const expected = Array.from({ length: 20 }, (_, id) =>
    JSON.stringify({ id, payload: "x".repeat(48) }),
  );
  writeFileSync(join(state, "runs.jsonl"), `${expected.join("\n")}\n`);

  const rotated = rotateRunsLog(state, { maxBytes: 500, keepBytes: 300 });
  const actual = [...ledgerLines(state)];
  const parsedIds = actual.flatMap((line) => {
    const parsed = jsonOf(z.looseObject({ id: z.number() })).safeParse(line);
    return parsed.success ? [parsed.data.id] : [];
  });

  expect(rotated.error).toBeUndefined();
  expect(rotated.archivedBytes).toBeGreaterThan(0);
  expect(ledgerFiles(state)).toHaveLength(2);
  expect(parsedIds.toSorted((left, right) => left - right)).toEqual(
    Array.from({ length: 20 }, (_, id) => id),
  );
  expect(new Set(parsedIds).size).toBe(20);
  expect(statSync(join(state, "runs.jsonl")).size).toBeLessThan(400);
});

test("stats --all and export read dated archives", () => {
  const state = join(scratch, "archive-read-state");
  mkdirSync(state, { recursive: true });
  const started = Temporal.Now.instant().toString();
  const records = Array.from({ length: 3 }, (_, index) =>
    JSON.stringify({
      kind: "run",
      run_id: `archive-run-${index}`,
      started_at: started,
      pick: { source: "explicit", choice: "sol-low" },
      worker: { outcome: "ok", elapsed_s: 2 },
      exit: 0,
      stats: { row: "sol-low", outcome: "ok", elapsed_s: 2 },
      padding: "x".repeat(240),
    }),
  );
  writeFileSync(join(state, "runs.jsonl"), `${records.join("\n")}\n`);
  const rotated = rotateRunsLog(state, { maxBytes: 200, keepBytes: 160 });
  expect(rotated.error).toBeUndefined();

  const stats = run(["ledger", "stats", "--all"], state);
  const statsReport = jsonOf(z.looseObject({ records: z.number() })).safeParse(
    stats.out.trim(),
  );
  expect(stats.code).toBe(0);
  expect(statsReport.success).toBe(true);
  expect(statsReport.success && statsReport.data.records).toBe(3);

  const exported = run(["ledger", "export"], state);
  expect(exported.code).toBe(0);
  expect(exported.out.trim().split("\n")).toHaveLength(3);
});

test("ps and stale-marker gc stay bounded on a 74 MiB ledger", () => {
  const state = join(scratch, "large-ledger-state");
  const active = join(state, "active");
  mkdirSync(active, { recursive: true });
  const row = JSON.stringify({
    kind: "run",
    run_id: "synthetic-run",
    dispatcher_session: "synthetic-session",
    started_at: "2026-10-10T00:00:00.000Z",
    pick: { source: "explicit", choice: "sol-low" },
  });
  const block = `${Array.from({ length: 1_000 }, () => row).join("\n")}\n`;
  const targetBytes = 74 * 1024 * 1024;
  const synthetic = block
    .repeat(Math.ceil(targetBytes / block.length))
    .slice(0, targetBytes);
  writeFileSync(join(state, "runs.jsonl"), synthetic);

  const psStarted = performance.now();
  const ps = run(["ps", "--all", "--json"], state);
  const psElapsed = performance.now() - psStarted;
  expect(statSync(join(state, "runs.jsonl")).size).toBe(targetBytes);
  expect(ps.code).toBe(0);
  expect(psElapsed).toBeLessThan(15_000);

  writeFileSync(
    join(active, "stale.json"),
    JSON.stringify({
      schema: 1,
      run_id: "stale-before-gc",
      pid: 2_147_483_647,
      display_id: "agt_stale",
      kind: "token",
      labels: ["fixture"],
      label: "stale fixture",
      choice: "sol-low",
      pick_source: "explicit",
      started_at: "2026-10-10T00:00:00.000Z",
      cwd: scratch,
      dispatcher_session: "synthetic-session",
    }),
  );
  const gcStarted = performance.now();
  const gc = run(["ledger", "gc"], state);
  const gcElapsed = performance.now() - gcStarted;
  expect(gc.code).toBe(0);
  expect(gcElapsed).toBeLessThan(15_000);
  expect(ledgerFiles(state)).toHaveLength(2);
});
