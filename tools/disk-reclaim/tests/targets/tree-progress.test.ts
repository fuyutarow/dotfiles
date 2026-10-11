import { expect, test } from "bun:test";
import { lstatSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { treeBytes } from "../../src/targets/tree.ts";
import { tempRoot } from "../fixtures/temp.ts";

test("synchronous sizing delivers intermediate counters and preserves allocated bytes", () => {
  const root = tempRoot("reclaim-tree-progress-");
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    rmSync(root, { recursive: true, force: true });
  });
  let expected = 0;
  for (let index = 0; index < 300; index++) {
    const path = join(root, String(index));
    writeFileSync(path, "allocated file");
    expected += lstatSync(path).blocks * 512;
  }
  expected += lstatSync(root).blocks * 512;
  const updates: { entries: number; bytes: number }[] = [];
  const result = treeBytes(root, (entries, bytes) => {
    updates.push({ entries, bytes });
  });
  expect(result).toBe(expected);
  expect(updates.map((update) => update.entries)).toEqual([128, 256, 301]);
  expect(updates[0]?.bytes).toBeLessThan(result);
  expect(updates.at(-1)?.bytes).toBe(result);
});
