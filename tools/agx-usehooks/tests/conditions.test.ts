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
import {
  dirtyFor,
  englishSegments,
  gpu,
  laneCount,
  runningRuns,
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

test("runningRuns and laneCount use live PIDs, ticket lanes, and choice rows", async () => {
  const { dir, ctx } = world();
  const marker = (id: string, values: object) => {
    writeFileSync(
      join(dir, "active", `${id}.json`),
      JSON.stringify({
        run_id: id,
        choice: "terra",
        pid: process.pid,
        ...values,
      }),
    );
  };
  marker("live", { ticket: { lane: "theory" } });
  marker("other", {});
  marker("dead", { pid: 2_147_483_647 });
  marker("invalid", { pid: -1 });
  writeFileSync(join(dir, "active", "bad.json"), "{");
  expect(await runningRuns(ctx)).toEqual([
    { id: "live", lane: "theory", row: "terra" },
    { id: "other", lane: "other", row: "terra" },
  ]);
  expect(await laneCount(ctx, "theory")).toBe(1);
  expect(await laneCount(ctx, "missing")).toBe(0);
});

test("GPU CSV converts MiB to GiB and handles unavailable/malformed commands", async () => {
  const { dir, ctx } = world();
  binary(dir, "nvidia-smi", 'process.stdout.write("19, 8192\\n80, 1024\\n");');
  expect(await gpu(ctx)).toEqual({ utilPct: 19, freeGiB: 8 });
  binary(dir, "nvidia-smi", 'process.stdout.write("N/A, 8192\\n");');
  expect(await gpu(ctx)).toBe("unknown");
  binary(dir, "nvidia-smi", 'process.stdout.write("101, 8192\\n");');
  expect(await gpu(ctx)).toBe("unknown");
  process.env.PATH = dir;
  expect(await gpu(ctx)).toBe("unknown");
});

test("GPU timeout returns unknown within its one second budget", async () => {
  const { dir, ctx } = world();
  binary(dir, "nvidia-smi", "await Bun.sleep(10_000);");
  const started = performance.now();
  expect(await gpu(ctx)).toBe("unknown");
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

test("unackedReturns ignores other outcomes, accepts ack of either disposition and malformed rows", async () => {
  const { dir, ctx } = world();
  const records = [
    {
      kind: "run",
      run_id: "pending",
      pick: { choice: "terra" },
      ticket: { lane: "theory" },
      stats: { outcome: "returned" },
    },
    {
      kind: "run",
      run_id: "acked",
      choice: "terra",
      worker: { outcome: "returned" },
    },
    { kind: "ack", run_id: "acked", consumed: false },
    {
      kind: "run",
      run_id: "display-acked",
      display_id: "agt_example",
      pick: { choice: "terra" },
      stats: { outcome: "returned" },
    },
    { kind: "ack", run_id: "agt_example", consumed: true },
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
