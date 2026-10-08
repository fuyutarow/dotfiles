import { describe, expect, test } from "bun:test";
import { dispatchWarning } from "../../dispatch-warning.ts";

const now = Temporal.Instant.from("2026-10-08T00:00:00Z").epochMilliseconds;
const run = (
  host: string,
  hoursAgo: number,
  route: "codex" | "claude",
  source = "jev",
) =>
  JSON.stringify({
    kind: "run",
    host,
    started_at: Temporal.Instant.fromEpochMilliseconds(
      now - hoursAgo * 60 * 60 * 1000,
    ).toString(),
    pick: { source, choice: route === "codex" ? "luna-high" : "sonnet-medium" },
    stats: { route },
  });
const cache = (host = "vast", available = true) =>
  JSON.stringify({ host, available });

describe("statusline dispatch warning", () => {
  test("appears only with at least five recent Jev picks, no codex picks, and available codex route", () => {
    const fiveClaudes = Array.from({ length: 5 }, () =>
      run("vast", 1, "claude"),
    ).join("\n");
    expect(dispatchWarning(fiveClaudes, cache(), "vast", now)).toBe(
      "codex 0/5 picks ⚠",
    );
    expect(
      dispatchWarning(fiveClaudes, cache("elsewhere"), "vast", now),
    ).toBeUndefined();
    expect(
      dispatchWarning(fiveClaudes, cache("vast", false), "vast", now),
    ).toBeUndefined();
    expect(
      dispatchWarning(fiveClaudes, cache(), "other-host", now),
    ).toBeUndefined();
    expect(
      dispatchWarning(
        fiveClaudes.split("\n").slice(0, 4).join("\n"),
        cache(),
        "vast",
        now,
      ),
    ).toBeUndefined();
    expect(
      dispatchWarning(
        `${fiveClaudes}\n${run("vast", 1, "codex")}`,
        cache(),
        "vast",
        now,
      ),
    ).toBeUndefined();
    expect(
      dispatchWarning(
        `${fiveClaudes}\n${run("vast", 1, "claude", "default")}`,
        cache(),
        "vast",
        now,
      ),
    ).toBe("codex 0/5 picks ⚠");
    expect(
      dispatchWarning(
        Array.from({ length: 5 }, () => run("vast", 25, "claude")).join("\n"),
        cache(),
        "vast",
        now,
      ),
    ).toBeUndefined();
  });
});
