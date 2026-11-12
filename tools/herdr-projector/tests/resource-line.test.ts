import { expect, test } from "bun:test";
import {
  claudeFooterShells,
  cpuTokenArgs,
  HERDR_MAX_METADATA_TOKENS,
  resourceTokenArgs,
  resourceTokens,
  row3VisibleText,
  ROW3_FIT_WIDTH,
  type ResourceTokens,
} from "../src/herdr-projector.ts";

const GiB = 1024 ** 3;
const CPU_NAMES = ["cpu_idle", "cpu_lo", "cpu_mid", "cpu_hi"];

/** The ram, workers and shells tokens as the sidebar draws them (herdr's " · " between each). */
const ramAndCounts = (t: ResourceTokens) =>
  [t.ram, t.workers?.text, t.shells?.text]
    .filter((text) => text !== undefined)
    .join(" · ");

test("P1: cpu boundary table — exactly one of idle / lo / mid / hi is reported, the other three cleared", () => {
  const table = [
    [0, "cpu_idle"],
    [9, "cpu_idle"],
    // Judged on the rounded value: 9.4 rounds to 9, 9.5 to 10.
    [9.4, "cpu_idle"],
    [9.5, "cpu_lo"],
    [10, "cpu_lo"],
    [69, "cpu_lo"],
    [70, "cpu_mid"],
    [89, "cpu_mid"],
    [90, "cpu_hi"],
    [252, "cpu_hi"],
  ] as const;
  for (const [cpu, token] of table) {
    const tokens = resourceTokens(0, cpu, GiB, undefined, 0, 80);
    expect(tokens.cpu?.token).toBe(token);
    const args = cpuTokenArgs(tokens.cpu);
    const reported = args.flatMap((arg, i) =>
      args[i - 1] === "--token" ? [arg.split("=")[0]] : [],
    );
    const cleared = args.flatMap((arg, i) =>
      args[i - 1] === "--clear-token" ? [arg] : [],
    );
    expect(reported).toEqual([token]);
    expect(new Set(cleared)).toEqual(
      new Set(CPU_NAMES.filter((name) => name !== token)),
    );
    expect(cleared).toHaveLength(3);
  }
});

test("a pane moving idle -> lo -> idle never leaves a stale cpu token", () => {
  // Each report is applied to herdr as a state: reported tokens are set, cleared tokens removed.
  const state = new Map<string, string>();
  const apply = (cpu: number) => {
    const args = cpuTokenArgs(resourceTokens(0, cpu, GiB, undefined, 0).cpu);
    for (let i = 0; i < args.length; i += 2) {
      const value = args[i + 1] ?? "";
      if (args[i] === "--token") {
        const [name, text] = value.split("=");
        state.set(name ?? "", text ?? "");
      } else state.delete(value);
    }
    return [...state.keys()];
  };
  expect(apply(3)).toEqual(["cpu_idle"]);
  expect(apply(45)).toEqual(["cpu_lo"]);
  expect(apply(3)).toEqual(["cpu_idle"]);
  expect(apply(95)).toEqual(["cpu_hi"]);
  expect(apply(0)).toEqual(["cpu_idle"]);
});

test("the cpu report never exceeds herdr's metadata token limit", () => {
  for (const cpu of [0, 45, 75, 99]) {
    const entries = resourceTokenArgs(
      resourceTokens(3, cpu, 8.5 * GiB, 12 * GiB, 2),
    ).filter((arg) => arg === "--token" || arg === "--clear-token").length;
    // 4 cpu + ram + 2 workers + 2 shells entries, well within one chunk.
    expect(entries).toBe(9);
    expect(entries).toBeLessThanOrEqual(HERDR_MAX_METADATA_TOKENS);
  }
});

test("cpu is its own token chosen by the idle band and the shared usage level; ram, workers and shells are their own tokens", () => {
  for (const [cpu, token] of [
    [1, "cpu_idle"],
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
    expect(tokens.ram).toBe("ram 8.5G");
    expect(tokens.workers).toEqual({ token: "workers_on", text: "3 wkr" });
    expect(tokens.shells).toEqual({ token: "shells_on", text: "2 sh" });
    expect(ramAndCounts(tokens)).toBe("ram 8.5G · 3 wkr · 2 sh");
  }
});

test("P1: the five (wkr, sh) cases report separate tokens with no bar, cyan only for counts >= 1", () => {
  const cases = [
    [0, 0, "0 wkr", "workers_off", "0 sh", "shells_off"],
    [1, 0, "1 wkr", "workers_on", "0 sh", "shells_off"],
    [0, 1, "0 wkr", "workers_off", "1 sh", "shells_on"],
    [3, 2, "3 wkr", "workers_on", "2 sh", "shells_on"],
    [undefined, undefined, "? wkr", "workers_off", "? sh", "shells_off"],
  ] as const;
  for (const [wkr, sh, wText, wToken, sText, sToken] of cases) {
    const t = resourceTokens(wkr, 1, 0.3 * GiB, undefined, sh, 80);
    expect(t.ram).toBe("ram 0.3G");
    expect(t.workers).toEqual({ token: wToken, text: wText });
    expect(t.shells).toEqual({ token: sToken, text: sText });
    expect(row3VisibleText(t)).toBe(`cpu 1% · ram 0.3G · ${wText} · ${sText}`);
    // Exactly one token of each pair is reported, the other cleared.
    const args = resourceTokenArgs(t);
    expect(args).toContain(`${wToken}=${wText}`);
    expect(args).toContain(`${sToken}=${sText}`);
    const otherW = wToken === "workers_on" ? "workers_off" : "workers_on";
    const otherS = sToken === "shells_on" ? "shells_off" : "shells_on";
    for (const other of [otherW, otherS]) {
      const at = args.indexOf(other);
      expect(args[at - 1]).toBe("--clear-token");
    }
  }
});

test("the ram, workers and shells tokens and their clears are reported as plain text", () => {
  const t = resourceTokens(3, 41, 8.5 * GiB, undefined, 0, 80);
  expect(resourceTokenArgs(t)).toEqual([
    "--clear-token",
    "cpu_idle",
    "--token",
    "cpu_lo=cpu 41%",
    "--clear-token",
    "cpu_mid",
    "--clear-token",
    "cpu_hi",
    "--token",
    "ram=ram 8.5G",
    "--token",
    "workers_on=3 wkr",
    "--clear-token",
    "workers_off",
    "--clear-token",
    "shells_on",
    "--token",
    "shells_off=0 sh",
  ]);
  // A part dropped for width is cleared, not left reporting an old value.
  expect(
    resourceTokenArgs(resourceTokens(3, 41, 8.5 * GiB, undefined, 0, 20)),
  ).toEqual([
    "--clear-token",
    "cpu_idle",
    "--token",
    "cpu_lo=cpu 41%",
    "--clear-token",
    "cpu_mid",
    "--clear-token",
    "cpu_hi",
    "--token",
    "ram=ram 8.5G",
    "--clear-token",
    "workers_on",
    "--clear-token",
    "workers_off",
    "--clear-token",
    "shells_on",
    "--clear-token",
    "shells_off",
  ]);
  expect(resourceTokenArgs(t).some((arg) => /\p{Cc}/u.test(arg))).toBe(false);
});

test("exactly one cpu token is reported, the other three cleared, all plain text", () => {
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
    expect(cleared).toHaveLength(3);
    expect(reported[0]).toMatch(/^cpu_(idle|lo|mid|hi)=cpu \d+%$/u);
    expect(new Set([...cleared, reported[0]?.split("=")[0]])).toEqual(
      new Set(CPU_NAMES),
    );
    expect(args.some((arg) => /\p{Cc}/u.test(arg))).toBe(false);
  }
  expect(
    cpuTokenArgs(resourceTokens(3, 99, undefined, undefined, 2).cpu),
  ).toEqual([
    "--clear-token",
    "cpu_idle",
    "--clear-token",
    "cpu_lo",
    "--clear-token",
    "cpu_mid",
    "--token",
    "cpu_hi=cpu 99%",
  ]);
});

test("unknown cpu reports no cpu token and keeps 'cpu ?' first in the ram token", () => {
  const unknown = resourceTokens(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  );
  expect(unknown).toEqual({
    ram: "cpu ?",
    workers: { token: "workers_off", text: "? wkr" },
    shells: { token: "shells_off", text: "? sh" },
  });
  expect(ramAndCounts(unknown)).toBe("cpu ? · ? wkr · ? sh");
  expect(
    cpuTokenArgs(
      resourceTokens(undefined, undefined, undefined, undefined, undefined).cpu,
    ),
  ).toEqual([
    "--clear-token",
    "cpu_idle",
    "--clear-token",
    "cpu_lo",
    "--clear-token",
    "cpu_mid",
    "--clear-token",
    "cpu_hi",
  ]);
});

/** Row 3 as the sidebar draws it, herdr's " · " between every pair of tokens. */
const sidebarRow3 = (
  cpu: number,
  ram: number,
  workers: number | undefined,
  shells: number | undefined,
  vram: number | undefined,
  width: number,
) => row3VisibleText(resourceTokens(workers, cpu, ram, vram, shells, width));

test("the width decides whether the shells token fits", () => {
  const full = "cpu 1% · ram 20G · 1 wkr · 4 sh";
  expect(full.length).toBe(31);
  expect(sidebarRow3(1, 20 * GiB, 1, 4, undefined, 24)).toBe(
    "cpu 1% · ram 20G · 1 wkr",
  );
  expect(sidebarRow3(1, 20 * GiB, 1, 4, undefined, 30)).toBe(
    "cpu 1% · ram 20G · 1 wkr",
  );
  expect(sidebarRow3(1, 20 * GiB, 1, 4, undefined, 31)).toBe(full);
  // 0.18G reads 0.2G; unknown counts keep their `? wkr` / `? sh` text.
  expect(sidebarRow3(0, 0.18 * GiB, undefined, undefined, undefined, 31)).toBe(
    "cpu 0% · ram 0.2G · ? wkr",
  );
  expect(sidebarRow3(0, 0.18 * GiB, undefined, undefined, undefined, 32)).toBe(
    "cpu 0% · ram 0.2G · ? wkr · ? sh",
  );
});

test("unknown workers and shells (Codex) read '? wkr' and '? sh'; vram optional", () => {
  const codex = resourceTokens(
    undefined,
    1,
    20 * GiB,
    undefined,
    undefined,
    80,
  );
  expect(ramAndCounts(codex)).toBe("ram 20G · ? wkr · ? sh");
  expect(codex.workers?.token).toBe("workers_off");
  expect(codex.shells?.token).toBe("shells_off");
  expect(ramAndCounts(resourceTokens(1, 1, 20 * GiB, 12 * GiB, 4, 80))).toBe(
    "ram 20G vram 12G · 1 wkr · 4 sh",
  );
});

test("vram sits with the memory part and drops first; a zero vram reading is not reported", () => {
  const text = (width: number, vram = 12 * GiB) =>
    ramAndCounts(resourceTokens(1, 1, 20 * GiB, vram, 4, width));
  const full = "cpu 1% · ram 20G vram 12G · 1 wkr · 4 sh";
  expect(full.length).toBe(40);
  expect(text(full.length)).toBe("ram 20G vram 12G · 1 wkr · 4 sh");
  expect(text(full.length - 1)).toBe("ram 20G · 1 wkr · 4 sh");
  expect(text(24)).toBe("ram 20G · 1 wkr");
  expect(text(80, 0)).toBe("ram 20G · 1 wkr · 4 sh");
});

test("fit rule: whole parts only, never a cut mid-token, cpu and ram kept", () => {
  const row3 = (width: number) =>
    row3VisibleText(resourceTokens(3, 41, 8.5 * GiB, 12 * GiB, 2, width));
  expect(row3(60)).toBe("cpu 41% · ram 8.5G vram 12G · 3 wkr · 2 sh");
  expect(row3(33)).toBe("cpu 41% · ram 8.5G · 3 wkr · 2 sh");
  expect(row3(26)).toBe("cpu 41% · ram 8.5G · 3 wkr");
  expect(row3(18)).toBe("cpu 41% · ram 8.5G");
  expect(row3(17)).toBe("cpu 41%");
  const allowed = new Set([
    "cpu 41% · ram 8.5G vram 12G · 3 wkr · 2 sh",
    "cpu 41% · ram 8.5G · 3 wkr · 2 sh",
    "cpu 41% · ram 8.5G · 3 wkr",
    "cpu 41% · ram 8.5G",
    "cpu 41%",
  ]);
  for (let width = 0; width <= 80; width++) {
    const text = row3(width);
    expect(allowed.has(text)).toBe(true);
    // Whatever is drawn fits, unless not even cpu does.
    expect(text.length <= width || text === "cpu 41%").toBe(true);
  }
});

test("no bar anywhere: no token or visible row contains │ at any width", () => {
  for (let width = 0; width <= 80; width++) {
    const t = resourceTokens(3, 41, 8.5 * GiB, 12 * GiB, 2, width);
    expect(row3VisibleText(t).includes("│")).toBe(false);
    expect(resourceTokenArgs(t).some((arg) => arg.includes("│"))).toBe(false);
  }
});

test("drop order across the split tokens at every width: vram, then sh, then wkr; ram and cpu stay", () => {
  // Counts only ever lose their tail: sh before wkr, and a kept sh implies a kept wkr.
  let previous = 0;
  for (let width = 0; width <= 80; width++) {
    const t = resourceTokens(3, 41, 8.5 * GiB, 12 * GiB, 2, width);
    if (t.shells !== undefined) expect(t.workers).toBeDefined();
    if (t.workers !== undefined) expect(t.ram).toBeDefined();
    const kept = [t.cpu, t.ram, t.workers, t.shells].filter(
      (token) => token !== undefined,
    ).length;
    // More width never keeps fewer tokens, and vram only appears once every count is kept.
    expect(kept).toBeGreaterThanOrEqual(previous);
    previous = kept;
    if (t.ram?.includes("vram") === true) expect(t.shells).toBeDefined();
  }
});

test("default width is the 44 text columns of the 48-column sidebar: a 0.52G row reads 0.5G and keeps sh", () => {
  // 48 sidebar columns - 1 divider - 3 row indent (herdr v0.9.5; see ROW3_FIT_WIDTH).
  expect(ROW3_FIT_WIDTH).toBe(48 - 1 - 3);
  const t = resourceTokens(1, 41, 0.52 * GiB, undefined, 2);
  expect(row3VisibleText(t)).toBe("cpu 41% · ram 0.5G · 1 wkr · 2 sh");
});

test("herdr's separators cost columns: cpu 253% loses sh at 33 and keeps it from 34, within the default width", () => {
  const full = "cpu 253% · ram 7.0G · 0 wkr · 0 sh";
  expect(full.length).toBe(34);
  expect(sidebarRow3(253, 7 * GiB, 0, 0, undefined, 33)).toBe(
    "cpu 253% · ram 7.0G · 0 wkr",
  );
  expect(sidebarRow3(253, 7 * GiB, 0, 0, undefined, 34)).toBe(full);
  expect(sidebarRow3(253, 7 * GiB, 0, 0, undefined, ROW3_FIT_WIDTH)).toBe(full);
  expect(sidebarRow3(1, 20 * GiB, 1, 4, undefined, ROW3_FIT_WIDTH)).toBe(
    "cpu 1% · ram 20G · 1 wkr · 4 sh",
  );
  expect(row3VisibleText(resourceTokens(0, 253, 7 * GiB, undefined, 0))).toBe(
    full,
  );
});

test("at the default width vram is shown beside cpu 1% and 20G, and is the first part dropped when a wider row no longer fits", () => {
  // vram shows at the default width: the 40-column row fits within 44.
  const full = "cpu 1% · ram 20G vram 12G · 1 wkr · 4 sh";
  expect(full.length).toBe(40);
  expect(sidebarRow3(1, 20 * GiB, 1, 4, 12 * GiB, full.length)).toBe(full);
  expect(sidebarRow3(1, 20 * GiB, 1, 4, 12 * GiB, ROW3_FIT_WIDTH)).toBe(full);
  expect(sidebarRow3(1, 20 * GiB, 1, 4, 12 * GiB, full.length - 1)).toBe(
    "cpu 1% · ram 20G · 1 wkr · 4 sh",
  );
  // vram drops at the default width once the row is wider than 44 columns; sh and wkr stay.
  const wide = "cpu 100% · ram 123G vram 123G · 12 wkr · 12 sh";
  expect(wide.length).toBe(46);
  expect(sidebarRow3(100, 123 * GiB, 12, 12, 123 * GiB, ROW3_FIT_WIDTH)).toBe(
    "cpu 100% · ram 123G · 12 wkr · 12 sh",
  );
  expect(sidebarRow3(100, 123 * GiB, 12, 12, 123 * GiB, wide.length)).toBe(
    wide,
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
    expect(ramAndCounts(t)).toBe(
      `ram ${expected} vram ${expected} · 1 wkr · 0 sh`,
    );
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
    expect(ramAndCounts(t)).toBe(`ram ${expected} · 1 wkr · 0 sh`);
  }
});

const FOOTER_RULE = "────────────────";
/** A Claude pane's visible tail ending in the given mode row. */
const claudeTail = (modeRow: string) =>
  `${FOOTER_RULE}\n❯\n${FOOTER_RULE}\n  Job: idle\n  ${modeRow}\n`;

test("a Claude footer's `N shell(s)` pill is the session's background shell count; no shell pill is 0", () => {
  // The live soks pane footer: the singular pill, then a pill that is not a shell count.
  expect(
    claudeFooterShells(
      claudeTail("⏵⏵ auto mode on · 1 shell · 1 feedback draft"),
    ),
  ).toBe(1);
  expect(claudeFooterShells(claudeTail("⏵⏵ auto mode on · 1 shell"))).toBe(1);
  expect(claudeFooterShells(claudeTail("⏵⏵ auto mode on · 1 shells"))).toBe(1);
  expect(claudeFooterShells(claudeTail("⏵⏵ auto mode on · 12 shells"))).toBe(
    12,
  );
  expect(
    claudeFooterShells(
      claudeTail("⏵⏵ auto mode on · 1 feedback draft · 2 shells · 3 monitors"),
    ),
  ).toBe(2);
  expect(
    claudeFooterShells(claudeTail("⏵⏵ auto mode on · 1 feedback draft")),
  ).toBe(0);
  expect(claudeFooterShells(claudeTail("⏵⏵ auto mode on"))).toBe(0);
  expect(
    claudeFooterShells(claudeTail("⏵⏵ auto mode on (shift+tab to cycle)")),
  ).toBe(0);
  expect(
    claudeFooterShells(
      claudeTail("⏵⏵ auto mode on (shift+tab to cycle) · 1 shell"),
    ),
  ).toBe(1);
});

test("an unreadable or unrecognised Claude footer has no shell count", () => {
  for (const text of [
    "",
    "plain shell prompt $ ",
    // Two shell pills are ambiguous; a guessed number is never shown.
    claudeTail("⏵⏵ auto mode on · 1 shell · 2 shells"),
    // A pill list that is not ` · `-joined is not the footer.
    claudeTail("⏵⏵ auto mode on, 1 shell"),
    claudeTail("⏵⏵ auto mode on ·"),
    // Only the auto-mode label is recognised.
    claudeTail("⏵⏵ accept edits on · 1 shell"),
    claudeTail("? for shortcuts"),
    // The mode row is not the last row, so it is not the footer.
    `⏵⏵ auto mode on · 1 shells\n  Job: idle\n`,
    // Terminal control sequences are never part of a clean visible read.
    claudeTail("\u001B[1m⏵⏵ auto mode on · 1 shells"),
  ])
    expect(claudeFooterShells(text)).toBeUndefined();
});
