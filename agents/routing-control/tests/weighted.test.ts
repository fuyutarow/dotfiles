import { describe, expect, test } from "bun:test";
import { loadRoster, weighted, type Roster } from "../../models/roster.ts";

// The luna-first bias: Jev's probability per row times its route weight (dispatch-roster.toml
// [selection]); the highest product wins. These cases pin what the declared weights MEAN.
const loaded = await loadRoster();

test("the live roster loads", () => {
  expect(loaded.ok ? "loaded" : loaded.error).toBe("loaded");
});

const bias = (
  roster: Roster,
): { w: Roster["selection"]["route_weight"]; ratio: number } => {
  const w = roster.selection.route_weight;
  return { w, ratio: w.luna / w.claude }; // how many times the best luna row a claude row must be rated
};

describe.skipIf(!loaded.ok)("weighted pick", () => {
  const roster = loaded.ok ? loaded.value : undefined;
  if (roster === undefined) return;
  const { w, ratio } = bias(roster);
  test("Jev leaning to a claude row still gets the best luna row while under the ratio", () => {
    const p = weighted(roster, {
      choice: "sonnet-high",
      probabilities: {
        "sonnet-high": 0.6,
        "luna-xhigh": 0.3,
        "luna-high": 0.1,
      },
    });
    expect(p?.row.id).toBe("luna-xhigh");
  });

  test("a claude row wins once Jev rates it above ratio x the best luna row", () => {
    const luna = 0.04;
    const p = weighted(roster, {
      choice: "opus-medium",
      probabilities: { "opus-medium": luna * ratio + 0.05, "luna-max": luna },
    });
    expect(p?.row.id).toBe("opus-medium");
  });

  test("the raw and weighted numbers are both reported, and the share is of the weighted total", () => {
    const p = weighted(roster, {
      choice: "luna-high",
      probabilities: { "luna-high": 0.5, "sonnet-medium": 0.5 },
    });
    expect(p?.scores["luna-high"]).toBe(0.5);
    expect(p?.scores["sonnet-medium"]).toBe(0.5 * w.claude);
    expect(p?.share).toBe(
      Math.round((0.5 / (0.5 + 0.5 * w.claude)) * 1000) / 1000,
    );
  });

  test("no probability for any roster row is undefined (the caller falls back to the default)", () => {
    expect(
      weighted(roster, { choice: "gpt-9", probabilities: { "gpt-9": 1 } }),
    ).toBeUndefined();
  });

  test("the declared weights keep luna first", () => {
    expect(w.luna).toBeGreaterThan(w.claude);
    expect(roster.choice.find((c) => c.id === roster.default)?.route).toBe(
      "luna",
    );
  });
});
