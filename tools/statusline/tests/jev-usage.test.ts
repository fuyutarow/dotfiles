import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jevUsageSegment, readJevUsage } from "../src/jev-usage.ts";

const roots: string[] = [];
const previous = process.env.AGX_STATE_DIR;
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
  if (previous === undefined) delete process.env.AGX_STATE_DIR;
  else process.env.AGX_STATE_DIR = previous;
});

test("reads seven-day Jev response usage and prices spend", async () => {
  const root = await mkdtemp(join(tmpdir(), "statusline-jev-"));
  roots.push(root);
  process.env.AGX_STATE_DIR = root;
  const now = Math.floor(
    Temporal.Instant.from("2026-10-09T00:00:00Z").epochMilliseconds / 1000,
  );
  await writeFile(
    join(root, "runs.jsonl"),
    [
      JSON.stringify({
        kind: "run",
        started_at: "2026-10-08T00:00:00Z",
        pick: {
          jev: {
            response: {
              usage: { input_tokens: 900_000, output_tokens: 300_000 },
            },
          },
        },
      }),
      JSON.stringify({
        kind: "run",
        started_at: "2026-10-01T00:00:00Z",
        pick: {
          jev: {
            response: {
              usage: { input_tokens: 50_000, output_tokens: 50_000 },
            },
          },
        },
      }),
    ].join("\n"),
  );
  const usage = await readJevUsage(now);
  expect(usage.isOk()).toBe(true);
  if (usage.isOk())
    expect(jevUsageSegment(usage.value)).toBe("Jev 7d spend $0.0378");
});

test("labels seven-day spend for small and larger amounts", () => {
  expect(jevUsageSegment({ costUsd: 0.001 })).toBe("Jev 7d spend <$0.01");
  expect(jevUsageSegment({ costUsd: 1.23 })).toBe("Jev 7d spend $1.23");
  expect(jevUsageSegment({ costUsd: undefined })).toBe("Jev 7d spend —");
});

test("omits Jev when runs.jsonl is absent", async () => {
  const root = "/definitely/missing/statusline-jev";
  process.env.AGX_STATE_DIR = root;
  const usage = await readJevUsage();
  expect(usage.isOk()).toBe(true);
  if (usage.isOk()) expect(jevUsageSegment(usage.value)).toBe("");
});
