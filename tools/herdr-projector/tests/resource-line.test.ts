import { expect, test } from "bun:test";
import {
  cpuTokenArgs,
  plainShellCounts,
  resourceTokens,
  ROW3_FIT_WIDTH,
} from "../src/herdr-projector.ts";

const GiB = 1024 ** 3;
const CPU_NAMES = ["cpu_lo", "cpu_mid", "cpu_hi"];

test("cpu is its own token chosen by the shared usage level; row 3's grey token carries ram and counts", () => {
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
    expect(tokens.resources).toBe("ram 8.5G │ 3 wkr 2 sh");
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

test("unknown cpu reports no cpu token and keeps 'cpu ?' first in the grey token", () => {
  const unknown = resourceTokens(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  );
  expect(unknown).toEqual({ resources: "cpu ? ? wkr ? sh" });
  expect(
    cpuTokenArgs(
      resourceTokens(undefined, undefined, undefined, undefined, undefined).cpu,
    ),
  ).toEqual([
    "--clear-token",
    "cpu_lo",
    "--clear-token",
    "cpu_mid",
    "--clear-token",
    "cpu_hi",
  ]);
});

/** Row 3 as the sidebar shows it: the cpu token, herdr's separator, then the grey token. */
const sidebarRow3 = (
  cpu: number,
  ram: number,
  workers: number | undefined,
  shells: number | undefined,
  vram: number | undefined,
  width: number,
) => {
  const t = resourceTokens(workers, cpu, ram, vram, shells, width);
  return `${t.cpu?.text} · ${t.resources}`;
};

test("the width decides whether unknown-count shells fit beside the bar", () => {
  expect(sidebarRow3(1, 20 * GiB, 1, 4, undefined, 28)).toBe(
    "cpu 1% · ram 20G │ 1 wkr",
  );
  expect(sidebarRow3(1, 20 * GiB, 1, 4, undefined, 30)).toBe(
    "cpu 1% · ram 20G │ 1 wkr 4 sh",
  );
  // 0.18G reads 0.2G: "ram 0.2G │ ? wkr ? sh" is 21 columns, so it fits from width 30 up.
  expect(sidebarRow3(0, 0.18 * GiB, undefined, undefined, undefined, 28)).toBe(
    "cpu 0% · ram 0.2G │ ? wkr",
  );
  expect(sidebarRow3(0, 0.18 * GiB, undefined, undefined, undefined, 29)).toBe(
    "cpu 0% · ram 0.2G │ ? wkr",
  );
  expect(sidebarRow3(0, 0.18 * GiB, undefined, undefined, undefined, 30)).toBe(
    "cpu 0% · ram 0.2G │ ? wkr ? sh",
  );
  expect(sidebarRow3(0, 0.18 * GiB, undefined, undefined, undefined, 31)).toBe(
    "cpu 0% · ram 0.2G │ ? wkr ? sh",
  );
});

test("unknown workers and shells (Codex) read '? wkr' and '? sh'; vram optional", () => {
  expect(
    resourceTokens(undefined, 1, 20 * GiB, undefined, undefined, 80).resources,
  ).toBe("ram 20G │ ? wkr ? sh");
  expect(resourceTokens(1, 1, 20 * GiB, 12 * GiB, 4, 80).resources).toBe(
    "ram 20G vram 12G │ 1 wkr 4 sh",
  );
});

test("vram sits with the memory part and drops first; a zero vram reading is not reported", () => {
  // cpu is reported here, so the grey token gets the width less "cpu 1%" and herdr's separator.
  expect(resourceTokens(1, 1, 20 * GiB, 12 * GiB, 4, 38).resources).toBe(
    "ram 20G vram 12G │ 1 wkr 4 sh",
  );
  expect(resourceTokens(1, 1, 20 * GiB, 12 * GiB, 4, 30).resources).toBe(
    "ram 20G │ 1 wkr 4 sh",
  );
  expect(resourceTokens(1, 1, 20 * GiB, 12 * GiB, 4, 26).resources).toBe(
    "ram 20G │ 1 wkr",
  );
  expect(resourceTokens(1, 1, 20 * GiB, 0, 4, 80).resources).toBe(
    "ram 20G │ 1 wkr 4 sh",
  );
});

test("fit rule per token: whole parts only, never a cut mid-token, cpu and ram kept", () => {
  // Grey width is the row width less "cpu 41%" and herdr's separator (10 columns).
  const row3 = (width: number) =>
    resourceTokens(3, 41, 8.5 * GiB, 12 * GiB, 2, width).resources;
  expect(row3(50)).toBe("ram 8.5G vram 12G │ 3 wkr 2 sh");
  expect(row3(37)).toBe("ram 8.5G │ 3 wkr 2 sh");
  expect(row3(28)).toBe("ram 8.5G │ 3 wkr");
  expect(row3(20)).toBe("ram 8.5G");
  expect(row3(17)).toBe("");
  const allowed = new Set([
    "ram 8.5G vram 12G │ 3 wkr 2 sh",
    "ram 8.5G │ 3 wkr 2 sh",
    "ram 8.5G │ 3 wkr",
    "ram 8.5G",
    "",
  ]);
  for (let width = 0; width <= 80; width++) {
    expect(allowed.has(row3(width))).toBe(true);
  }
});

test("the bar never trails: dropping every count part drops the bar with it", () => {
  for (let width = 0; width <= 80; width++) {
    const text = resourceTokens(
      3,
      41,
      8.5 * GiB,
      undefined,
      2,
      width + 10,
    ).resources;
    expect(text.endsWith("│")).toBe(false);
    expect(text.startsWith("│")).toBe(false);
  }
});

test("default width is the 31-column sidebar: a 0.52G row reads 0.5G and keeps sh", () => {
  expect(ROW3_FIT_WIDTH).toBe(31);
  const t = resourceTokens(1, 41, 0.52 * GiB, undefined, 2);
  expect(`${t.cpu?.text} · ${t.resources}`).toBe(
    "cpu 41% · ram 0.5G │ 1 wkr 2 sh",
  );
});

test("the bar's three columns cost sh at 31 for cpu 253% and keep it for cpu 1%", () => {
  expect(sidebarRow3(253, 7 * GiB, 0, 0, undefined, ROW3_FIT_WIDTH)).toBe(
    "cpu 253% · ram 7.0G │ 0 wkr",
  );
  expect(sidebarRow3(253, 7 * GiB, 0, 0, undefined, 32)).toBe(
    "cpu 253% · ram 7.0G │ 0 wkr 0 sh",
  );
  expect(sidebarRow3(1, 20 * GiB, 1, 4, undefined, ROW3_FIT_WIDTH)).toBe(
    "cpu 1% · ram 20G │ 1 wkr 4 sh",
  );
  const live = resourceTokens(0, 253, 7 * GiB, undefined, 0);
  expect(`${live.cpu?.text} · ${live.resources}`).toBe(
    "cpu 253% · ram 7.0G │ 0 wkr",
  );
});

test("memory is one decimal below 10G and a whole number from 10G, never hundredths", () => {
  for (const [value, expected] of [
    [279.4 * 1024 ** 2, "0.3G"],
    [115.8 * 1024 ** 2, "0.1G"],
    [700 * 1024 ** 2, "0.7G"],
    [512 * 1024 ** 2, "0.5G"],
    [1.7 * GiB, "1.7G"],
    [54.9 * GiB, "55G"],
    [1023.9 * 1024 ** 2, "1.0G"],
    [1.04 * GiB, "1.0G"],
  ] as const) {
    const t = resourceTokens(1, 1, value, value, 0, 80);
    expect(t.resources).toBe(`ram ${expected} vram ${expected} │ 1 wkr 0 sh`);
  }
});

test("ram is <0.1G below the floor, one decimal below 10G, a whole number from 10G", () => {
  for (const [bytes, expected] of [
    [0, "<0.1G"],
    [0.05 * GiB, "<0.1G"],
    [0.073 * GiB, "<0.1G"],
    [0.099 * GiB, "<0.1G"],
    // Raw value below the floor, though one decimal would round it to 0.1.
    [0.0995 * GiB, "<0.1G"],
    [0.1 * GiB, "0.1G"],
    [0.31 * GiB, "0.3G"],
    // 0.95 is 0.9499… in binary; it still reads 1.0G.
    [0.95 * GiB, "1.0G"],
    [0.999 * GiB, "1.0G"],
    [2.04 * GiB, "2.0G"],
    [9.94 * GiB, "9.9G"],
    // Rounds to 10.0 at one decimal, so it reads in the whole-number form, never 10.0G.
    [9.96 * GiB, "10G"],
    [10.4 * GiB, "10G"],
    [12.4 * GiB, "12G"],
    [123 * GiB, "123G"],
  ] as const) {
    const t = resourceTokens(1, 1, bytes, undefined, 0, 80);
    expect(t.resources).toBe(`ram ${expected} │ 1 wkr 0 sh`);
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
