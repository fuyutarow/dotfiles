import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jevUsageSegment, readJevUsage } from "../src/jev-usage.ts";
import { ESC } from "../src/ansi.ts";

const plain = (text: string) =>
  text.replaceAll(new RegExp(`${ESC}\\[[0-9;]*m`, "gu"), "");

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
    expect(plain(jevUsageSegment(usage.value))).toBe("Jev 7d spend $0.04");
});

test.each([
  [0, "Jev 7d spend $0"],
  [0.0004, "Jev 7d spend <$0.01"],
  [0.004, "Jev 7d spend <$0.01"],
  [0.0099, "Jev 7d spend <$0.01"],
  [0.01, "Jev 7d spend $0.01"],
  [0.0149, "Jev 7d spend $0.01"],
  [1.234, "Jev 7d spend $1.23"],
  [undefined, "Jev n/a"],
])("formats Jev cost %s as %s", (costUsd, expected) => {
  expect(plain(jevUsageSegment({ costUsd }))).toBe(expected);
});

test("names Jev when runs.jsonl is absent", async () => {
  const root = "/definitely/missing/statusline-jev";
  process.env.AGX_STATE_DIR = root;
  const usage = await readJevUsage();
  expect(usage.isOk()).toBe(true);
  if (usage.isOk()) expect(plain(jevUsageSegment(usage.value))).toBe("Jev n/a");
});
