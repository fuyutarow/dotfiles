import { afterAll, describe, expect, test } from "bun:test";
import { readdirSync, statfsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  diskReadings,
  diskReadingsAsync,
  diskSegment,
  type DiskReading,
} from "../src/storage.ts";
import { DiskRateStateSchema, updateDiskRates } from "../src/disk-rate.ts";
import { readJson } from "../src/bounded.ts";
import { ESC } from "../src/ansi.ts";
import { cleanupTempDirs, tempDir } from "./helpers.ts";

const GiB = 1024 ** 3;
const disk = (freeG: number): DiskReading => ({
  kind: "reading",
  path: "/mnt/c",
  label: "Disk C:",
  usedG: 930 - freeG,
  totalG: 930,
  freeG,
  col: "38;5;167",
  rateRedMinutes: 30,
  rateYellowMinutes: 120,
});
const plain = (text: string) =>
  text.replaceAll(new RegExp(`${ESC}\\[[0-9;]*m`, "gu"), "");
function rateAfter(freeG: number, seconds = 60): DiskReading {
  const first = updateDiskRates([disk(14.6)], undefined, 0);
  const second = updateDiskRates([disk(freeG)], first.state, seconds * 1000);
  const reading = second.entries[0];
  if (reading?.kind === "reading") return reading;
  return expect.unreachable("missing disk reading");
}

describe("disk rate", () => {
  test("two persisted samples 60s apart produce GiB/min and the requested format", () => {
    const reading = rateAfter(11.5);
    expect(reading.rateGibPerMin).toBeCloseTo(3.1);
    expect(plain(diskSegment(reading))).toBe(
      "Disk C: 99% 11.5GiB free ↓3.1GiB/min",
    );
    expect(diskSegment(reading)).toContain("\u001B[2m11.5GiB free");
  });
  test("under 30s has no rate; the exact 30s boundary does", () => {
    expect(rateAfter(11.5, 29).rateGibPerMin).toBeUndefined();
    expect(plain(diskSegment(rateAfter(11.5, 29)))).toBe(
      "Disk C: 99% 11.5GiB free",
    );
    expect(rateAfter(11.5, 30).rateGibPerMin).toBeCloseTo(6.2);
  });
  test("freeing uses ↑ and never a time-to-full colour", () => {
    const reading = rateAfter(17.7);
    expect(reading.rateGibPerMin).toBeCloseTo(-3.1);
    expect(diskSegment(reading)).toEndWith(
      "\u001B[2m17.7GiB free ↑3.1GiB/min\u001B[0m",
    );
  });
  test("rates below the display floor stay hidden", () => {
    expect(
      plain(diskSegment({ ...disk(11.5), rateGibPerMin: 0.049 })),
    ).not.toContain("↓");
    expect(
      plain(diskSegment({ ...disk(11.5), rateGibPerMin: -0.049 })),
    ).not.toContain("↑");
    expect(
      plain(diskSegment({ ...disk(11.5), rateGibPerMin: 0.05 })),
    ).toContain("↓0.050GiB/min");
  });
  test.each([
    [29, "38;5;167"],
    [30, "38;5;178"],
    [119, "38;5;178"],
    [120, undefined],
  ])("time to full %d minutes colours only the rate", (free, colour) => {
    const output = diskSegment({ ...disk(free), rateGibPerMin: 1 });
    const prefix = colour === undefined ? "" : `\u001B[${colour}m`;
    expect(output).toEndWith(`free ${prefix}↓1.0GiB/min\u001B[0m`);
    expect(output).toContain("\u001B[38;5;167m");
  });
  test("colours come from the configured durations", () => {
    const output = diskSegment({
      ...disk(11.5),
      rateGibPerMin: 1,
      rateRedMinutes: 5,
      rateYellowMinutes: 10,
    });
    expect(output).toEndWith("free ↓1.0GiB/min\u001B[0m");
  });
  test("significant figures use decimal GiB notation", () => {
    expect(plain(diskSegment(disk(0.012345)))).toContain("0.0123GiB free");
    expect(plain(diskSegment(disk(100)))).toContain("100GiB free");
    expect(plain(diskSegment({ ...disk(0), rateGibPerMin: 12.345 }))).toContain(
      "0GiB free ↓12GiB/min",
    );
  });
  test("frequent renders retain a baseline, bound history and discard removed drives", () => {
    let result = updateDiskRates([disk(100)], undefined, 0);
    for (let second = 1; second <= 600; second++)
      result = updateDiskRates(
        [disk(100 - second / 60)],
        result.state,
        second * 1000,
      );
    const reading = result.entries[0];
    expect(
      reading?.kind === "reading" ? reading.rateGibPerMin : undefined,
    ).toBeCloseTo(1);
    expect(result.state.drives["/mnt/c"]?.samples.length).toBeLessThanOrEqual(
      61,
    );
    expect(updateDiskRates([], result.state, 601_000).state.drives).toEqual({});
  });
  test("regression smooths a burst instead of using only the latest interval", () => {
    let result = updateDiskRates([disk(100)], undefined, 0);
    result = updateDiskRates([disk(99)], result.state, 60_000);
    result = updateDiskRates([disk(98)], result.state, 120_000);
    result = updateDiskRates([disk(98)], result.state, 180_000);
    const reading = result.entries[0];
    expect(
      reading?.kind === "reading" ? reading.rateGibPerMin : undefined,
    ).toBeCloseTo(0.7);
  });
  test("old samples, backwards clocks and capacity changes restart the window", () => {
    const first = updateDiskRates([disk(100)], undefined, 60_000);
    for (const now of [0, 400_000]) {
      const result = updateDiskRates([disk(90)], first.state, now);
      expect(
        result.entries[0]?.kind === "reading"
          ? result.entries[0].rateGibPerMin
          : 1,
      ).toBeUndefined();
    }
    const result = updateDiskRates(
      [{ ...disk(90), totalG: 1000 }],
      first.state,
      120_000,
    );
    expect(
      result.entries[0]?.kind === "reading"
        ? result.entries[0].rateGibPerMin
        : 1,
    ).toBeUndefined();
  });

  test("missing/corrupt state is silent and repaired atomically by both read paths", async () => {
    const dir = tempDir("disk-rate-");
    const configPath = join(dir, "storage.toml");
    const statePath = join(dir, "disk-rate.json");
    writeFileSync(
      configPath,
      `[drive.test]\npath = ${JSON.stringify(dir)}\nrate_red_minutes = 30\nrate_yellow_minutes = 120\n`,
    );
    for (const corrupt of [
      undefined,
      "not json",
      '{"schema":1,"drives":{"x":42}}',
    ]) {
      if (corrupt !== undefined) writeFileSync(statePath, corrupt);
      for (const read of [diskReadings, diskReadingsAsync]) {
        const result = await read({ configPath, statePath, now: 60_000 });
        expect(result.isOk()).toBe(true);
        const entry = result.unwrapOr([])[0];
        expect(
          entry?.kind === "reading" ? entry.rateGibPerMin : 1,
        ).toBeUndefined();
        expect(
          readJson(statePath, DiskRateStateSchema)?.drives[dir]?.samples,
        ).toHaveLength(1);
        expect(readdirSync(dir).some((name) => name.endsWith(".tmp"))).toBe(
          false,
        );
      }
    }
  });
  test("separate read invocations consume prior free bytes for each drive", async () => {
    const dir = tempDir("disk-rate-persist-");
    const configPath = join(dir, "storage.toml");
    const statePath = join(dir, "disk-rate.json");
    writeFileSync(
      configPath,
      `[drive.test]\npath = ${JSON.stringify(dir)}\nrate_red_minutes = 30\nrate_yellow_minutes = 120\n`,
    );
    const st = statfsSync(dir);
    const freeBytes = st.bavail * st.bsize;
    const totalBytes = (st.blocks - st.bfree + st.bavail) * st.bsize;
    writeFileSync(
      statePath,
      JSON.stringify({
        schema: 1,
        drives: {
          [dir]: {
            totalBytes,
            samples: [{ at: 0, freeBytes: freeBytes + 3.1 * GiB }],
          },
        },
      }),
    );
    const result = await diskReadingsAsync({
      configPath,
      statePath,
      now: 60_000,
    });
    const entry = result.unwrapOr([])[0];
    expect(
      entry?.kind === "reading" ? entry.rateGibPerMin : undefined,
    ).toBeCloseTo(3.1, 1);
  });
});
afterAll(cleanupTempDirs);
