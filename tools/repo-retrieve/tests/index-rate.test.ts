import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import {
  MIN_ELAPSED_SECONDS,
  MIN_PROCESSED_CHUNKS,
  processedWork,
  recordIndexRate,
  selectIndexRate,
  type IndexMeasurement,
} from "../src/index-rate.ts";
import { planReport, summarize } from "../src/index-plan.ts";

const current = { startLoad1: 6, nproc: 12 };
const measurement = (
  overrides: Partial<IndexMeasurement> = {},
): IndexMeasurement => ({
  processedChunks: 70_000,
  elapsedSeconds: 100,
  fullRebuild: true,
  workSource: "persisted-count-delta",
  cccVersion: "ccc fixture",
  ...current,
  ...overrides,
});
const history = (...records: unknown[]) =>
  records.map((record) => JSON.stringify(record)).join("\n");

test("the supplied legacy history cannot establish a full v0 throughput", () => {
  const rates = [
    486.46, 2127.99, 761.97, 44.52, 27.1, 403.96, 1371.11, 2704.66, 901.34,
    50.18, 0.042, 105.67,
  ];
  const seconds = [
    15.6, 3.6, 2.1, 139.8, 110.7, 175.1, 51.8, 26.2, 6.9, 118.9, 23.8, 69.1,
  ];
  const selected = selectIndexRate(
    history(
      ...rates.map((chunksPerSecond, index) => ({
        chunksPerSecond,
        elapsedSeconds: seconds[index],
      })),
    ),
    current,
  );
  expect(selected.rate).toBeNull();
  expect(selected.report.match(/excluded\(legacy\/invalid/gu)).toHaveLength(12);
  expect(selected.report).toContain("configured fallback; advisory");
});

test("incremental, undersized, short and legacy samples have named exclusions", () => {
  const selected = selectIndexRate(
    history(
      { chunksPerSecond: 0.042, elapsedSeconds: 23.8 },
      measurement({
        fullRebuild: false,
        processedChunks: 6_000,
        elapsedSeconds: 110.7,
      }),
      measurement({ processedChunks: MIN_PROCESSED_CHUNKS - 1 }),
      measurement({ elapsedSeconds: MIN_ELAPSED_SECONDS - 1 }),
      measurement(),
    ),
    current,
  );
  expect(selected.rate).toBe(700);
  for (const reason of [
    "legacy/invalid",
    "incremental",
    "MIN_PROCESSED_CHUNKS=5000",
    "MIN_ELAPSED_SECONDS=10",
    "#5=used",
  ])
    expect(selected.report).toContain(reason);
});

test("prefer normalized comparable load over contended full rebuilds", () => {
  const selected = selectIndexRate(
    history(
      measurement({
        processedChunks: 6_224,
        elapsedSeconds: 139.8,
        startLoad1: 43,
      }),
      measurement({
        processedChunks: 5_966,
        elapsedSeconds: 118.9,
        startLoad1: 26,
      }),
      measurement(),
      measurement({ processedChunks: 90_000, startLoad1: 3, nproc: 6 }),
    ),
    current,
  );
  expect(selected.rate).toBe(800);
  expect(selected.report).toContain(
    "#1=excluded(load outside LOAD_PER_CPU_BAND=0.5)",
  );
  expect(selected.report).toContain(
    "#2=excluded(load outside LOAD_PER_CPU_BAND=0.5)",
  );
  expect(153_981 / (selected.rate ?? 1)).toBeCloseTo(192.47625);
});

test("no comparable load uses qualifying history explicitly; latest nine applied after filtering", () => {
  const records = Array.from({ length: 10 }, (_, index) =>
    measurement({ processedChunks: (index + 1) * 5_000, startLoad1: 43 }),
  );
  const selected = selectIndexRate(
    history(...records, { chunksPerSecond: 0.042 }),
    current,
  );
  expect(selected.rate).toBe(300);
  expect(selected.report).toContain("no comparable load; all qualifying loads");
  expect(selected.report).toContain(
    "#1=excluded(older than latest 9 qualifying records)",
  );
});

test("no qualifying history gives configured advisory fallback and retains time gate for measurements", () => {
  const selected = selectIndexRate(
    history({ chunksPerSecond: 105.665 }),
    current,
  );
  expect(selected.rate).toBeNull();
  const budget = {
    max_est_chunks: 200_000,
    max_data_share: 1,
    max_seconds: 600,
    est_chunks_per_second: 250,
  };
  const files = [
    {
      path: "text.txt",
      bytes: 100,
      est_chunks: 153_981,
      kind: "text" as const,
    },
  ];
  const plan = summarize(files, budget, selected.rate);
  plan.rate_history = selected.report;
  expect(plan.chunks_per_second).toBe(250);
  expect(plan.violations).toEqual([]);
  expect(planReport(plan)).toContain("configured fallback; advisory");
  expect(summarize(files, budget, 100).violations).toContain(
    "estimated GPU seconds 1539.8 > 600",
  );
});

test("persisted delta never turns reused corpus size into processed work", () => {
  expect(processedWork(70_000, 70_001)).toEqual({
    processedChunks: 1,
    fullRebuild: false,
    workSource: "persisted-count-delta",
  });
  expect(processedWork(0, 70_000).fullRebuild).toBe(true);
  expect(processedWork(undefined, 70_000).processedChunks).toBe(0);
  expect(processedWork(70_000, 60_000).processedChunks).toBe(0);
});

test("record only substantial measurements and append without rewriting old history", async () => {
  const root = await mkdtemp(join(tmpdir(), "rr-rate-"));
  const path = join(root, "history.jsonl");
  const legacy = '{"chunksPerSecond":0.042}\n';
  await Bun.write(path, legacy);
  await recordIndexRate(measurement({ processedChunks: 1 }), path);
  await recordIndexRate(measurement({ elapsedSeconds: 1 }), path);
  expect(await readFile(path, "utf8")).toBe(legacy);
  await recordIndexRate(measurement(), path);
  const content = await readFile(path, "utf8");
  expect(content.startsWith(legacy)).toBe(true);
  const saved = jsonOf(z.record(z.string(), z.unknown())).safeParse(
    content.trim().split("\n")[1] ?? "{}",
  );
  expect(saved.success ? saved.data : null).toMatchObject({
    ...measurement(),
    chunksPerSecond: 700,
  });
});
