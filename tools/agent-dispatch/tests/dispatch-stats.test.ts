import { describe, expect, test } from "bun:test";
import { dispatchStats } from "../src/dispatch-stats.ts";

const now = Temporal.Instant.from("2026-10-08T00:00:00Z").epochMilliseconds;
const run = (
  host: string,
  hoursAgo: number,
  source: string,
  row: string,
  route: "codex" | "claude",
) =>
  JSON.stringify({
    kind: "run",
    host,
    started_at: Temporal.Instant.fromEpochMilliseconds(
      now - hoursAgo * 60 * 60 * 1000,
    ).toString(),
    pick: { source, choice: row },
    stats: { row, route },
  });

describe("dispatchStats", () => {
  test("aggregates per host, source, route, row, and time window", () => {
    const report = dispatchStats({
      now,
      log: [
        run("vast", 1, "jev", "luna-high", "codex"),
        run("vast", 2, "jev", "sonnet-medium", "claude"),
        run("vast", 3, "default", "luna-high", "codex"),
        run("vast", 25, "resume", "sonnet-medium", "claude"),
        run("mac", 1, "resume", "luna-max", "codex"),
        run("vast", 8 * 24, "jev", "luna-high", "codex"),
      ].join("\n"),
    });
    expect(report).toEqual({
      mac: {
        "24h": {
          jev: {
            picks: 0,
            by_route: { codex: 0, claude: 0 },
            by_row: {},
            codex_share_pct: 0,
          },
          default: {
            picks: 0,
            by_route: { codex: 0, claude: 0 },
            by_row: {},
            codex_share_pct: 0,
          },
          resume: {
            picks: 1,
            by_route: { codex: 1, claude: 0 },
            by_row: { "luna-max": 1 },
            codex_share_pct: 100,
          },
        },
        "7d": {
          jev: {
            picks: 0,
            by_route: { codex: 0, claude: 0 },
            by_row: {},
            codex_share_pct: 0,
          },
          default: {
            picks: 0,
            by_route: { codex: 0, claude: 0 },
            by_row: {},
            codex_share_pct: 0,
          },
          resume: {
            picks: 1,
            by_route: { codex: 1, claude: 0 },
            by_row: { "luna-max": 1 },
            codex_share_pct: 100,
          },
        },
      },
      vast: {
        "24h": {
          jev: {
            picks: 2,
            by_route: { codex: 1, claude: 1 },
            by_row: { "luna-high": 1, "sonnet-medium": 1 },
            codex_share_pct: 50,
          },
          default: {
            picks: 1,
            by_route: { codex: 1, claude: 0 },
            by_row: { "luna-high": 1 },
            codex_share_pct: 100,
          },
          resume: {
            picks: 0,
            by_route: { codex: 0, claude: 0 },
            by_row: {},
            codex_share_pct: 0,
          },
        },
        "7d": {
          jev: {
            picks: 2,
            by_route: { codex: 1, claude: 1 },
            by_row: { "luna-high": 1, "sonnet-medium": 1 },
            codex_share_pct: 50,
          },
          default: {
            picks: 1,
            by_route: { codex: 1, claude: 0 },
            by_row: { "luna-high": 1 },
            codex_share_pct: 100,
          },
          resume: {
            picks: 1,
            by_route: { codex: 0, claude: 1 },
            by_row: { "sonnet-medium": 1 },
            codex_share_pct: 0,
          },
        },
      },
    });
  });
});
