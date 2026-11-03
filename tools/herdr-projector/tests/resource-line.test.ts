import { expect, test } from "bun:test";
import { resourceLine } from "../src/herdr-projector.ts";

test("resource row fits wide and narrow sidebars in priority order", () => {
  const ram = 6.3 * 1024 ** 3;
  expect(resourceLine(7, 74, ram, 512 * 1024 ** 2, 60)).toBe(
    "workers 7 · cpu 74% · ram 6.3G · vram 0.50G",
  );
  expect(resourceLine(7, 74, ram, undefined, 28)).toBe(
    "workers 7 cpu 74% ram 6.3G",
  );
  expect(resourceLine(7, 74, ram, 512 * 1024 ** 2, 22)).toBe(
    "workers 7 cpu 74% ram ",
  );
  expect(resourceLine(undefined, undefined, undefined, undefined)).toBe(
    "workers ? · cpu ?",
  );
});

test("memory uses two significant figures in wide and compact rows", () => {
  for (const [value, expected] of [
    [279.4 * 1024 ** 2, "0.27G"],
    [115.8 * 1024 ** 2, "0.11G"],
    [700 * 1024 ** 2, "0.68G"],
    [512 * 1024 ** 2, "0.50G"],
    [1.7 * 1024 ** 3, "1.7G"],
    [54.9 * 1024 ** 3, "55G"],
    [1023.9 * 1024 ** 2, "1.0G"],
    [1.04 * 1024 ** 3, "1.0G"],
  ] as const) {
    expect(resourceLine(1, 1, value, value, 80)).toBe(
      `workers 1 · cpu 1% · ram ${expected} · vram ${expected}`,
    );
    expect(resourceLine(1, 1, value, value, 37)).toBe(
      `workers 1 cpu 1% ram ${expected} vram ${expected}`,
    );
  }
});
