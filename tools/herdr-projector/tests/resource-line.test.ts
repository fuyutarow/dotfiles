import { expect, test } from "bun:test";
import {
  cpuTokenArgs,
  plainShellCounts,
  resourceTokens,
} from "../src/herdr-projector.ts";

const GiB = 1024 ** 3;
const CPU_NAMES = ["cpu_lo", "cpu_mid", "cpu_hi"];

test("cpu is its own token chosen by the shared usage level; ram is row 3's grey token", () => {
  for (const [cpu, token] of [
    [1, "cpu_lo"],
    [50, "cpu_lo"],
    [75, "cpu_mid"],
    [99, "cpu_hi"],
    [69, "cpu_lo"],
    [70, "cpu_mid"],
    [89, "cpu_mid"],
    [90, "cpu_hi"],
  ] as const) {
    const tokens = resourceTokens(3, cpu, 8.5 * GiB, undefined, 2, 80);
    expect(tokens.cpu).toEqual({ token, text: `cpu ${cpu}%` });
    expect(tokens.resources).toBe("ram 8.5G");
    expect(tokens.counts).toBe("3 workers · 2 shells");
  }
});

test("exactly one cpu token is reported, the other two cleared, all plain text", () => {
  for (const cpu of [1, 50, 75, 99]) {
    const args = cpuTokenArgs(
      resourceTokens(3, cpu, 8.5 * GiB, undefined, 2).cpu,
    );
    const reported = args.flatMap((arg, i) =>
      args[i - 1] === "--token" ? [arg] : [],
    );
    const cleared = args.flatMap((arg, i) =>
      args[i - 1] === "--clear-token" ? [arg] : [],
    );
    expect(reported).toHaveLength(1);
    expect(cleared).toHaveLength(2);
    expect(reported[0]).toMatch(/^cpu_(lo|mid|hi)=cpu \d+%$/u);
    expect(new Set([...cleared, reported[0]?.split("=")[0]])).toEqual(
      new Set(CPU_NAMES),
    );
    expect(args.some((arg) => /\p{Cc}/u.test(arg))).toBe(false);
  }
  expect(
    cpuTokenArgs(resourceTokens(3, 99, undefined, undefined, 2).cpu),
  ).toEqual([
    "--clear-token",
    "cpu_lo",
    "--clear-token",
    "cpu_mid",
    "--token",
    "cpu_hi=cpu 99%",
  ]);
});

test("unknown cpu reports no cpu token and keeps cpu ? first in row 3's grey token", () => {
  const unknown = resourceTokens(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  );
  expect(unknown).toEqual({
    resources: "cpu ?",
    counts: "? workers · ? shells",
  });
  expect(cpuTokenArgs(unknown.cpu)).toEqual([
    "--clear-token",
    "cpu_lo",
    "--clear-token",
    "cpu_mid",
    "--clear-token",
    "cpu_hi",
  ]);
});

test("rows 3 and 4 at width 28: cpu · ram/vram, then workers · shells", () => {
  const rows = (cpu: number, width: number, vram?: number) => {
    const t = resourceTokens(3, cpu, 8.5 * GiB, vram, 2, width);
    return [`${t.cpu?.text} · ${t.resources}`, t.counts];
  };
  // Wide enough for every part of row 3 and row 4.
  expect(rows(74, 60, 12 * GiB)).toEqual([
    "cpu 74% · ram 8.5G · vram 12G",
    "3 workers · 2 shells",
  ]);
  // Row 3 at 28: the 18 columns after "cpu 99% · " cannot hold vram; row 4 is whole.
  expect(rows(99, 28, 12 * GiB)).toEqual([
    "cpu 99% · ram 8.5G",
    "3 workers · 2 shells",
  ]);
  expect(rows(99, 28)[0]).toHaveLength(18);
});

test("fit rule per token: whole parts only, never a cut mid-token", () => {
  const row3 = (width: number) =>
    resourceTokens(3, 41, 8.5 * GiB, 12 * GiB, 2, width).resources;
  const row4 = (width: number) =>
    resourceTokens(3, 41, 8.5 * GiB, 12 * GiB, 2, width).counts;
  // Row 3 has cpu's 10 columns taken out of the width: vram goes first, then ram.
  expect(row3(50)).toBe("ram 8.5G · vram 12G");
  expect(row3(28)).toBe("ram 8.5G");
  expect(row3(17)).toBe("");
  // Row 4 has the full width: shells go first, then workers.
  expect(row4(28)).toBe("3 workers · 2 shells");
  expect(row4(19)).toBe("3 workers");
  expect(row4(8)).toBe("");
  for (let width = 0; width <= 80; width++) {
    expect(["ram 8.5G · vram 12G", "ram 8.5G", ""].includes(row3(width))).toBe(
      true,
    );
    expect(
      ["3 workers · 2 shells", "3 workers", ""].includes(row4(width)),
    ).toBe(true);
  }
});

test("unknown workers and shells read '? workers' and '? shells'; vram optional", () => {
  const unknown = resourceTokens(
    undefined,
    41,
    0.52 * GiB,
    undefined,
    undefined,
    80,
  );
  expect(unknown.resources).toBe("ram 0.52G");
  expect(unknown.counts).toBe("? workers · ? shells");
  const withVram = resourceTokens(1, 41, 0.52 * GiB, 1.2 * GiB, 2, 80);
  expect(withVram.resources).toBe("ram 0.52G · vram 1.2G");
  expect(withVram.counts).toBe("1 workers · 2 shells");
});

test("default width 28 with all parts known: row 3 cpu 41% · ram 0.52G, row 4 counts whole", () => {
  const t = resourceTokens(1, 41, 0.52 * GiB, undefined, 2);
  expect(`${t.cpu?.text} · ${t.resources}`).toBe("cpu 41% · ram 0.52G");
  expect(t.counts).toBe("1 workers · 2 shells");
});

test("memory uses two significant figures in row 3's grey token", () => {
  for (const [value, expected] of [
    [279.4 * 1024 ** 2, "0.27G"],
    [115.8 * 1024 ** 2, "0.11G"],
    [700 * 1024 ** 2, "0.68G"],
    [512 * 1024 ** 2, "0.50G"],
    [1.7 * GiB, "1.7G"],
    [54.9 * GiB, "55G"],
    [1023.9 * 1024 ** 2, "1.0G"],
    [1.04 * GiB, "1.0G"],
  ] as const) {
    const t = resourceTokens(1, 1, value, value, 0, 80);
    expect(t.resources).toBe(`ram ${expected} · vram ${expected}`);
    expect(t.counts).toBe("1 workers · 0 shells");
  }
});

test("plain shells are panes herdr reports without an agent, counted per tab", () => {
  const listing = JSON.stringify({
    id: "cli:pane:list",
    result: {
      panes: [
        { pane_id: "w9:p1", tab_id: "w9:tE", agent: "claude" },
        { pane_id: "w9:p2", tab_id: "w9:tE", agent: null },
        { pane_id: "w9:p3", tab_id: "w9:tE" },
        { pane_id: "w9:p4", tab_id: "w9:tK", agent: null },
      ],
    },
  });
  const counts = plainShellCounts(listing);
  expect(counts?.get("w9:tE")).toBe(2);
  expect(counts?.get("w9:tK")).toBe(1);
  expect(counts?.get("w9:tZ")).toBeUndefined();
  expect(plainShellCounts(undefined)).toBeUndefined();
  expect(plainShellCounts("not json")).toBeUndefined();
});
