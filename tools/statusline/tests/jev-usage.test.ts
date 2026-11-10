import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readJevUsage } from "../src/jev-usage.ts";
import { jevUsageSegment } from "../src/provider-display.ts";
import { ESC } from "../src/ansi.ts";
import recorded from "./fixtures/jev-usage-c6.json";
import empty from "./fixtures/jev-usage-c6-empty.json";
import real from "./fixtures/jev-usage-agx-10.4.2-partial.json";
import { rateRow } from "../src/rate-limits.ts";

const plain = (text: string) =>
  text.replaceAll(new RegExp(`${ESC}\\[[0-9;]*m`, "gu"), "");
const now = Temporal.Instant.from(recorded.captured_at).epochMilliseconds;
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
const args = [
  "-C",
  resolve(import.meta.dir, "../../.."),
  "exec",
  "--",
  "agx",
  "worker",
  "stats",
  "--usage",
  "jev",
  "--window",
  "7d",
];
async function fakeCli(source: string) {
  const root = await mkdtemp(join(tmpdir(), "statusline-jev-"));
  roots.push(root);
  await writeFile(
    join(root, "mise"),
    `#!${process.execPath}
if (JSON.stringify(process.argv.slice(2)) !== ${JSON.stringify(JSON.stringify(args))}) process.exit(9);
${source}`,
    { mode: 0o755 },
  );
  return { ...process.env, PATH: root };
}
const output = (value: unknown) =>
  `process.stdout.write(${JSON.stringify(JSON.stringify(value))});`;

test("projects recorded C6 estimated spend without repricing or using known subtotals", async () => {
  const env = await fakeCli(output({ ...recorded, estimated_cost_usd: 1.05 }));
  const usage = await readJevUsage(now, env);
  expect(usage.isOk()).toBe(true);
  if (usage.isOk()) {
    expect(usage.value?.costUsd).toBe(1.05);
    expect(plain(jevUsageSegment(usage.value))).toBe("Jev 7d spend $1.05");
  }
});

test.each([
  ["recorded total", recorded, recorded.estimated_cost_usd],
  ["explicit zero", { ...recorded, estimated_cost_usd: 0 }, 0],
])("C6 %s preserves null versus zero", async (_name, fixture, costUsd) => {
  const env = await fakeCli(output(fixture));
  const at = Temporal.Instant.from(fixture.captured_at).epochMilliseconds;
  const usage = await readJevUsage(at, env);
  expect(usage.isOk()).toBe(true);
  if (usage.isOk()) {
    expect(usage.value?.costUsd).toBe(costUsd);
    expect(usage.value?.partial).toBe(false);
  }
});

test("empty evidence has no priced usage and says so instead of a generic n/a", async () => {
  const env = await fakeCli(output(empty));
  const at = Temporal.Instant.from(empty.captured_at).epochMilliseconds;
  const usage = await readJevUsage(at, env);
  expect(usage.isErr()).toBe(true);
  if (usage.isErr()) {
    expect(usage.error).toContain("no priced usage");
    const text = plain(jevUsageSegment(undefined, usage.error));
    expect(text).toContain("Jev n/a (Jev usage has no priced usage");
  }
});

test("real agx 10.4.2 output (estimate null, known subtotal, partial) renders a partial spend", async () => {
  const env = await fakeCli(output(real));
  const at = Temporal.Instant.from(real.captured_at).epochMilliseconds;
  const usage = await readJevUsage(at, env);
  expect(usage.isOk()).toBe(true);
  if (!usage.isOk()) return;
  expect(real.estimated_cost_usd).toBeNull();
  expect(real.completeness).toBe("partial");
  expect(usage.value).toEqual({
    costUsd: real.known_tokens_at_effective_price_usd,
    partial: true,
    capturedMs: at,
  });
  expect(plain(jevUsageSegment(usage.value))).toBe("Jev 7d spend ≥$0.13");
  const row = plain(
    rateRow({ rlModel: [], jevUsage: usage.value }, undefined, ["Jev"]),
  );
  expect(row).toContain("Jev 7d spend ≥$0.13");
  expect(row).not.toContain("n/a");
});

test("a cached sample older than five minutes keeps its value and shows its age", () => {
  const text = plain(
    jevUsageSegment({ costUsd: 0.134, partial: true }, undefined, 12 * 60_000),
  );
  expect(text).toBe("Jev 7d spend ≥$0.13 · 12m old");
});

test("a failed read reaches the Rate row as its specific reason, never bare (unavailable)", async () => {
  const usage = await readJevUsage(now, await fakeCli("process.exit(2);"));
  expect(usage.isErr()).toBe(true);
  if (!usage.isErr()) return;
  const row = plain(
    rateRow({ rlModel: [], jevUsageWhy: usage.error }, undefined, ["Jev"]),
  );
  expect(row).toContain(`Jev n/a (${usage.error})`);
  expect(row).not.toContain("(unavailable)");
  // No reason at all still names the missing sample rather than the generic word.
  const none = plain(rateRow({ rlModel: [] }, undefined, ["Jev"]));
  expect(none).toContain("Jev n/a (usage sample unavailable)");
});

test("a read slower than its budget reports a timeout naming Jev usage", async () => {
  const usage = await readJevUsage(
    now,
    await fakeCli("await Bun.sleep(10000);"),
    300,
  );
  expect(usage.isErr()).toBe(true);
  if (usage.isErr()) expect(usage.error).toContain("Jev usage");
});

test.each([
  ["fails", "process.exit(2);"],
  ["invalid JSON", 'process.stdout.write("not JSON");'],
  ["invalid schema", output({ ...recorded, schema: 2 })],
  ["missing cost", output({ ...recorded, estimated_cost_usd: undefined })],
  ["negative cost", output({ ...recorded, estimated_cost_usd: -1 })],
  ["excessive output", 'process.stdout.write("x".repeat(65537));'],
  ["invalid time", output({ ...recorded, to: "invalid" })],
  ["stale", output({ ...recorded, to: "2026-10-23T00:00:00Z" })],
  ["future", output({ ...recorded, captured_at: "2099-01-01T00:00:00Z" })],
])(
  "C6 %s produces n/a",
  async (_name, source) => {
    const usage = await readJevUsage(now, await fakeCli(source));
    expect(usage.isErr()).toBe(true);
    if (usage.isErr())
      expect(plain(jevUsageSegment(undefined, usage.error))).toContain(
        "Jev n/a",
      );
  },
  7000,
);

test("missing mise produces n/a", async () => {
  const usage = await readJevUsage(now, { PATH: "/definitely/missing" });
  expect(usage.isErr()).toBe(true);
});

test("uses the dotfiles mise pin from an arbitrary cwd without agx on PATH", async () => {
  const env = await fakeCli(output(recorded));
  const modulePath = resolve(import.meta.dir, "../src/jev-usage.ts");
  const child = Bun.spawn({
    cmd: [
      process.execPath,
      "--eval",
      `import { readJevUsage } from ${JSON.stringify(modulePath)};
const usage = await readJevUsage(${now});
if (usage.isErr()) throw new Error(usage.error);
process.stdout.write(JSON.stringify(usage.value));`,
    ],
    cwd: env.PATH,
    env,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 4000,
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(stderr).toBe("");
  expect(exit).toBe(0);
  expect(stdout).toBe(
    JSON.stringify({
      costUsd: recorded.estimated_cost_usd,
      partial: false,
      capturedMs: now,
    }),
  );
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
