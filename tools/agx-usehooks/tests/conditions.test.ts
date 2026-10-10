import { afterEach, expect, test } from "bun:test";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeActiveMarker } from "../../shared/src/dispatch-state.ts";
import {
  deadOwnMarker,
  malformedMarker,
  ownFreshMarker,
  ownResumedMarker,
  unreadableMarker,
} from "../../shared/tests/fixtures/active-markers.ts";
import {
  dirtyFor,
  englishSegments,
  gpu,
  laneCount,
  runningRuns,
  scanRuns,
  unattributedRuns,
  unackedReturns,
} from "../src/index.ts";

const originalPath = process.env.PATH;
const originalState = process.env.AGX_STATE_DIR;
const dirs: string[] = [];
function world() {
  const dir = mkdtempSync(join(tmpdir(), "agx-usehooks-conditions-"));
  dirs.push(dir);
  mkdirSync(join(dir, "active"));
  process.env.AGX_STATE_DIR = dir;
  return { dir, ctx: { cwd: dir, repoRoot: dir, payload: {} } };
}
afterEach(() => {
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;
  if (originalState === undefined) delete process.env.AGX_STATE_DIR;
  else process.env.AGX_STATE_DIR = originalState;
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function binary(dir: string, name: string, body: string): void {
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  const path = join(bin, name);
  writeFileSync(path, `#!${process.execPath}\n${body}\n`);
  chmodSync(path, 0o755);
  process.env.PATH = bin;
}

function stateMarker(
  root: string,
  file: string,
  values: Record<string, unknown> & { ticket?: Record<string, unknown> },
): void {
  writeFileSync(
    join(root, "active", `${file}.json`),
    JSON.stringify({
      schema: 1,
      run_id: file,
      pid: process.pid,
      label: `fixture ${file}`,
      choice: "terra",
      pick_source: "fixture",
      started_at: Temporal.Now.instant().toString(),
      cwd: root,
      dispatcher_session: "session-a",
      ...values,
      ticket:
        values.ticket === undefined
          ? { writes: [], lane: "theory" }
          : { writes: [], ...values.ticket },
    }),
  );
}

test("runningRuns and laneCount use live PIDs, ticket lanes, and choice rows", async () => {
  const { dir, ctx } = world();
  stateMarker(dir, "live", { ticket: { lane: "theory" } });
  stateMarker(dir, "other", { ticket: { lane: "other" } });
  stateMarker(dir, "dead", { pid: 2_147_483_647 });
  stateMarker(dir, "invalid", { pid: -1 });
  writeFileSync(join(dir, "active", "bad.json"), "{");
  expect(await runningRuns(ctx)).toEqual([
    { id: "live", lane: "theory", row: "terra" },
    { id: "other", lane: "other", row: "terra" },
  ]);
  expect(await laneCount(ctx, "theory")).toBe(1);
  expect(await laneCount(ctx, "missing")).toBe(0);
});

test("shared agx marker fixtures reach run selectors while malformed and dead markers do not", async () => {
  const { dir, ctx } = world();
  for (const [name, fixture] of [
    ["fresh", ownFreshMarker],
    ["resumed", ownResumedMarker],
  ] as const) {
    const written = serializeActiveMarker({
      ...fixture,
      run_id: name,
      pid: process.pid,
      cwd: dir,
      dispatcher_session: "session-a",
    });
    expect(written.success).toBe(true);
    if (written.success)
      writeFileSync(join(dir, "active", `${name}.json`), written.text);
  }
  writeFileSync(
    join(dir, "active", "malformed.json"),
    JSON.stringify(malformedMarker),
  );
  writeFileSync(
    join(dir, "active", "unreadable.json"),
    JSON.stringify(unreadableMarker),
  );
  const dead = serializeActiveMarker(deadOwnMarker);
  expect(dead.success).toBe(true);
  if (dead.success) writeFileSync(join(dir, "active", "dead.json"), dead.text);

  const scan = await scanRuns(ctx, { session: "session-a" });
  expect(scan.runs).toEqual([
    {
      id: "fresh",
      lane: "other",
      row: "luna-xhigh",
      name: "agt_run_v2",
      kind: "token",
      labels: [],
    },
    {
      id: "resumed",
      lane: "other",
      row: "luna-xhigh",
      name: "agt_deploy_hosts",
      kind: "token",
      labels: [],
    },
  ]);
  expect(scan.unreadable).toBe(1);
  expect(await runningRuns(ctx, { session: "session-a" })).toEqual(scan.runs);
  expect(await laneCount(ctx, "other", { session: "session-a" })).toBe(2);
});

test("session selectors separate two dispatchers and unattributed live runs", async () => {
  const { dir, ctx } = world();
  for (const [id, session, pid] of [
    ["a-bench", "session-a", process.pid],
    ["a-theory", "session-a", process.pid],
    ["b-theory", "session-b", process.pid],
    ["dead-a", "session-a", 2_147_483_647],
    ["dead-unattributed", undefined, 2_147_483_647],
    ["unattributed", undefined, process.pid],
  ] satisfies [string, string | undefined, number][]) {
    stateMarker(dir, id, {
      pid,
      dispatcher_session: session,
      ticket: { lane: id === "a-bench" ? "bench" : "theory" },
    });
  }
  expect(
    (await runningRuns(ctx, { session: "session-a" })).map((run) => run.id),
  ).toEqual(["a-bench", "a-theory"]);
  expect(
    (await runningRuns(ctx, { session: "session-b" })).map((run) => run.id),
  ).toEqual(["b-theory"]);
  expect(await runningRuns(ctx, { session: "fake" })).toEqual([]);
  expect(await runningRuns(ctx, { session: "" })).toEqual([]);
  expect((await runningRuns(ctx)).map((run) => run.id)).toEqual([
    "a-bench",
    "a-theory",
    "b-theory",
    "unattributed",
  ]);
  expect(await laneCount(ctx, "theory", { session: "session-a" })).toBe(1);
  expect(await laneCount(ctx, "theory")).toBe(3);
  expect(await unattributedRuns(ctx)).toEqual([
    { id: "unattributed", lane: "theory", row: "terra" },
  ]);
  process.env.AGX_STATE_DIR = join(dir, "missing");
  expect(await unattributedRuns(ctx)).toEqual([]);
});

test("explicit state directories merge live runs by run_id and retain session filters", async () => {
  const { dir, ctx } = world();
  const legacy = join(dir, "legacy");
  mkdirSync(join(legacy, "active"), { recursive: true });
  stateMarker(dir, "shared", {});
  stateMarker(legacy, "different-filename", {
    run_id: "shared",
    choice: "legacy-choice",
  });
  stateMarker(legacy, "legacy-only", {});
  stateMarker(legacy, "session-b", { dispatcher_session: "session-b" });
  stateMarker(legacy, "unattributed", { dispatcher_session: undefined });
  stateMarker(legacy, "dead", { pid: 2_147_483_647 });
  stateMarker(legacy, "invalid", { pid: -1 });
  stateMarker(legacy, "ignored.progress", {});
  writeFileSync(join(legacy, "active", "broken.json"), "{");
  const stateDirs = [dir, join(dir, "missing"), legacy, dir];
  expect(await runningRuns(ctx, { stateDirs, session: "session-a" })).toEqual([
    { id: "shared", lane: "theory", row: "terra" },
    { id: "legacy-only", lane: "theory", row: "terra" },
  ]);
  expect(
    await laneCount(ctx, "theory", { stateDirs, session: "session-a" }),
  ).toBe(2);
  expect(await unattributedRuns(ctx, { stateDirs })).toEqual([
    { id: "unattributed", lane: "theory", row: "terra" },
  ]);
  expect(await runningRuns(ctx, { stateDirs: [] })).toEqual([]);
  expect(await unattributedRuns(ctx, { stateDirs: [] })).toEqual([]);
  expect(await laneCount(ctx, "theory", { stateDirs: [] })).toBe(0);
  expect((await runningRuns(ctx)).map((run) => run.id)).toEqual(["shared"]);
  expect(process.env.AGX_STATE_DIR).toBe(dir);
});

test("concurrent explicit selectors stay isolated from each other and the environment", async () => {
  const { dir, ctx } = world();
  const other = join(dir, "other");
  mkdirSync(join(other, "active"), { recursive: true });
  for (const [root, id] of [
    [dir, "first"],
    [other, "second"],
  ] satisfies [string, string][]) {
    stateMarker(root, id, { cwd: dir, dispatcher_session: undefined });
  }
  const [first, second] = await Promise.all([
    runningRuns(ctx, { stateDirs: [dir] }),
    unattributedRuns(ctx, { stateDirs: [other] }),
  ]);
  expect(first.map((run) => run.id)).toEqual(["first"]);
  expect(second.map((run) => run.id)).toEqual(["second"]);
  expect(process.env.AGX_STATE_DIR).toBe(dir);
});

test("unattributed markers require project cwd; exact sessions override cwd", async () => {
  const { dir, ctx } = world();
  stateMarker(dir, "own-outside", {
    cwd: "/foreign",
    ticket: { name: "th-own", kind: "theory", labels: ["proof"] },
  });
  stateMarker(dir, "project", {
    dispatcher_session: undefined,
    cwd: join(dir, "nested"),
  });
  stateMarker(dir, "other-session", {
    dispatcher_session: "session-b",
    cwd: dir,
  });
  stateMarker(dir, "sibling", {
    dispatcher_session: undefined,
    cwd: `${dir}-sibling`,
  });
  stateMarker(dir, "escape", {
    dispatcher_session: undefined,
    cwd: join(dir, "..", "foreign"),
  });
  stateMarker(dir, "missing-cwd", {
    dispatcher_session: undefined,
    cwd: undefined,
  });
  expect((await unattributedRuns(ctx)).map((run) => run.id)).toEqual([
    "project",
  ]);
  expect(await runningRuns(ctx, { session: "session-a" })).toEqual([
    {
      id: "own-outside",
      lane: "other",
      row: "terra",
      name: "th-own",
      kind: "theory",
      labels: ["proof"],
    },
  ]);
});

test("GPU resolves WSL fallback and returns unknown when none is executable", async () => {
  const { dir, ctx } = world();
  process.env.PATH = join(dir, "empty-path");
  const statePath = join(dir, "gpu-samples.jsonl");
  expect(await gpu(ctx, { fallbacks: [], statePath })).toBe("unknown");
  const wslLib = join(dir, "usr", "lib", "wsl", "lib");
  mkdirSync(wslLib, { recursive: true });
  const wslSmi = join(wslLib, "nvidia-smi");
  writeFileSync(
    wslSmi,
    `#!${process.execPath}\nprocess.stdout.write("19, 0, 4096, 12288\\n");\n`,
  );
  chmodSync(wslSmi, 0o755);
  expect(await gpu(ctx, { fallbacks: [wslSmi], statePath })).toEqual({
    nowPct: 19,
    avg15Pct: null,
    avg60Pct: null,
    samples15: 1,
    memUsedGiB: 4,
    memTotalGiB: 12,
  });
  writeFileSync(
    wslSmi,
    `#!${process.execPath}\nprocess.stdout.write("[N/A], 0, 4096, 12288\\n");\n`,
  );
  rmSync(statePath);
  expect(await gpu(ctx, { fallbacks: [wslSmi], statePath })).toBe("unknown");
  writeFileSync(
    wslSmi,
    `#!${process.execPath}\nprocess.stdout.write("101, 0, 4096, 12288\\n");\n`,
  );
  expect(await gpu(ctx, { fallbacks: [wslSmi], statePath })).toBe("unknown");
  writeFileSync(wslSmi, `#!${process.execPath}\nawait Bun.sleep(10_000);\n`);
  const started = performance.now();
  expect(await gpu(ctx, { fallbacks: [wslSmi], statePath })).toBe("unknown");
  expect(performance.now() - started).toBeLessThan(1_500);
});

test("English segments use the exact fence, quote, path, paragraph and threshold rules", async () => {
  const english =
    "This paragraph explains the work and the resulting behavior in ordinary English words. ".repeat(
      3,
    );
  expect(await englishSegments(`日本語の文章です。\n\n${english}`)).toEqual([
    english,
  ]);
  expect(
    await englishSegments(
      `\`\`\`ts\n${english}\n\`\`\`\n> ${english}\n\n確認しました。`,
    ),
  ).toEqual([]);
  expect(await englishSegments("The change is ready.")).toEqual([]);
  expect(await englishSegments("HTTP GPU API ".repeat(30))).toEqual([]);
  expect(await englishSegments("tools/hooks/example.ts ".repeat(30))).toEqual(
    [],
  );
});

test("dirtyFor uses the oldest jj changed file and clean/unavailable returns zero", async () => {
  const { dir, ctx } = world();
  writeFileSync(join(dir, "old.ts"), "old");
  writeFileSync(join(dir, "new.ts"), "new");
  const now = Temporal.Now.instant().epochMilliseconds / 1_000;
  utimesSync(join(dir, "old.ts"), now - 7_200, now - 7_200);
  utimesSync(join(dir, "new.ts"), now - 3_600, now - 3_600);
  binary(dir, "jj", 'process.stdout.write("old.ts\\nnew.ts\\n");');
  expect(await dirtyFor(ctx)).toBeCloseTo(2, 2);
  binary(dir, "jj", 'process.stdout.write("");');
  expect(await dirtyFor(ctx)).toBe(0);
  process.env.PATH = dir;
  expect(await dirtyFor(ctx)).toBe(0);
});

test("unackedReturns ignores other outcomes and requires explicit acceptance rather than legacy ack", async () => {
  const { dir, ctx } = world();
  const records = [
    {
      kind: "run",
      run_id: "pending",
      pick: { choice: "terra" },
      ticket: { lane: "theory" },
      result: "returned",
    },
    {
      kind: "run",
      run_id: "accepted",
      display_id: "agt_example",
      pick: { choice: "terra" },
      result: "returned",
    },
    { kind: "acceptance", run_id: "accepted", accept: true },
    {
      kind: "run",
      run_id: "rejected",
      pick: { choice: "terra" },
      result: "returned",
    },
    { kind: "acceptance", run_id: "rejected", accept: false },
    {
      kind: "run",
      run_id: "legacy-ack",
      choice: "terra",
      worker: { outcome: "returned" },
    },
    { kind: "ack", run_id: "legacy-ack", consumed: true },
    {
      kind: "run",
      run_id: "normal",
      choice: "terra",
      stats: { outcome: "ok" },
    },
  ];
  writeFileSync(
    join(dir, "runs.jsonl"),
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n{broken\n`,
  );
  expect(await unackedReturns(ctx)).toEqual([
    { id: "pending", lane: "theory", row: "terra" },
    { id: "rejected", lane: "other", row: "terra" },
    { id: "legacy-ack", lane: "other", row: "terra" },
  ]);
  rmSync(join(dir, "runs.jsonl"));
  expect(await unackedReturns(ctx)).toEqual([]);
});

test("dirtyFor bounds a stalled jj command", async () => {
  const { dir, ctx } = world();
  binary(dir, "jj", "await Bun.sleep(10_000);");
  const started = performance.now();
  expect(await dirtyFor(ctx)).toBe(0);
  expect(performance.now() - started).toBeLessThan(1_500);
});

test("missing dispatch state fails open for both state conditions", async () => {
  const { dir, ctx } = world();
  process.env.AGX_STATE_DIR = join(dir, "missing");
  expect(await runningRuns(ctx)).toEqual([]);
  expect(await unackedReturns(ctx)).toEqual([]);
});
