import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jevUsageSegment, readJevUsage } from "../src/jev-usage.ts";

const roots: string[] = [];
const previous = process.env.AGENT_ROUTER_STATE_DIR;
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
  if (previous === undefined) delete process.env.AGENT_ROUTER_STATE_DIR;
  else process.env.AGENT_ROUTER_STATE_DIR = previous;
});

test("reads seven-day Jev response usage and formats the no-price fallback", async () => {
  const root = await mkdtemp(join(tmpdir(), "statusline-jev-"));
  roots.push(root);
  process.env.AGENT_ROUTER_STATE_DIR = root;
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
  const usage = readJevUsage(now);
  expect(usage.isOk()).toBe(true);
  if (usage.isOk()) expect(jevUsageSegment(usage.value)).toBe("Jev 1.2M tok");
});

test("omits Jev when runs.jsonl is absent", () => {
  const root = "/definitely/missing/statusline-jev";
  process.env.AGENT_ROUTER_STATE_DIR = root;
  const usage = readJevUsage();
  expect(usage.isOk()).toBe(true);
  if (usage.isOk()) expect(jevUsageSegment(usage.value)).toBe("");
});
