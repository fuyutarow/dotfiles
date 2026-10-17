import { afterAll, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { agxSnapshotPath, readAgxSnapshotAsync } from "../src/agx-snapshot.ts";
const root = await mkdtemp(join(tmpdir(), "statusline-owner-snapshots-"));
afterAll(() => rm(root, { recursive: true, force: true }));
const env = { HOME: root, AGX_NEXT_STATE_DIR: join(root, "state") };
test("missing owner files remain unknown and do not trigger collection", async () => {
  expect(await readAgxSnapshotAsync(env)).toMatchObject({
    rows: undefined,
    reason: "snapshot unavailable",
  });
  expect(await Bun.file(agxSnapshotPath(env)).exists()).toBe(false);
});
test("old snapshots retain values and age; owner replacement is visible immediately", async () => {
  await mkdir(env.AGX_NEXT_STATE_DIR, { recursive: true });
  const path = agxSnapshotPath(env);
  const summary = {
    running: 1,
    unattributed: 0,
    sessions: {},
    noSession: { here: 0, other: 1 },
  };
  const at = Temporal.Now.instant().epochMilliseconds - 75000;
  await writeFile(
    path,
    JSON.stringify({
      output: JSON.stringify({
        runs: [{ id: "live", state: "running" }],
        summary,
      }),
      capturedAt: at,
      exit: 0,
    }),
  );
  const before = await readAgxSnapshotAsync(env);
  expect(before.rows).toEqual([{ id: "live", state: "running" }]);
  expect(before.ageSeconds).toBe(0);
  await writeFile(
    path,
    JSON.stringify({
      output: JSON.stringify({ runs: [], summary: { ...summary, running: 0 } }),
      capturedAt: at,
      exit: 0,
    }),
  );
  expect((await readAgxSnapshotAsync(env)).rows).toEqual([]);
  await writeFile(path, "broken");
  const retained = await readAgxSnapshotAsync(env);
  expect(retained.rows).toEqual([]);
  expect(retained.ageSeconds).toBeGreaterThanOrEqual(75);
});
