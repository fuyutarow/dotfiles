import { afterEach, expect, test } from "bun:test";
import {
  appendFile,
  chmod,
  mkdir,
  mkdtemp,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCodexSubscriptionUsage } from "../src/codex-subscription-usage.ts";

const roots: string[] = [];
const now = Temporal.Now.instant().epochMilliseconds;
const week = 604800000;
const event = (percent: number, at = now - 1000) =>
  JSON.stringify({
    timestamp: Temporal.Instant.fromEpochMilliseconds(at).toString(),
    type: "event_msg",
    payload: {
      type: "token_count",
      rate_limits: {
        primary: null,
        secondary: {
          used_percent: percent,
          window_minutes: 10080,
          resets_at: Math.floor((now + week) / 1000),
        },
      },
    },
  });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "codex-account-"));
  roots.push(root);
  const dir = join(root, "2026", "01", "01");
  await mkdir(dir, { recursive: true });
  return { root, file: join(dir, "rollout-account.jsonl") };
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
test("empty newer sessions and null newer events cannot erase account usage", async () => {
  const { root, file } = await fixture();
  await writeFile(
    file,
    event(11) +
      '\n{"type":"event_msg","payload":{"type":"token_count","rate_limits":null}}\n',
  );
  await writeFile(join(root, "rollout-empty.jsonl"), "");
  for (let i = 0; i < 3; i++)
    expect(
      (await readCodexSubscriptionUsage(root, now, week)).window?.used_percent,
    ).toBe(11);
  await appendFile(file, event(12, now) + "\n");
  expect(
    (await readCodexSubscriptionUsage(root, now + 1000, week)).window
      ?.used_percent,
  ).toBe(12);
});
test("a recent usage event survives more than eight MiB of unrelated output", async () => {
  const { root, file } = await fixture();
  await writeFile(
    file,
    event(27) +
      "\n" +
      (
        JSON.stringify({ type: "response_item", data: "x".repeat(65536) }) +
        "\n"
      ).repeat(132),
  );
  expect(
    (await readCodexSubscriptionUsage(root, now, week)).window?.used_percent,
  ).toBe(27);
});
test("freshness belongs to the event, not unrelated writes or a future timestamp", async () => {
  const { root, file } = await fixture();
  await writeFile(
    file,
    event(27, now - week - 1000) + "\n" + event(90, now + 1000),
  );
  expect(
    (await readCodexSubscriptionUsage(root, now, week)).window,
  ).toBeUndefined();
  await writeFile(file, event(28));
  await utimes(file, (now - week - 1000) / 1000, (now - week - 1000) / 1000);
  expect(
    (await readCodexSubscriptionUsage(root, now, week)).window,
  ).toBeUndefined();
});
test("missing source reports a reason", async () => {
  const { root } = await fixture();
  expect(await readCodexSubscriptionUsage(root, now, week)).toEqual({
    reason: "no fresh Codex rollout source",
  });
});
test("an oversized unrelated line cannot hide the earlier usage event", async () => {
  const { root, file } = await fixture();
  await writeFile(
    file,
    event(29) +
      "\n" +
      JSON.stringify({
        type: "response_item",
        data: "x".repeat(9 * 1024 * 1024),
      }) +
      "\n",
  );
  expect(
    (await readCodexSubscriptionUsage(root, now, week)).window?.used_percent,
  ).toBe(29);
});
test("accepts an event six days old and rejects an expired weekly window", async () => {
  const { root, file } = await fixture();
  await writeFile(file, event(31, now - 6 * 86400000));
  expect(
    (await readCodexSubscriptionUsage(root, now, week)).window?.used_percent,
  ).toBe(31);
  await writeFile(
    file,
    event(99).replace(
      String(Math.floor((now + week) / 1000)),
      String(Math.floor(now / 1000) - 1),
    ),
  );
  expect(
    (await readCodexSubscriptionUsage(root, now, week)).window,
  ).toBeUndefined();
});

test("timestamp-less events floor fractional mtime without accepting a future millisecond", async () => {
  const { root, file } = await fixture();
  const body = event(41).replace(/"timestamp":"[^"]+",/u, "");
  await writeFile(file, body);
  await utimes(file, (now + 0.75) / 1000, (now + 0.75) / 1000);
  const result = await readCodexSubscriptionUsage(root, now, week);
  expect(result.window?.used_percent).toBe(41);
  expect(result.window?.measured_at).toBe(now);
  await utimes(file, (now + 1000.75) / 1000, (now + 1000.75) / 1000);
  expect(
    (await readCodexSubscriptionUsage(root, now, week)).rate,
  ).toBeUndefined();
});

test("unchanged path, mtime and size reuse the parsed source without reopening it", async () => {
  const { root, file } = await fixture();
  await writeFile(file, event(42));
  expect(
    (await readCodexSubscriptionUsage(root, now, week)).window?.used_percent,
  ).toBe(42);
  await chmod(file, 0);
  expect(
    (await readCodexSubscriptionUsage(root, now, week)).window?.used_percent,
  ).toBe(42);
  await chmod(file, 0o600);
  await appendFile(file, "\n" + event(43, now));
  expect(
    (await readCodexSubscriptionUsage(root, now + 1, week)).window
      ?.used_percent,
  ).toBe(43);
  expect(
    (await readCodexSubscriptionUsage(root, now + week + 2000, week)).window,
  ).toBeUndefined();
});
