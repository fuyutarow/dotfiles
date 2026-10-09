import { expect, test } from "bun:test";
import { rateRow } from "../src/rate-limits.ts";
import { ESC, RST } from "../src/ansi.ts";

const stripAnsi = (value: string): string =>
  value.replaceAll(new RegExp(`${ESC}\\[[0-9;]*m`, "gu"), "");

test("5h rate usage stays plain and reset includes elapsed share", () => {
  const now = Math.floor(
    Temporal.Instant.from("2026-10-08T12:00:00Z").epochMilliseconds / 1000,
  );
  const reset = now + 2 * 60 * 60 + 50 * 60;
  const row = rateRow(
    {
      rl5: 60,
      rl5Reset: reset,
      rl7: undefined,
      rl7Reset: undefined,
      rlModel: [],
      modelCapsWhy: undefined,
    },
    now,
  );

  expect(stripAnsi(row)).toMatch(/5h 60% ⟳\d\d:\d\d\(2h50m 43%\)/u);
  expect(row).toContain(`${ESC}[38;5;178m60%${RST}`);
});

test("7d rate usage stays plain and reset includes elapsed share", () => {
  const now = Math.floor(
    Temporal.Instant.from("2026-10-08T12:00:00Z").epochMilliseconds / 1000,
  );
  const reset = now + 5 * 86400 + 2 * 3600;
  const row = rateRow(
    {
      rl5: undefined,
      rl5Reset: undefined,
      rl7: 40,
      rl7Reset: reset,
      rlModel: [],
      modelCapsWhy: undefined,
    },
    now,
  );

  expect(stripAnsi(row)).toMatch(/7d 40% ⟳\d\d-\d\d \d\d:\d\d\(5d02h 27%\)/u);
  expect(row).toContain(`${ESC}[38;5;178m40%${RST}`);
});

test("rate row prefixes Claude windows and appends Codex elapsed share and Jev token fallback", () => {
  const now = 1791496800;
  const row = rateRow(
    {
      rl5: 15,
      rl5Reset: now + 3480,
      rl7: 50,
      rl7Reset: 1792335600,
      rlModel: [],
      modelCapsWhy: undefined,
      codexRate: {
        windows: [{ minutes: 10080, percent: 12, reset: 1792335600 }],
        mtimeMs: Temporal.Now.instant().epochMilliseconds,
      },
      codexRateWhy: undefined,
      jevUsage: { costUsd: 0.042 },
    },
    now,
  );
  expect(stripAnsi(row)).toContain("claude 5h 15% ⟳");
  expect(stripAnsi(row)).toContain(" · 7d 50% ⟳");
  expect(stripAnsi(row)).toContain(" | codex 7d 12% ⟳");
  expect(stripAnsi(row)).toContain(" | Jev $0.0420");
  expect(stripAnsi(row)).not.toContain("cr ");
});

test.each([
  [false, false],
  [true, false],
  [false, true],
  [true, true],
])("provider separators with Codex=%s and Jev=%s", (hasCodex, hasJev) => {
  const row = stripAnsi(
    rateRow({
      rl5: 15,
      rl7: 50,
      rlModel: [{ name: "Fable", pct: 20, resetEpoch: undefined }],
      codexRate: hasCodex
        ? {
            windows: [
              { minutes: 300, percent: 10 },
              { minutes: 10080, percent: 12 },
            ],
            mtimeMs: Temporal.Now.instant().epochMilliseconds,
          }
        : undefined,
      jevUsage: hasJev ? { costUsd: 0.002 } : undefined,
    }),
  );
  let expected = "Rate: claude 5h 15% · 7d 50% · Fable 20%";
  if (hasCodex) expected += " | codex 5h 10% · codex 7d 12%";
  if (hasJev) expected += " | Jev <$0.01";
  expect(row).toBe(expected);
});

test("missing Claude rates retain their placeholders without dangling provider separators", () => {
  const row = stripAnsi(
    rateRow({
      rlModel: [],
      jevUsage: { costUsd: 0.002 },
    }),
  );
  expect(row).toBe("Rate: claude 5h n/a · 7d n/a | Jev <$0.01");
  expect(stripAnsi(rateRow({ rlModel: [] }))).not.toContain(" | ");
});
