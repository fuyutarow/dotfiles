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
import { decodedJson } from "./decode.ts";

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
  expect(
    readdirSync(join(home, ".cache", "claude", "statusline")).toSorted(),
  ).toEqual(["subscription-usage.json", "subscription-usage.json.lock.flock"]);
  expect(subscriptionUsagePath({ HOME: home })).toContain(
    "subscription-usage.json",
  );
});

test("Claude stdin publishes independently present windows for the shared reader", async () => {
  const root = mkdtempSync(join(tmpdir(), "statusline-input-"));
  roots.push(root);
  const env = {
    ...process.env,
    HOME: root,
    XDG_RUNTIME_DIR: join(root, "runtime"),
    PWD: root,
  };
  const run = async (rate_limits: unknown) => {
    const child = Bun.spawn(
      [process.execPath, join(import.meta.dir, "../src/statusline-main.ts")],
      {
        env,
        stdin: new Blob([JSON.stringify({ cwd: root, rate_limits })]),
        stdout: "ignore",
        stderr: "pipe",
      },
    );
    const [error, code] = await Promise.all([
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code, error).toBe(0);
  };
  await run({ five_hour: { used_percentage: 12, resets_at: 1794066000 } });
  const path = subscriptionUsagePath(env);
  const first = decodedJson(
    SubscriptionUsageSnapshotSchema,
    await Bun.file(path).text(),
  );
  expect(first.routes.claude["5h"]).toMatchObject({
    used_percent: 12,
    resets_at: 1794066000,
    window_seconds: 18000,
  });
  expect(first.routes.claude["5h"]?.measured_at).toBeGreaterThan(0);
  expect(first.routes.claude["7d"]).toBeUndefined();
  await run({ seven_day: { used_percentage: 54, resets_at: 1794319200 } });
  const second = decodedJson(
    SubscriptionUsageSnapshotSchema,
    await Bun.file(path).text(),
  );
  expect(second.routes.claude["5h"]).toEqual(first.routes.claude["5h"]);
  expect(second.routes.claude["7d"]).toMatchObject({
    used_percent: 54,
    resets_at: 1794319200,
    window_seconds: 604800,
  });
});

test("concurrent provider updates preserve both observations and reject older rates", async () => {
  const root = mkdtempSync(join(tmpdir(), "statusline-concurrent-"));
  roots.push(root);
  const env = { HOME: root };
  await Promise.all([
    writeUsageSnapshotAsync({ rl5: 12 }, 200, env),
    writeUsageSnapshotAsync(
      {
        codexRate: {
          windows: [{ minutes: 10080, percent: 45, reset: 300 }],
          mtimeMs: 200000,
        },
      },
      200,
      env,
    ),
  ]);
  await writeUsageSnapshotAsync({ rl5: 99 }, 100, env);
  const snapshot = decodedJson(
    SubscriptionUsageSnapshotSchema,
    await Bun.file(subscriptionUsagePath(env)).text(),
  );
  expect(snapshot.routes.claude["5h"]?.used_percent).toBe(12);
  expect(snapshot.routes.codex["7d"]?.used_percent).toBe(45);
});
