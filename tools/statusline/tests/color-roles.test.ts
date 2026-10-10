import { expect, test } from "bun:test";
import { err, ok } from "neverthrow";
import { rateRow } from "../src/rate-limits.ts";
import { memSegment, sysSegment } from "../src/host-load.ts";
import { diskSegment, type DiskReading } from "../src/storage.ts";
import { diskFreeColor, paceColor } from "../src/ansi.ts";

const reset = "\u001B[0m";
const dim = "\u001B[2m";
const green = "\u001B[38;5;71m";
const amber = "\u001B[38;5;178m";
const red = "\u001B[38;5;167m";
const disk: DiskReading = {
  kind: "reading",
  label: "Disk /",
  usedG: 337,
  freeG: 123,
  totalG: 460,
};

test.each([
  [0, "$0", green],
  [0.0004, "<$0.01", green],
  [0.12, "$0.12", green],
  [0.999, "$1.00", green],
  [1, "$1.00", amber],
  [4.99, "$4.99", amber],
  [5, "$5.00", red],
  [6, "$6.00", red],
])("Rate roles for seven-day Jev spend %s", (costUsd, text, color) => {
  const now = Math.floor(Temporal.Now.instant().epochMilliseconds / 1000);
  const row = rateRow(
    {
      rl5: 5,
      rl7: 70,
      rl7Reset: now + 100,
      rlModel: [{ name: "Fable", pct: 90, resetEpoch: undefined }],
      codexRate: {
        windows: [{ minutes: 10080, percent: 5, reset: now + 100 }],
        mtimeMs: now * 1000,
      },
      jevUsage: { costUsd },
    },
    now,
  );
  expect(row).toContain(
    `claude 5h ${green} 5%${reset} ${dim}·${reset} 7d ${green}70%${reset} ${dim}⟳`,
  );
  expect(row).toContain(`Fable ${red}90%${reset}`);
  expect(row).toContain(
    ` ${dim}|${reset} codex 7d ${green} 5%${reset} ${dim}⟳`,
  );
  expect(row).toEndWith(
    ` ${dim}|${reset} Jev 7d ${dim}spend${reset} ${color}${text}${reset}`,
  );
});

test("rate colors follow used-to-elapsed pace for the screenshot values", () => {
  const now = 1_790_000_000;
  const row = rateRow(
    {
      rl5: 21,
      rl5Reset: now + 1_980,
      rl7: 78,
      rl7Reset: now + 260_064,
      rlModel: [],
      codexRate: {
        windows: [{ minutes: 10_080, percent: 24, reset: now + 562_464 }],
        mtimeMs: Temporal.Now.instant().epochMilliseconds,
      },
    },
    now,
  );
  expect(row).toContain(`5h ${green}21%${reset}`);
  expect(row).toContain(`7d ${amber}78%${reset}`);
  expect(row).toContain(`codex 7d ${red}24%${reset}`);
});

test.each([
  [50, 50, green],
  [75, 50, amber],
  [75.01, 50, red],
  [20, 1.99, green],
  [75, 1.99, amber],
  [90, 0, red],
  [70, undefined, amber],
])("pace color for used %s and elapsed %s", (used, elapsed, color) => {
  expect(paceColor(used, elapsed)).toBe(color.slice(2, -1));
});

test.each([
  [9.99, red],
  [10, amber],
  [19.99, amber],
  [20, green],
  [undefined, green],
])("disk free percent %s uses a percentage color", (freePercent, color) => {
  expect(diskFreeColor(freePercent)).toBe(color.slice(2, -1));
});

test("screenshot disk values color free space by share", () => {
  expect(
    diskSegment({ ...disk, label: "Disk C:", freeG: 43.8, totalG: 930 }),
  ).toContain(`Disk C: ${red}43.8GiB${reset}`);
  expect(
    diskSegment({ ...disk, label: "Disk WSL", freeG: 660.3, totalG: 930 }),
  ).toContain(`Disk WSL ${green}660GiB${reset}`);
});

test("Rate missing values keep plain names/windows, amber n/a and dim reasons", () => {
  const row = rateRow({
    rlModel: [],
    codexRateWhy: "timeout",
    jevUsageWhy: "unreadable",
  });
  expect(row).toContain(
    `claude ${amber}n/a${reset} ${dim}·${reset} 5h ${amber}n/a${reset} ${dim}·${reset} 7d ${amber}n/a${reset}`,
  );
  expect(row).toContain(`codex ${amber}n/a${reset} ${dim}(timeout)${reset}`);
  expect(row).toEndWith(`Jev ${amber}n/a${reset} ${dim}(unreadable)${reset}`);
});

test.each([
  [5, green],
  [70, amber],
  [90, red],
])("Sys percent %s keeps names plain and details dim", (pct, color) => {
  const text = String(pct).padStart(2);
  const row = sysSegment(
    ok(pct),
    ok({ pct, frac: "13.1/16.0G" }),
    ok({ pct, frac: "3.5/12.0G" }),
    ok([disk]),
  );
  expect(row).toBe(
    `CPU ${color}${text}%${reset} ${dim}·${reset} RAM ${color}${text}%${reset} ${dim}(13.1/16.0G)${reset} ${dim}·${reset} VRAM ${color}${text}%${reset} ${dim}(3.5/12.0G)${reset} ${dim}·${reset} Disk / ${green}123GiB${reset}${dim}/460GiB (27%) free${reset}`,
  );
});

test("Sys n/a values and reasons share the Rate roles", () => {
  const row = sysSegment(
    err("cpu"),
    err("ram"),
    err("gpu"),
    ok([{ kind: "miss", label: "Disk /", why: "disk" }]),
  );
  for (const [label, why] of [
    ["CPU", "cpu"],
    ["RAM", "ram"],
    ["VRAM", "gpu"],
    ["Disk /", "disk"],
  ])
    expect(row).toContain(
      `${label} ${amber}n/a${reset} ${dim}(${why})${reset}`,
    );
  expect(
    sysSegment(err("cpu"), err("ram"), undefined, err("storage")),
  ).toEndWith(`Disk ${amber}n/a${reset} ${dim}(storage)${reset}`);
  expect(diskSegment({ ...disk, freeG: undefined })).toBe(
    `Disk / ${amber}n/a${reset}`,
  );
});

test.each([0.01, 1, -1])(
  "Disk rate %s stays entirely secondary even past warning durations",
  (rateGibPerMin) => {
    let suffix = "";
    if (Math.abs(rateGibPerMin) >= 0.05)
      suffix = ` ${rateGibPerMin > 0 ? "↓" : "↑"}1.0GiB/min`;
    expect(
      diskSegment({
        ...disk,
        rateGibPerMin,
        rateRedMinutes: 200,
        rateYellowMinutes: 500,
      }),
    ).toBe(
      `Disk / ${green}123GiB${reset}${dim}/460GiB (27%) free${suffix}${reset}`,
    );
    expect(diskSegment({ ...disk, totalG: undefined, rateGibPerMin })).toBe(
      `Disk / ${green}123GiB${reset}${dim} free${suffix}${reset}`,
    );
  },
);

test("GPU average, sample count and stale detail are all secondary", () => {
  expect(
    memSegment("VRAM", {
      pct: 5,
      frac: "3.5/12.0G",
      gpuAvg15: 80,
      gpuSamples15: 10,
      stale: { secs: 90, why: "timeout" },
    }),
  ).toBe(
    `VRAM ${green} 5%${reset} ${dim}(3.5/12.0G)${reset} ${dim}GPU≈80%/15m n=10${reset} ${dim}stale 90s (timeout)${reset}`,
  );
});
