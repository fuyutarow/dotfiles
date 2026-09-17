// bun test for scripts/reclaim-host.ts — the pure swap-classification and probe parsing.
//
// The ssh/interop leg and the OS-lock safety backstop were proven against the real host. What is
// unit-tested is the one decision a live run cannot make deterministically: given several
// swap.vhdx, which is the live one to KEEP and which are orphans to reclaim — the classification
// whose being wrong would (absent the OS lock) delete the swap in use.
import { describe, expect, test } from "bun:test";

import { classifySwaps } from "../reclaim-host";

const swap = (path: string, mtimeMs: number, bytes: number) => ({
  path,
  mtimeMs,
  bytes,
});

describe("classifySwaps — newest is live, the rest are orphans", () => {
  test("no swaps: nothing live, nothing to reclaim", () => {
    expect(classifySwaps([])).toEqual({
      live: null,
      orphans: [],
      reclaimBytes: 0,
    });
  });

  test("one swap is the live one and is never an orphan", () => {
    const only = swap("A", 100, 16 * 1024 ** 3);
    expect(classifySwaps([only])).toEqual({
      live: only,
      orphans: [],
      reclaimBytes: 0,
    });
  });

  test("the newest mtime is kept; every older one is a reclaimable orphan", () => {
    const dead1 = swap("old1", 100, 15 * 1024 ** 3);
    const live = swap("new", 300, 16 * 1024 ** 3);
    const dead2 = swap("old2", 200, 2 * 1024 ** 3);
    const r = classifySwaps([dead1, live, dead2]);
    expect(r.live).toBe(live);
    expect(r.orphans.map((o) => o.path).sort()).toEqual(["old1", "old2"]);
    expect(r.reclaimBytes).toBe(17 * 1024 ** 3);
  });

  test("input order does not matter — classification is by mtime, not position", () => {
    const a = swap("a", 1, 1);
    const b = swap("b", 3, 10);
    const c = swap("c", 2, 100);
    expect(classifySwaps([a, b, c]).live).toBe(b);
    expect(classifySwaps([c, b, a]).live).toBe(b);
    expect(classifySwaps([b, a, c]).live).toBe(b);
  });
});
