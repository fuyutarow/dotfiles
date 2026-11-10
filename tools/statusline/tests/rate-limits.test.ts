import { describe, expect, test } from "bun:test";
import { ClaudeStatuslineInputSchema } from "../src/adapters/claude-statusline.ts";
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
  expect(stripAnsi(row)).toContain(" | Jev 7d spend $0.04");
  expect(row).toContain(`codex 7d ${ESC}[38;5;71m12%${RST}`);
  expect(row).toContain(
    `Jev 7d ${ESC}[2mspend${RST} ${ESC}[38;5;71m$0.04${RST}`,
  );
  expect(stripAnsi(row)).not.toContain("cr ");
});

test.each([
  [-56, "−56"],
  [56, "+56"],
  [0, "±0"],
])(
  "Codex credits follow its windows and show the signed 24h change (%s)",
  (delta, signed) => {
    const row = stripAnsi(
      rateRow(
        {
          rlModel: [],
          codexRate: {
            windows: [{ minutes: 10080, percent: 12 }],
            credits: "1234",
            creditChange: { delta, spanMs: 24 * 60 * 60 * 1000 },
            mtimeMs: 1791496800000,
          },
        },
        1791496800,
      ),
    );
    expect(row).toContain(`· codex credits 1234 ${signed}/24h`);
  },
);

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
  else expected += " | codex n/a (unavailable)";
  if (hasJev) expected += " | Jev 7d spend <$0.01";
  else expected += " | Jev n/a (usage sample unavailable)";
  expect(row).toBe(expected);
});

test("a payload without rate_limits keeps one claude cell and no per-window cells or dangling separators", () => {
  const row = stripAnsi(
    rateRow({
      rlModel: [],
      jevUsage: { costUsd: 0.002 },
    }),
  );
  expect(row).toBe(
    "Rate: claude none (no API response yet) | codex n/a (unavailable) | Jev 7d spend <$0.01",
  );
  expect(stripAnsi(rateRow({ rlModel: [] }))).toBe(
    "Rate: claude none (no API response yet) | codex n/a (unavailable) | Jev n/a (usage sample unavailable)",
  );
});

// Payloads captured from Claude Code 2.1.317 (run 2b6f02a2 capture/payloads.tsv rows 1 and 12):
// the account is sent only `seven_day`, and nothing at all before the first API response.
const NOW = 1793887200 - 2 * 86400 - 2 * 3600;
async function claudeRow(payload: unknown): Promise<string> {
  const parsed = await ClaudeStatuslineInputSchema.safeParseAsync(payload);
  expect(parsed.success).toBe(true);
  const rl = parsed.data?.rateLimits;
  return stripAnsi(
    rateRow(
      {
        rl5: rl?.fiveHour?.usedPercent,
        rl5Reset: rl?.fiveHour?.resetsAt,
        rl7: rl?.sevenDay?.usedPercent,
        rl7Reset: rl?.sevenDay?.resetsAt,
        rlSent: rl !== undefined,
        rl5Why:
          rl?.unreadable?.includes("fiveHour") === true
            ? "input has an unreadable Claude 5h rate limit"
            : undefined,
        rl7Why:
          rl?.unreadable?.includes("sevenDay") === true
            ? "input has an unreadable Claude 7d rate limit"
            : undefined,
        rlModel: [],
      },
      NOW,
      ["claude"],
    ),
  );
}
const SEVEN_DAY = { used_percentage: 48, resets_at: 1793887200 };

describe("Claude rate windows from the stdin payload", () => {
  test("(a) only seven_day sent: the 5h cell is omitted, 7d is unchanged", async () => {
    const row = await claudeRow({ rate_limits: { seven_day: SEVEN_DAY } });
    expect(row).toBe("Rate: claude 7d 48% ⟳11-05 14:00(2d02h 70%)");
    expect(row).not.toContain("5h");
    expect(row).not.toContain("n/a");
    expect(row).not.toContain("none");
  });
  test("(b) no rate_limits yet: one claude cell, no per-window cells", async () => {
    const row = await claudeRow({});
    expect(row).toBe("Rate: claude none (no API response yet)");
    expect(row).not.toContain("n/a");
    expect(row).not.toContain("5h");
    expect(row).not.toContain("7d");
  });
  test("(b') rate_limits sent but empty: still no failure wording", async () => {
    expect(await claudeRow({ rate_limits: {} })).toBe(
      "Rate: claude none (no rate-limit window sent)",
    );
  });
  test("(c) both windows sent: unchanged", async () => {
    expect(
      await claudeRow({
        rate_limits: {
          five_hour: { used_percentage: 12, resets_at: NOW + 3600 },
          seven_day: SEVEN_DAY,
        },
      }),
    ).toBe(
      "Rate: claude 5h 12% ⟳13:00(1h00m 80%) · 7d 48% ⟳11-05 14:00(2d02h 70%)",
    );
  });
  test("(d) a sent window that cannot be parsed is still a failure n/a", async () => {
    expect(
      await claudeRow({
        rate_limits: {
          five_hour: { used_percentage: "x" },
          seven_day: SEVEN_DAY,
        },
      }),
    ).toBe(
      "Rate: claude 5h n/a (input has an unreadable Claude 5h rate limit) · 7d 48% ⟳11-05 14:00(2d02h 70%)",
    );
    expect(await claudeRow({ rate_limits: "garbage" })).toBe(
      "Rate: claude 5h n/a (input has an unreadable Claude 5h rate limit) · 7d n/a (input has an unreadable Claude 7d rate limit)",
    );
    // a window object without a percentage carries nothing to show either
    expect(
      await claudeRow({ rate_limits: { five_hour: {}, seven_day: SEVEN_DAY } }),
    ).toContain("5h n/a (input has an unreadable Claude 5h rate limit)");
  });
});
