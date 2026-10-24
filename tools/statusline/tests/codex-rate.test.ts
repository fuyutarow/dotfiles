import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readCodexRate,
  readCodexUsage,
  codexRateSegment,
} from "../src/codex-rate.ts";

const roots: string[] = [];
const ESC = String.fromCodePoint(27);
const NOW = 1791496800;
async function fixture(): Promise<{ root: string; file: string }> {
  const root = await mkdtemp(join(tmpdir(), "statusline-codex-"));
  roots.push(root);
  const day = Temporal.Instant.fromEpochMilliseconds(NOW * 1000)
    .toZonedDateTimeISO("Asia/Tokyo")
    .toPlainDate();
  const dir = join(
    root,
    String(day.year),
    String(day.month).padStart(2, "0"),
    String(day.day).padStart(2, "0"),
  );
  await mkdir(dir, { recursive: true });
  return { root, file: join(dir, "rollout-1.jsonl") };
}
async function setMtime(file: string, epochSec: number): Promise<void> {
  await utimes(file, epochSec, epochSec);
}
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
const sample = (
  primary: unknown,
  secondary: unknown,
  credits: unknown = null,
) => ({ limit_id: "codex", primary, secondary, credits });
const event = (rateLimits: unknown) =>
  JSON.stringify({
    type: "event_msg",
    payload: { type: "token_count", rate_limits: rateLimits },
  });
const window = (minutes: number, percent: number, reset: number) => ({
  used_percent: percent,
  window_minutes: minutes,
  resets_at: reset,
});

test("renders a 7d only window and integer credits", async () => {
  const { root, file } = await fixture();
  await writeFile(
    file,
    event(
      sample(null, window(10080, 11.2, 1791948537), {
        has_credits: true,
        unlimited: false,
        balance: "62500.0000000000",
      }),
    ),
  );
  await setMtime(file, NOW);
  const parsed = await readCodexRate(root, undefined, NOW * 1000);
  expect(parsed.isOk()).toBe(true);
  if (parsed.isOk()) {
    const text = codexRateSegment(
      parsed.value,
      undefined,
      NOW,
      "Asia/Tokyo",
    ).replaceAll(new RegExp(`${ESC}\\[[0-9;]*m`, "gu"), "");
    expect(text).toContain("codex 7d 11% ⟳10-14 12:28(5d5h 25%)");
    expect(text).not.toContain("cr ");
  }
});

test("renders both windows and hides unlimited or absent credits", async () => {
  const { root, file } = await fixture();
  await writeFile(
    file,
    event(
      sample(window(300, 2.4, 1791516600), window(10080, 44, 1791948537), {
        has_credits: true,
        unlimited: true,
        balance: "62500",
      }),
    ),
  );
  await setMtime(file, NOW);
  const parsed = await readCodexRate(root, undefined, NOW * 1000);
  expect(parsed.isOk()).toBe(true);
  if (parsed.isOk()) {
    const text = codexRateSegment(
      parsed.value,
      undefined,
      NOW,
      "Asia/Tokyo",
    ).replaceAll(new RegExp(`${ESC}\\[[0-9;]*m`, "gu"), "");
    expect(text).toContain("codex 5h  2%");
    expect(text).toContain("codex 7d 44%");
    expect(text).not.toContain("cr ");
  }
});

test("stale sessions retain values and missing sessions remain unknown", async () => {
  const { root, file } = await fixture();
  await writeFile(file, event(sample(null, window(10080, 11, 1791948537))));
  const staleEpoch = NOW - 2 * 60 * 60;
  await setMtime(file, staleEpoch);
  const parsed = await readCodexRate(root, undefined, NOW * 1000);
  expect(parsed.isOk()).toBe(true);
  if (parsed.isOk() && parsed.value !== undefined)
    expect(
      codexRateSegment(parsed.value, undefined, NOW, "Asia/Tokyo").replaceAll(
        new RegExp(`${ESC}\\[[0-9;]*m`, "gu"),
        "",
      ),
    ).toContain("codex 7d 11%");
  const absent = await readCodexRate(join(root, "missing"));
  expect(absent.isOk()).toBe(true);
  if (absent.isOk()) expect(absent.value).toBeUndefined();
});

test("ignores corrupt and unrelated tail lines when no rate object exists", async () => {
  const { root, file } = await fixture();
  await writeFile(file, "{corrupt json line}\n");
  const parsed = await readCodexRate(root);
  expect(parsed.isOk()).toBe(true);
  if (parsed.isOk()) expect(parsed.value).toBeUndefined();
  expect(
    codexRateSegment(undefined).replaceAll(
      new RegExp(`${ESC}\\[[0-9;]*m`, "gu"),
      "",
    ),
  ).toContain("codex n/a");
});

test("drops the partial first line when the 256 KiB tail begins mid-line", async () => {
  const { root, file } = await fixture();
  const rateLine = event(sample(null, window(10080, 17, 1791948537)));
  await writeFile(file, `${"x".repeat(256 * 1024 - 20)}${rateLine}\n`);
  const parsed = await readCodexRate(root);
  expect(parsed.isOk()).toBe(true);
  if (parsed.isOk() && parsed.value !== undefined)
    expect(parsed.value.windows[0]?.percent).toBe(17);
});

test("finds a rate event among large unrelated lines", async () => {
  const { root, file } = await fixture();
  const unrelated = JSON.stringify({
    type: "response_item",
    payload: { data: "A".repeat(90 * 1024) },
  });
  await writeFile(
    file,
    `${unrelated}\n${event(sample(null, window(10080, 23, 1791948537)))}\n${unrelated}\n`,
  );
  const parsed = await readCodexRate(root);
  expect(parsed.isOk()).toBe(true);
  if (parsed.isOk() && parsed.value !== undefined)
    expect(parsed.value.windows[0]?.percent).toBe(23);
});

test("expands the tail when the only rate event is before 256 KiB", async () => {
  const { root, file } = await fixture();
  const rateLine = event(sample(null, window(10080, 31, 1791948537)));
  const unrelated = JSON.stringify({
    type: "response_item",
    payload: { data: "A".repeat(100 * 1024) },
  });
  await writeFile(
    file,
    `${rateLine}\n${unrelated}\n${unrelated}\n${unrelated}\n`,
  );
  const parsed = await readCodexRate(root);
  expect(parsed.isOk()).toBe(true);
  if (parsed.isOk() && parsed.value !== undefined)
    expect(parsed.value.windows[0]?.percent).toBe(31);
});

test("live usage tail skips a partial first line", async () => {
  const { root } = await fixture();
  const day = Temporal.Now.plainDateISO();
  const dir = join(
    root,
    String(day.year),
    String(day.month).padStart(2, "0"),
    String(day.day).padStart(2, "0"),
  );
  const session = "tail-session";
  await mkdir(dir, { recursive: true });
  const file = join(dir, `rollout-any-${session}.jsonl`);
  const usageEvent = JSON.stringify({
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        total_token_usage: {
          input_tokens: 88,
          cached_input_tokens: 12,
          output_tokens: 9,
          reasoning_output_tokens: 2,
          total_tokens: 99,
        },
      },
    },
  });
  await writeFile(file, `${"x".repeat(256 * 1024 + 10)}\n${usageEvent}\n`);
  expect(await readCodexUsage(root, session)).toEqual({
    input_tokens: 88,
    cached_input_tokens: 12,
    output_tokens: 9,
    reasoning_output_tokens: 2,
  });
});

test("account usage survives newer empty sessions, pinned sessions, and null rate events", async () => {
  const { root, file } = await fixture();
  const now = Temporal.Now.instant().epochMilliseconds;
  const timestamp = Temporal.Instant.fromEpochMilliseconds(
    now - 1000,
  ).toString();
  await writeFile(
    file,
    JSON.stringify({
      timestamp,
      type: "event_msg",
      payload: {
        type: "token_count",
        rate_limits: sample(
          null,
          window(10080, 37, Math.floor(now / 1000) + 604800),
        ),
      },
    }) +
      '\n{"type":"event_msg","payload":{"type":"token_count","rate_limits":null}}\n',
  );
  const day = Temporal.Now.plainDateISO();
  const dir = join(
    root,
    String(day.year),
    String(day.month).padStart(2, "0"),
    String(day.day).padStart(2, "0"),
  );
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "rollout-new-empty-session.jsonl"),
    '{"type":"session_meta"}\n',
  );
  for (const session of [undefined, "empty-session"]) {
    for (let i = 0; i < 3; i++) {
      const result = await readCodexRate(root, session);
      expect(
        result.isOk()
          ? result.value?.windows.find((value) => value.minutes === 10080)
              ?.percent
          : result.error,
      ).toBe(37);
    }
  }
});
