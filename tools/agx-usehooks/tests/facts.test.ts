import { afterEach, expect, spyOn, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as conditions from "../src/conditions.ts";
import {
  gpuUtil,
  launcherRunsToday,
  minutesSinceLastResult,
} from "../src/index.ts";

const originalState = process.env.AGX_STATE_DIR;
const dirs: string[] = [];
function world() {
  const dir = mkdtempSync(join(tmpdir(), "agx-usehooks-facts-"));
  dirs.push(dir);
  process.env.AGX_STATE_DIR = dir;
  mkdirSync(dir, { recursive: true });
  return { dir, ctx: { cwd: dir, repoRoot: dir, payload: {} } };
}
afterEach(() => {
  if (originalState === undefined) delete process.env.AGX_STATE_DIR;
  else process.env.AGX_STATE_DIR = originalState;
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

test("launcher facts count today's project receipts and latest completed result", async () => {
  const { dir, ctx } = world();
  const now = Temporal.Now.instant();
  const started = now.toString();
  const ended = now.subtract({ minutes: 2 }).toString();
  const records = [
    {
      kind: "run",
      run_id: "today-a",
      cwd: join(dir, "nested"),
      started_at: started,
      ended_at: ended,
      result: "delivered",
    },
    {
      kind: "run",
      run_id: "today-a",
      cwd: join(dir, "nested"),
      started_at: started,
    },
    {
      kind: "run",
      run_id: "sibling",
      cwd: `${dir}-other`,
      started_at: started,
      ended_at: now.toString(),
      result: "delivered",
    },
    {
      kind: "run",
      run_id: "old",
      cwd: dir,
      started_at: now.subtract({ hours: 24 }).toString(),
      ended_at: now.subtract({ hours: 24 }).toString(),
      result: "failed",
    },
  ];
  writeFileSync(
    join(dir, "runs.jsonl"),
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n{bad json\n`,
  );
  writeFileSync(
    join(dir, `runs-${started.slice(0, 10)}.jsonl`),
    `${JSON.stringify({
      kind: "run",
      run_id: "today-b",
      cwd: dir,
      started_at: started,
      ended_at: now.subtract({ minutes: 3 }).toString(),
      result: "returned",
    })}\n`,
  );

  expect(await launcherRunsToday(ctx, { project: dir })).toBe(2);
  expect(await minutesSinceLastResult(ctx, { project: dir })).toBeCloseTo(2, 0);
  expect(
    await minutesSinceLastResult(ctx, { project: join(dir, "missing") }),
  ).toBe(null);
});

test("gpuUtil exposes the validated current reading and null when unavailable", async () => {
  const { ctx } = world();
  const device = spyOn(conditions, "gpu");
  device.mockResolvedValue({
    nowPct: 37,
    avg15Pct: null,
    avg60Pct: null,
    samples15: 1,
    memUsedGiB: 1,
    memTotalGiB: 8,
  });
  expect(await gpuUtil(ctx)).toBe(37);
  device.mockResolvedValue({ unavailable: "fixture unavailable" });
  expect(await gpuUtil(ctx)).toBeNull();
  device.mockRestore();
});
