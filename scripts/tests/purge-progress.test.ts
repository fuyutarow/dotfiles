// bun test for scripts/purge-progress.ts — the entry count reclaim:purge's bar is measured against,
// and the bar line itself.
import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { countEntries, newlines, progressLine } from "../purge-progress";

test("countEntries counts files, dirs and symlinks under dir, not dir itself, without following links", () => {
  const root = mkdtempSync(join(tmpdir(), "count-"));
  mkdirSync(join(root, "a", "b"), { recursive: true });
  writeFileSync(join(root, "a", "b", "f"), "x");
  symlinkSync("/", join(root, "loop")); // followed, this would count the whole filesystem
  expect(countEntries(root)).toBe(4);
  expect(countEntries(join(root, "missing"))).toBe(0);
});

test("newlines counts rm -v's one-line-per-entry reports", () => {
  expect(newlines(new TextEncoder().encode("removed 'a'\nremoved 'b'\n"))).toBe(
    2,
  );
});

test("progressLine: fraction, thousands separators, and done capped at total", () => {
  expect(progressLine(50, 200, 12_400)).toBe(
    "[█████░░░░░░░░░░░░░░░]  25%  50/200 件  12s",
  );
  expect(progressLine(1_500_000, 1_000_000, 0)).toContain(
    "100%  1,000,000/1,000,000 件",
  );
  expect(progressLine(0, 0, 0)).toContain("100%  0/0 件");
});
