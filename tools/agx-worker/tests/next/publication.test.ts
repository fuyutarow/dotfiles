import { afterEach, expect, mock, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { append, flushRunPublications } from "../../src/next/store.ts";
import { leaseFor } from "../../src/next/lease.ts";
import { jsonOf, z } from "../../../shared/src/zod.ts";
const previous = process.env.AGX_STATE_DIR;
const roots: string[] = [];
function inheritedEnv() {
  const env = { ...process.env };
  Reflect.deleteProperty(env, "AGX_NEXT_STATE_DIR");
  return env;
}
afterEach(async () => {
  mock.restore();
  await flushRunPublications();
  if (previous === undefined) delete process.env.AGX_STATE_DIR;
  else process.env.AGX_STATE_DIR = previous;
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
  process.env.AGX_STATE_DIR = root;
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

test("owner publication seals loss once across observers and fixes JSON elapsed", async () => {
  const { acquireWorkspaceLock, events, foldedRuns, publishCurrentRuns } =
    await import("../../src/next/store.ts");
  const { listingRows } = await import("../../src/next/listing.ts");
  const root = await mkdtemp(join(tmpdir(), "agx-seal-loss-"));
  roots.push(root);
  // Deliberately keep the ambient state elsewhere: publication must use its root.
  process.env.AGX_STATE_DIR = join(root, "unused-state");
  const start = {
    kind: "started",
    id: "lost",
    at: "2026-10-14T10:00:00Z",
    ticket: "fixture",
    writes: [],
    cwd: root,
    workspace: root,
    row: "fixture",
    dispatcher_session: null,
    vendor_session: null,
    pid: 2147483647,
    lease: { pid: 2147483647, start: null, unit: null },
  };
  const live = {
    ...start,
    id: "live",
    workspace: join(root, "live"),
    pid: process.pid,
    lease: await leaseFor(process.pid, null),
  };
  const path = join(root, "records.jsonl");
  await Bun.write(
    path,
    [start, live].map((row) => JSON.stringify(row) + "\n").join(""),
  );
  const held = await acquireWorkspaceLock(root, root);
  if (!held.ok) expect.unreachable(held.error);
  await publishCurrentRuns(root);
  await held.release();
  expect(events(root).filter((event) => event.kind === "ended")).toEqual([]);
  // Separate processes contend for the same kernel lock, with no shared cache.
  const observers = Array.from({ length: 2 }, () =>
    Bun.spawn(
      [
        process.execPath,
        "-e",
        `import { publishCurrentRuns } from ${JSON.stringify(join(import.meta.dir, "../../src/next/store.ts"))}; await publishCurrentRuns(${JSON.stringify(root)});`,
      ],
      { env: inheritedEnv(), stdout: "pipe", stderr: "pipe", timeout: 10000 },
    ),
  );
  for (const observer of observers) {
    const [exit, stderr] = await Promise.all([
      observer.exited,
      new Response(observer.stderr).text(),
    ]);
    expect(stderr).toBe("");
    expect(exit).toBe(0);
  }
  await publishCurrentRuns(root);
  const ends = events(root).filter((event) => event.kind === "ended");
  expect(ends).toHaveLength(1);
  expect(ends[0]).toMatchObject({
    id: "lost",
    outcome: "lost",
    evidence: { reason: "owner-gone" },
  });
  const rows = await foldedRuns(root);
  const lost = rows.find((run) => run.id === "lost");
  expect(lost?.ended_at).not.toBeNull();
  expect(lost?.evidence?.reason).toBe("owner-gone");
  expect(rows.find((run) => run.id === "live")).toMatchObject({
    state: "running",
    ended_at: null,
  });
  const before = Temporal.Now.instant();
  expect(
    listingRows(rows, before).find((run) => run.id === "lost")?.elapsed_seconds,
  ).toBe(
    listingRows(rows, before.add({ hours: 1 })).find((run) => run.id === "lost")
      ?.elapsed_seconds,
  );
  const reader = Bun.spawn(
    [
      process.execPath,
      "tools/agx-worker/src/next/cli.ts",
      "ls",
      "--json",
      "--all",
    ],
    {
      env: { ...inheritedEnv(), AGX_STATE_DIR: root },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5000,
    },
  );
  const output = await new Response(reader.stdout).text();
  expect(await reader.exited).toBe(0);
  const parsed = jsonOf(
    z.array(
      z.looseObject({
        id: z.string(),
        state: z.string(),
        ended_at: z.string().nullable(),
        elapsed_seconds: z.number(),
      }),
    ),
  ).safeParse(output);
  expect(parsed.success).toBe(true);
  if (!parsed.success) expect.unreachable("invalid listing");
  expect(
    parsed.data
      .filter((run) => run.state === "ended")
      .every((run) => run.ended_at !== null),
  ).toBe(true);
  expect(parsed.data.find((run) => run.id === "lost")?.elapsed_seconds).toBe(
    listingRows(rows, before).find((run) => run.id === "lost")?.elapsed_seconds,
  );
});

test("publication never ends a run whose unit remains active after its pid disappears", async () => {
  const { chmod } = await import("node:fs/promises");
  const { events, foldedRuns, publishCurrentRuns } =
    await import("../../src/next/store.ts");
  const root = await mkdtemp(join(tmpdir(), "agx-active-unit-"));
  roots.push(root);
  const binary = join(root, "systemctl");
  await Bun.write(
    binary,
    `#!${process.execPath}\nprocess.stdout.write(process.argv.includes("--property=ActiveState") ? "active\\n" : "success\\n");\n`,
  );
  await chmod(binary, 0o755);
  const previousPath = process.env.PATH;
  process.env.PATH = `${root}:${previousPath ?? ""}`;
  await (async () => {
    await Bun.write(
      join(root, "records.jsonl"),
      JSON.stringify({
        kind: "started",
        id: "active-unit",
        at: "2026-10-14T10:00:00Z",
        ticket: "fixture",
        writes: [],
        cwd: root,
        workspace: root,
        row: "fixture",
        dispatcher_session: null,
        vendor_session: null,
        pid: 2147483647,
        lease: { pid: 2147483647, start: null, unit: "agt_fixture.service" },
      }) + "\n",
    );
    await publishCurrentRuns(root);
    expect(events(root).filter((event) => event.kind === "ended")).toEqual([]);
    expect((await foldedRuns(root))[0]).toMatchObject({
      state: "running",
      ended_at: null,
    });
  })().finally(() => {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  });
});
