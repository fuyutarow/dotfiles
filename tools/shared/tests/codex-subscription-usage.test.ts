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
const creditEvent = (balance: string, at: number) =>
  JSON.stringify({
    timestamp: Temporal.Instant.fromEpochMilliseconds(at).toString(),
    type: "event_msg",
    payload: {
      type: "token_count",
      rate_limits: {
        primary: null,
        secondary: {
          used_percent: 20,
          window_minutes: 10080,
          resets_at: Math.floor((now + week) / 1000),
        },
        credits: { has_credits: true, unlimited: false, balance },
      },
    },
  });
const creditEventWithStatus = (
  credits:
    | { has_credits?: boolean; unlimited?: boolean; balance?: string }
    | undefined,
  at: number,
) =>
  JSON.stringify({
    timestamp: Temporal.Instant.fromEpochMilliseconds(at).toString(),
    type: "event_msg",
    payload: {
      type: "token_count",
      rate_limits: {
        secondary: {
          used_percent: 20,
          window_minutes: 10080,
          resets_at: Math.floor((now + week) / 1000),
        },
        ...(credits === undefined ? {} : { credits }),
      },
    },
  });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "codex-account-"));
  roots.push(root);
  const day = Temporal.Instant.fromEpochMilliseconds(now)
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toPlainDate();
  const dir = join(
    root,
    String(day.year),
    String(day.month).padStart(2, "0"),
    String(day.day).padStart(2, "0"),
  );
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
test("credit history uses the 24h baseline and returns the newest balance", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-credit-history-"));
  roots.push(root);
  const today = Temporal.Instant.fromEpochMilliseconds(now)
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toPlainDate();
  const dir = join(
    root,
    String(today.year),
    String(today.month).padStart(2, "0"),
    String(today.day).padStart(2, "0"),
  );
  await mkdir(dir, { recursive: true });
  const file = join(dir, "rollout-credit.jsonl");
  await writeFile(
    file,
    [
      creditEvent("1290", now - 25 * 60 * 60 * 1000),
      creditEvent("1260", now - 12 * 60 * 60 * 1000),
      creditEvent("1234", now - 1000),
    ].join("\n"),
  );
  const result = await readCodexSubscriptionUsage(root, now, week);
  expect(result.rate?.credits).toBe("1234");
  expect(result.rate?.creditChange).toEqual({
    delta: -56,
    spanMs: 24 * 60 * 60 * 1000,
  });
});

test("short credit history labels the actual covered span", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-credit-short-history-"));
  roots.push(root);
  const today = Temporal.Instant.fromEpochMilliseconds(now)
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toPlainDate();
  const dir = join(
    root,
    String(today.year),
    String(today.month).padStart(2, "0"),
    String(today.day).padStart(2, "0"),
  );
  await mkdir(dir, { recursive: true });
  const file = join(dir, "rollout-credit.jsonl");
  await writeFile(
    file,
    [
      creditEvent("1300", now - 9 * 60 * 60 * 1000),
      creditEvent("1234", now - 1000),
    ].join("\n"),
  );
  const result = await readCodexSubscriptionUsage(root, now, week);
  expect(result.rate?.creditChange).toEqual({
    delta: -66,
    spanMs: 9 * 60 * 60 * 1000 - 1000,
  });
});

test("finds the newest pre-cutoff credit outside a spanning rollout's last 256 KiB", async () => {
  const { root } = await fixture();
  const cutoff = now - 86400000;
  const day = Temporal.Instant.fromEpochMilliseconds(cutoff)
    .toZonedDateTimeISO("UTC")
    .toPlainDate()
    .toString()
    .replaceAll("-", "/");
  const dir = join(root, day);
  await mkdir(dir, { recursive: true });
  const file = join(dir, "rollout-spanning.jsonl");
  const padding =
    JSON.stringify({ type: "response_item", data: "x".repeat(65536) }) + "\n";
  await writeFile(
    file,
    [
      creditEvent("1400", cutoff - 10000),
      creditEvent("1300", cutoff),
      creditEventWithStatus(
        { has_credits: true, unlimited: false, balance: "NaN" },
        cutoff,
      ),
      padding.repeat(5),
      creditEvent("1250", now - 60000),
      creditEvent("1234", now - 1000),
    ].join("\n"),
  );
  // Enough newer files to exhaust the old global 32-file selection.
  const today = Temporal.Instant.fromEpochMilliseconds(now)
    .toZonedDateTimeISO("UTC")
    .toPlainDate()
    .toString()
    .replaceAll("-", "/");
  const recent = join(root, today);
  await mkdir(recent, { recursive: true });
  await Promise.all(
    Array.from({ length: 40 }, (_, index) =>
      writeFile(
        join(recent, `rollout-z-${index}.jsonl`),
        creditEvent("1234", now - 1000),
      ),
    ),
  );
  const result = await readCodexSubscriptionUsage(root, now, week);
  expect(result.rate?.credits).toBe("1234");
  expect(result.rate?.creditChange).toEqual({ delta: -66, spanMs: 86400000 });
});

test("a closed rollout supplies a newer baseline than a spanning rollout", async () => {
  const { root, file } = await fixture();
  const cutoff = now - 86400000;
  const day = Temporal.Instant.fromEpochMilliseconds(cutoff)
    .toZonedDateTimeISO("UTC")
    .toPlainDate()
    .toString()
    .replaceAll("-", "/");
  const dir = join(root, day);
  await mkdir(dir, { recursive: true });
  const spanning = join(dir, "rollout-spanning.jsonl");
  await writeFile(
    spanning,
    creditEvent("1400", cutoff - 10000) +
      "\n" +
      creditEvent("1234", now - 1000),
  );
  const closed = join(dir, "rollout-closed.jsonl");
  await writeFile(closed, creditEvent("1300", cutoff - 1000));
  await utimes(closed, (cutoff - 500) / 1000, (cutoff - 500) / 1000);
  await writeFile(file, creditEvent("1234", now - 1000));
  expect(
    (await readCodexSubscriptionUsage(root, now, week)).rate?.creditChange,
  ).toEqual({ delta: -66, spanMs: 86400000 });
});

test("a forward byte cap keeps the real span rather than accepting an unproven prefix", async () => {
  const { root, file } = await fixture();
  const cutoff = now - 86400000;
  const day = Temporal.Instant.fromEpochMilliseconds(cutoff)
    .toZonedDateTimeISO("UTC")
    .toPlainDate()
    .toString()
    .replaceAll("-", "/");
  const dir = join(root, day);
  await mkdir(dir, { recursive: true });
  const spanning = join(dir, "rollout-capped.jsonl");
  await writeFile(
    spanning,
    creditEvent("1400", cutoff - 10000) +
      "\n" +
      "x".repeat(32 * 1024 * 1024) +
      "\n" +
      creditEvent("1250", now - 60000) +
      "\n" +
      creditEvent("1234", now - 1000),
  );
  await writeFile(file, creditEvent("1234", now - 1000));
  expect(
    (await readCodexSubscriptionUsage(root, now, week)).rate?.creditChange,
  ).toEqual({ delta: -16, spanMs: 59000 });
});

test.each(["unlimited", "absent"])(
  "a newest %s credit sample suppresses an older finite balance",
  async (state) => {
    const root = await mkdtemp(join(tmpdir(), "codex-credit-absence-"));
    roots.push(root);
    const today = Temporal.Instant.fromEpochMilliseconds(now)
      .toZonedDateTimeISO(Temporal.Now.timeZoneId())
      .toPlainDate();
    const dir = join(
      root,
      String(today.year),
      String(today.month).padStart(2, "0"),
      String(today.day).padStart(2, "0"),
    );
    await mkdir(dir, { recursive: true });
    const file = join(dir, "rollout-credit.jsonl");
    await writeFile(
      file,
      [
        creditEvent("1300", now - 25 * 60 * 60 * 1000),
        creditEventWithStatus(
          state === "unlimited"
            ? { has_credits: true, unlimited: true, balance: "9999" }
            : undefined,
          now - 1000,
        ),
      ].join("\n"),
    );
    const result = await readCodexSubscriptionUsage(root, now, week);
    expect(result.rate?.credits).toBeUndefined();
    expect(result.rate?.creditChange).toBeUndefined();
  },
);
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
