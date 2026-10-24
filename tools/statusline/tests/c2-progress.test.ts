import { afterAll, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { listingProgress } from "../src/dispatch-state.ts";
import {
  agxJobRunsAsync,
  agxRouteRunsAsync,
  routeLines,
} from "../src/dispatch-runs.ts";
import {
  cleanupTempDirs,
  coreSnapshot,
  seedAgxSnapshot,
  tempDir,
} from "./helpers.ts";
import { jsonOf, z } from "../src/zod.ts";

afterAll(cleanupTempDirs);
const Rows = z.array(z.looseObject({ id: z.string(), progress: z.unknown() }));
const captured = jsonOf(Rows).safeParse(
  await Bun.file(join(import.meta.dir, "fixtures/agx-c2-1.4.0.json")).text(),
);
expect(captured.success).toBe(true);
const capturedRows = captured.success ? captured.data : [];

test("released C2 rows preserve reported counts, zeros and missing progress", () => {
  const rows = capturedRows;
  expect(
    listingProgress(rows.find((row) => row.id === "reported")?.progress),
  ).toMatchObject({
    commands: 7,
    files: 3,
    costUsd: 0.125,
    session: "fixture-vendor",
  });
  expect(
    listingProgress(rows.find((row) => row.id === "zero")?.progress),
  ).toMatchObject({ commands: 0, files: 0 });
  for (const id of ["missing", "invalid"])
    expect(
      listingProgress(rows.find((row) => row.id === id)?.progress),
    ).toBeUndefined();
});

test("nullable C2 fields render unknown while real zero remains zero", () => {
  const doing = listingProgress({
    last: "working",
    at: null,
    commands: null,
    files: 0,
    cost_usd: null,
    session: null,
    future: true,
  });
  expect(doing?.ageSecs).toBeUndefined();
  expect(doing?.commands).toBeUndefined();
  const line = routeLines(
    [
      {
        displayId: undefined,
        choice: "fixture",
        label: "nullable",
        pickSource: "agx",
        phase: "working",
        workerSession: undefined,
        markerCostUsd: undefined,
        secs: 0,
        alive: true,
        dispatcherSession: "owner",
        doing,
      },
    ],
    "owner",
  ).join("\n");
  expect(line).toContain("n/a cmd · 0 files");
  expect(line).not.toContain("0 cmd");
});

test("core and Job share the collected C2 listing without private state", async () => {
  const home = tempDir("c2-reader-");
  const env = {
    HOME: home,
    AGX_STATE_DIR: join(home, "private-state"),
    PATH: "",
  };
  await mkdir(join(env.AGX_STATE_DIR, "runs", "missing"), { recursive: true });
  await Bun.write(
    join(env.AGX_STATE_DIR, "runs", "missing", "worker-progress.jsonl"),
    JSON.stringify({
      schema: 1,
      at: Temporal.Now.instant().toString(),
      last: "private decoy",
      commands: 999,
      files: 999,
    }),
  );
  const rows = capturedRows.map((row) =>
    Object.assign({}, row, { state: "running", dispatcher_session: "owner" }),
  );
  seedAgxSnapshot(
    env,
    coreSnapshot(
      JSON.stringify(rows),
      Temporal.Now.instant().epochMilliseconds,
    ),
    home,
  );
  const scan = await agxRouteRunsAsync(env, "owner", false, home);
  expect(scan.runs).toHaveLength(4);
  expect(
    scan.runs.find((row) => row.label === "reported")?.doing?.commands,
  ).toBe(7);
  expect(
    scan.runs.find((row) => row.label === "missing")?.doing,
  ).toBeUndefined();
  seedAgxSnapshot(
    env,
    coreSnapshot(
      JSON.stringify(rows),
      Temporal.Now.instant().epochMilliseconds,
    ),
  );
  expect(await agxJobRunsAsync("owner", env)).toHaveLength(4);
});
