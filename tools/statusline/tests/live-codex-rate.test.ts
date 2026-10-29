import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLiveCodexRate } from "./support/codex-rate.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const event = (
  percent: number,
  timestamp = Temporal.Now.instant().toString(),
) =>
  JSON.stringify({
    timestamp,
    type: "event_msg",
    payload: {
      type: "token_count",
      rate_limits: {
        primary: {
          used_percent: percent,
          window_minutes: 300,
          resets_at: 1792300000,
        },
        secondary: { used_percent: 42, window_minutes: 10080 },
        credits: { has_credits: true, unlimited: false, balance: "12.4" },
      },
    },
  });

test("live rate reads the selected rollout and ignores a newer dormant session", async () => {
  const root = await mkdtemp(join(tmpdir(), "statusline-live-rate-"));
  roots.push(root);
  const dir = join(root, "sessions");
  await mkdir(dir);
  const path = join(dir, "rollout-live.jsonl");
  await writeFile(path, `${event(25)}\nmalformed\n`);
  await writeFile(join(dir, "rollout-dormant.jsonl"), `${event(99)}\n`);
  const rate = (await readLiveCodexRate(path)).unwrapOr(undefined);
  expect(rate?.windows).toEqual([
    { minutes: 300, percent: 25, reset: 1792300000 },
    { minutes: 10080, percent: 42 },
  ]);
  expect(rate?.credits).toBe("12");
  await writeFile(path, `${event(99, "2000-01-01T00:00:00Z")}\n`);
  expect((await readLiveCodexRate(path)).unwrapOr(undefined)).toBeUndefined();
  expect((await readLiveCodexRate()).unwrapOr(undefined)).toBeUndefined();
  expect((await readLiveCodexRate(join(root, "missing"))).isErr()).toBe(true);
});
