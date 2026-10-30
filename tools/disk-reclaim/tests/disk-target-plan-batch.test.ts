import { expect, test } from "bun:test";
import { planTarget } from "../src/disk-target-plan.ts";

test("tmpfs uses the scan's per-item previews without rescanning each candidate", async () => {
  let calls = 0;
  const rows = Array.from({ length: 100 }, (_, i) => ({
    candidate: {
      id: String(i),
      path: `/tmp/${i}`,
      verdict: "RECLAIM",
      reason: "stale",
      checks: [],
      bytes: 1,
      bytes_kind: "estimate",
      action: { kind: "delete", argv: [] },
      result: null,
    },
    fingerprint: String(i),
    preview: { verdict: "safe", reason: "stale" },
  }));
  const result = await planTarget(
    "tmpfs",
    10000,
    new AbortController().signal,
    undefined,
    {
      probe: () => {
        calls++;
        return Promise.resolve({
          out: JSON.stringify(rows),
          err: "",
          exit: 0,
          timedOut: false,
        });
      },
    },
  );
  expect(calls).toBe(1);
  expect(result.items).toHaveLength(100);
  expect(result.items.every((item) => item.verdict === "safe")).toBe(true);
});
