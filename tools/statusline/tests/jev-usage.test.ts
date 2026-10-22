import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRoster } from "../../../agents/models/roster.ts";
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

async function fakeCli(root: string, source: string): Promise<string> {
  const path = join(root, "agx-worker.ts");
  await writeFile(path, source);
  return path;
}

async function usageLog(root: string): Promise<string> {
  const path = join(root, "runs.jsonl");
  await writeFile(
    path,
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
  );
  return path;
}

test("reads seven-day Jev response usage and prices spend", async () => {
  const root = await mkdtemp(join(tmpdir(), "statusline-jev-"));
  roots.push(root);
  process.env.AGX_STATE_DIR = root;
  const now = Math.floor(
    Temporal.Instant.from("2026-10-09T00:00:00Z").epochMilliseconds / 1000,
  );
  const runLog = await usageLog(root);
  const roster = await loadRoster();
  expect(roster.ok).toBe(true);
  if (!roster.ok) return;
  const inputPrice = roster.value.auto.jev.price_per_mtok_input;
  const outputPrice = roster.value.auto.jev.price_per_mtok_output;
  expect(inputPrice).toBeDefined();
  expect(outputPrice).toBeDefined();
  if (inputPrice === undefined || outputPrice === undefined) return;
  const oldCost = (900_000 * inputPrice + 300_000 * outputPrice) / 1_000_000;
  const cli = await fakeCli(
    root,
    `process.stdout.write(${JSON.stringify(JSON.stringify(roster.value))});`,
  );
  const usage = await readJevUsage(now, runLog, cli);
  expect(usage.isOk()).toBe(true);
  if (usage.isOk()) expect(usage.value?.costUsd).toBe(oldCost);
});

test("returns Jev price unavailable when roster CLI fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "statusline-jev-"));
  roots.push(root);
  const now = Math.floor(
    Temporal.Instant.from("2026-10-09T00:00:00Z").epochMilliseconds / 1000,
  );
  const runLog = await usageLog(root);
  const cli = await fakeCli(root, "process.exitCode = 1;");
  const usage = await readJevUsage(now, runLog, cli);
  expect(usage.isErr()).toBe(true);
  if (usage.isErr()) expect(usage.error).toBe("Jev price unavailable");
});

test("returns Jev price unavailable when roster prices are missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "statusline-jev-"));
  roots.push(root);
  const now = Math.floor(
    Temporal.Instant.from("2026-10-09T00:00:00Z").epochMilliseconds / 1000,
  );
  const runLog = await usageLog(root);
  const cli = await fakeCli(root, 'process.stdout.write("{}")');
  const usage = await readJevUsage(now, runLog, cli);
  expect(usage.isErr()).toBe(true);
  if (usage.isErr()) expect(usage.error).toBe("Jev price unavailable");
});

test.each([
  [0, "Jev 7d spend $0"],
  [0.0004, "Jev 7d spend <$0.01"],
  [0.004, "Jev 7d spend <$0.01"],
  [0.0099, "Jev 7d spend <$0.01"],
  [0.01, "Jev 7d spend $0.01"],
  [0.0149, "Jev 7d spend $0.01"],
  [1.234, "Jev 7d spend $1.23"],
  [undefined, "Jev n/a (usage sample unavailable)"],
])("formats Jev cost %s as %s", (costUsd, expected) => {
  expect(plain(jevUsageSegment({ costUsd }))).toBe(expected);
});

test("names Jev when runs.jsonl is absent", async () => {
  const root = "/definitely/missing/statusline-jev";
  process.env.AGX_STATE_DIR = root;
  const usage = await readJevUsage();
  expect(usage.isOk()).toBe(true);
  if (usage.isOk())
    expect(plain(jevUsageSegment(usage.value))).toBe(
      "Jev n/a (usage sample unavailable)",
    );
});
