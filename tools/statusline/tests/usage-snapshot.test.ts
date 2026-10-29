import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  subscriptionUsagePath,
  SubscriptionUsageSnapshotSchema,
} from "@dotfiles/shared/src/subscription-usage.ts";
import { jsonOf } from "@dotfiles/shared/src/zod.ts";
import { rateRow } from "../src/rate-limits.ts";
import { writeUsageSnapshotAsync } from "../src/usage-snapshot.ts";

const priorHome = process.env["HOME"];
const roots: string[] = [];
afterEach(() => {
  if (priorHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = priorHome;
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

test("the sampler atomically snapshots rates while the rate renderer only formats", async () => {
  const root = mkdtempSync(join(tmpdir(), "statusline-usage-"));
  roots.push(root);
  const home = join(root, "home");
  process.env["HOME"] = home;
  const now =
    Temporal.Instant.from("2026-10-15T04:00:00Z").epochMilliseconds / 1000;
  const facts = {
    sid: "fixture-session",
    rl5: 12,
    rl5Reset: now + 15 * 60,
    rl7: 3,
    rl7Reset: now + 7 * 24 * 60 * 60 * 0.06,
    rlModel: [],
    codexRate: {
      windows: [
        {
          minutes: 10080,
          percent: 45,
          reset: now + 7 * 24 * 60 * 60 * 0.72,
        },
      ],
      mtimeMs: now * 1000,
    },
  };
  rateRow(facts, now);
  expect(await Bun.file(subscriptionUsagePath()).exists()).toBe(false);
  await writeUsageSnapshotAsync(facts, now);

  const snapshot = jsonOf(SubscriptionUsageSnapshotSchema).safeParse(
    await Bun.file(subscriptionUsagePath()).text(),
  );
  expect(snapshot.success).toBe(true);
  expect(snapshot.data).toEqual({
    version: 1,
    routes: {
      claude: {
        "5h": {
          used_percent: 12,
          resets_at: now + 15 * 60,
          window_seconds: 18_000,
          measured_at: now * 1000,
        },
        "7d": {
          used_percent: 3,
          resets_at: now + 7 * 24 * 60 * 60 * 0.06,
          window_seconds: 604_800,
          measured_at: now * 1000,
        },
      },
      codex: {
        "7d": {
          used_percent: 45,
          resets_at: now + 7 * 24 * 60 * 60 * 0.72,
          window_seconds: 604_800,
          measured_at: now * 1000,
        },
      },
    },
  });
  expect(readdirSync(join(home, ".cache", "claude", "statusline"))).toEqual([
    "subscription-usage.json",
  ]);
  expect(subscriptionUsagePath({ HOME: home })).toContain(
    "subscription-usage.json",
  );
});
