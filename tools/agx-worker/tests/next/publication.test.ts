import { afterEach, expect, mock, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { append, flushRunPublications } from "../../src/next/store.ts";
import { leaseFor } from "../../src/next/lease.ts";
import { jsonOf, z } from "../../../shared/src/zod.ts";
const previous = process.env.AGX_NEXT_STATE_DIR;
const roots: string[] = [];
afterEach(async () => {
  mock.restore();
  await flushRunPublications();
  if (previous === undefined) delete process.env.AGX_NEXT_STATE_DIR;
  else process.env.AGX_NEXT_STATE_DIR = previous;
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
const Snapshot = z.object({
  capturedAt: z.number(),
  exit: z.literal(0),
  output: z.string(),
});
const Listing = z.object({
  runs: z.array(
    z.object({
      id: z.string(),
      state: z.string(),
      phase: z.string().optional(),
    }),
  ),
  summary: z.object({
    running: z.number(),
    sessions: z.record(
      z.string(),
      z.object({ here: z.number(), other: z.number() }),
    ),
  }),
});
test("record append publishes core facts atomically; ended bf3bb781 cannot remain working", async () => {
  const root = await mkdtemp(join(tmpdir(), "agx-publication-"));
  roots.push(root);
  process.env.AGX_NEXT_STATE_DIR = root;
  append({
    kind: "started",
    id: "bf3bb781",
    at: Temporal.Now.instant().toString(),
    ticket: "fixture",
    writes: [],
    cwd: root,
    workspace: root,
    row: "terra-high",
    dispatcher_session: "here",
    vendor_session: null,
    pid: process.pid,
    lease: await leaseFor(process.pid, null),
  });
  await flushRunPublications();
  const read = async () => {
    const snapshot = jsonOf(Snapshot).safeParse(
      await Bun.file(join(root, "current-runs.json")).text(),
    );
    expect(snapshot.success).toBe(true);
    if (!snapshot.success) return expect.unreachable("invalid owner snapshot");
    const listing = jsonOf(Listing).safeParse(snapshot.data.output);
    expect(listing.success).toBe(true);
    return listing.success ? listing.data : undefined;
  };
  expect(await read()).toMatchObject({
    runs: [{ id: "bf3bb781", state: "running", phase: "working" }],
    summary: { running: 1, sessions: { here: { here: 1, other: 0 } } },
  });
  append({
    kind: "ended",
    id: "bf3bb781",
    at: Temporal.Now.instant().toString(),
    exit: 0,
    outcome: "no-change",
    report_path: null,
    vendor_session: null,
  });
  await flushRunPublications();
  expect(await read()).toMatchObject({ runs: [], summary: { running: 0 } });
  expect((await readdir(root)).some((name) => name.endsWith(".tmp"))).toBe(
    false,
  );
});

test("workspace publication reads no log bytes with a large unrelated history", async () => {
  const { appendFileSync, readFileSync } = await import("node:fs");
  const { publishCurrentRuns, workspaceRuns } =
    await import("../../src/next/store.ts");
  const { spyOn } = await import("bun:test");
  const fs = await import("node:fs");
  const root = await mkdtemp(join(tmpdir(), "agx-workspace-bound-"));
  roots.push(root);
  const at = "2026-10-14T10:00:00Z";
  const events = Array.from({ length: 2000 }, (_, index) => [
    {
      kind: "started",
      id: `run-${index}`,
      at,
      ticket: "fixture",
      writes: [],
      cwd: root,
      workspace: index === 0 ? root : join(root, "elsewhere"),
      row: "fixture",
      dispatcher_session: null,
      vendor_session: null,
      pid: 0,
    },
    {
      kind: "ended",
      id: `run-${index}`,
      at,
      exit: 0,
      report_path: null,
      vendor_session: null,
    },
  ]).flat();
  appendFileSync(
    join(root, "records.jsonl"),
    events.map((event) => JSON.stringify(event) + "\n").join(""),
  );
  await publishCurrentRuns(root);
  const bytes = readFileSync(join(root, "records.jsonl")).length;
  expect(bytes).toBeGreaterThan(500_000);
  const opening = spyOn(fs, "openSync");
  const rows = await workspaceRuns(root, root);
  expect(rows.map((run) => run.id)).toEqual(["run-0"]);
  expect(opening).not.toHaveBeenCalled();
});
