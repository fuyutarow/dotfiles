import { expect, test } from "bun:test";
import { resourceLine } from "../src/herdr-projector.ts";

test("resource row fits wide and narrow sidebars in priority order", () => {
  const ram = 6.3 * 1024 ** 3;
  expect(resourceLine(7, 74, ram, 512 * 1024 ** 2, 60)).toBe(
    "workers 7 · cpu 74% · ram 6.3G · vram 512M",
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
