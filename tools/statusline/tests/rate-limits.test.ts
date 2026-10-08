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
