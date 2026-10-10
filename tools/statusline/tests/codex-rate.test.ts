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
async function fixture(): Promise<{ root: string; file: string }> {
  const root = await mkdtemp(join(tmpdir(), "statusline-codex-"));
  roots.push(root);
  const dir = join(root, "2026", "10", "09");
  await mkdir(dir, { recursive: true });
  return { root, file: join(dir, "rollout-1.jsonl") };
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
  const parsed = await readCodexRate(root);
  expect(parsed.isOk()).toBe(true);
  if (parsed.isOk()) {
    const text = codexRateSegment(
      parsed.value,
      undefined,
      1791496800,
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
  const parsed = await readCodexRate(root);
  expect(parsed.isOk()).toBe(true);
  if (parsed.isOk()) {
    const text = codexRateSegment(
      parsed.value,
      undefined,
      1791496800,
    ).replaceAll(new RegExp(`${ESC}\\[[0-9;]*m`, "gu"), "");
    expect(text).toContain("codex 5h  2%");
    expect(text).toContain("codex 7d 44%");
    expect(text).not.toContain("cr ");
  }
});

test("stale and missing sessions render named absence", async () => {
  const { root, file } = await fixture();
  await writeFile(file, event(sample(null, window(10080, 11, 1791948537))));
  const stale = Temporal.Now.instant().subtract({ hours: 2 }).toString();
  const staleEpoch = Temporal.Instant.from(stale).epochMilliseconds / 1000;
  await utimes(file, staleEpoch, staleEpoch);
  const parsed = await readCodexRate(root);
  expect(parsed.isOk()).toBe(true);
  if (parsed.isOk() && parsed.value !== undefined)
    expect(codexRateSegment(parsed.value)).toContain(
      "codex n/a (stale source)",
    );
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
  expect(codexRateSegment(undefined)).toContain("codex n/a");
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
