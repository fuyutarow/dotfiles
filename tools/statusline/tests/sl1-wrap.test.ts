import { describe, expect, test } from "bun:test";
import {
  displayWidth,
  statuslineColumns,
  wrapThroughSys,
} from "../src/wrap.ts";

const ESC = String.fromCodePoint(27);
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, "gu");
const separator = ` ${ESC}[2m·${ESC}[0m `;
const pipe = ` ${ESC}[2m|${ESC}[0m `;

function visible(value: string): string {
  return value.replaceAll(ANSI, "");
}

function contentWithoutSeparators(value: string): string {
  return visible(value).replaceAll(/[\s·|]/gu, "");
}

const sample = [
  `repo ${ESC}[32m/home/fuyu/日本語-project${ESC}[0m${pipe}branch ${ESC}[35mfeature/wrap${ESC}[0m${separator}worktree ${ESC}[33mws: sl1-test${ESC}[0m`,
  `Claude${pipe}session ${ESC}[36magent-123456789${ESC}[0m${separator}model Opus${separator}ctx 328.9k 33%${separator}email fuyutarow@example.test`,
  `Rate: claude 5h 7% reset 16:20${separator}7d 75% reset 10-29${separator}codex 7d 36%`,
  `Sys: CPU 100%${separator}RAM 35% (19.3/54.9G)${separator}VRAM 23% (2.7/12.0G)${separator}GPU≈1%/15m n=7${separator}tmpfs 34G free`,
  "Job: scan n/a (ps timeout 2000ms)",
  "warning: unchanged after Sys",
].join("\n");

describe("SL1 wrap through Sys", () => {
  test.each([80, 120, 160])("wraps segments within %i columns", (columns) => {
    const wrapped = wrapThroughSys(sample, columns);
    const originalLines = sample.split("\n");
    const wrappedLines = wrapped.split("\n");
    const sysIndex = originalLines.findIndex((line) => line.startsWith("Sys:"));
    const physicalThroughSys = wrappedLines.slice(
      0,
      wrappedLines.length - (originalLines.length - sysIndex - 1),
    );

    expect(
      physicalThroughSys.every((line) => displayWidth(line) <= columns),
    ).toBe(true);
    expect(physicalThroughSys.join(" ")).not.toContain("…");
    expect(contentWithoutSeparators(physicalThroughSys.join(" "))).toBe(
      contentWithoutSeparators(originalLines.slice(0, sysIndex + 1).join(" ")),
    );
    expect(wrappedLines.slice(-2)).toEqual(originalLines.slice(-2));
    expect(visible(physicalThroughSys.join("\n"))).not.toContain(ESC);
  });

  test("counts ANSI as zero and East Asian and emoji graphemes as two columns", () => {
    expect(displayWidth(`${ESC}[31mA日本🙂é${ESC}[0m`)).toBe(1 + 4 + 2 + 1);
  });

  test("uses only a positive integer COLUMNS value", () => {
    expect(statuslineColumns({ COLUMNS: "120" })).toBe(120);
    expect(statuslineColumns({ COLUMNS: "0" })).toBeUndefined();
    expect(statuslineColumns({ COLUMNS: "120.5" })).toBeUndefined();
    expect(statuslineColumns({})).toBeUndefined();
  });
});
