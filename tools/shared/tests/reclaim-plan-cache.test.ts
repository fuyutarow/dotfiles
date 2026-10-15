import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readReclaimPlanCache,
  writeReclaimPlanCache,
} from "../src/reclaim-plan-cache.ts";

test("cached plan contains only capped, safe blind candidates and expires", async () => {
  const home = await mkdtemp(join(tmpdir(), "reclaim-plan-cache-"));
  await using cleanup = new AsyncDisposableStack();
  cleanup.defer(async () => {
    await rm(home, { recursive: true, force: true });
  });
  const plan = {
    targets: [
      {
        tier: "blind",
        candidates: [
          { id: "cache-a", verdict: "RECLAIM", bytes: 12 },
          { id: "ask", verdict: "ASK", bytes: 99 },
        ],
      },
      {
        tier: "owner",
        candidates: [{ id: "owner", verdict: "RECLAIM", bytes: 8 }],
      },
    ],
  };
  await writeReclaimPlanCache(plan, home, 1000);
  expect(await readReclaimPlanCache(home, 1001)).toEqual([
    { name: "cache-a", bytes: 12 },
  ]);
  await writeReclaimPlanCache(
    { targets: [{ tier: "owner", candidates: [] }] },
    home,
    1002,
  );
  expect(await readReclaimPlanCache(home, 1003)).toEqual([
    { name: "cache-a", bytes: 12 },
  ]);
  expect(await readReclaimPlanCache(home, 1000 + 60 * 60 * 1000 + 1)).toEqual(
    [],
  );
});

test("missing or oversized cache is a cheap empty result", async () => {
  const home = await mkdtemp(join(tmpdir(), "reclaim-plan-cache-"));
  await using cleanup = new AsyncDisposableStack();
  cleanup.defer(async () => {
    await rm(home, { recursive: true, force: true });
  });
  expect(await readReclaimPlanCache(home)).toEqual([]);
});
