import { expect, test } from "bun:test";
import {
  classifySwaps,
  createHostTarget,
  parseProbe,
} from "../../src/targets/host.ts";

test("host plan matches dry-run swap selection and runner is injected", async () => {
  const data = parseProbe(
    "swap=100|10|C:\\Temp\\old\\swap.vhdx\nswap=300|20|C:\\Temp\\live\\swap.vhdx\nwinget_cache=0\n",
  );
  expect(classifySwaps(data.swaps).orphans.map((x) => x.path)).toEqual([
    "C:\\Temp\\old\\swap.vhdx",
  ]);
  let calls = 0;
  const target = createHostTarget({
    snapshot: () => Promise.resolve(data),
    runner: () => {
      calls++;
      return Promise.resolve({ code: 0, out: "", timedOut: false });
    },
  });
  const plan = await target.plan({
    mode: "plan",
    explicit: false,
    config: {
      repo_roots: [],
      repos: [],
      scratch_roots: [],
      delete_roots: [],
      regenerable_ignored: [],
      session_grace_hours: 24,
      ignore_unreadable_procs: ["sshd"],
    },
    log: () => {},
  });
  expect(plan.map((c) => c.id)).toEqual(["C:\\Temp\\old\\swap.vhdx"]);
  expect(calls).toBe(0);
});

test("host classifies no swaps without a live or reclaimable path", () => {
  expect(classifySwaps([])).toEqual({
    live: null,
    orphans: [],
    reclaimBytes: 0,
  });
});

test("host keeps its only swap and never marks it orphaned", () => {
  const only = { path: "A", mtimeMs: 100, bytes: 16 * 1024 ** 3 };
  expect(classifySwaps([only])).toEqual({
    live: only,
    orphans: [],
    reclaimBytes: 0,
  });
});

test("host keeps newest swap and reports every older swap's reclaimable bytes", () => {
  const dead1 = { path: "old1", mtimeMs: 100, bytes: 15 * 1024 ** 3 };
  const live = { path: "new", mtimeMs: 300, bytes: 16 * 1024 ** 3 };
  const dead2 = { path: "old2", mtimeMs: 200, bytes: 2 * 1024 ** 3 };
  const result = classifySwaps([dead1, live, dead2]);
  expect(result.live).toBe(live);
  expect(result.orphans.map((item) => item.path).toSorted()).toEqual([
    "old1",
    "old2",
  ]);
  expect(result.reclaimBytes).toBe(17 * 1024 ** 3);
});

test("host swap classification depends on mtime rather than input order", () => {
  const a = { path: "a", mtimeMs: 1, bytes: 1 };
  const b = { path: "b", mtimeMs: 3, bytes: 10 };
  const c = { path: "c", mtimeMs: 2, bytes: 100 };
  expect(classifySwaps([a, b, c]).live).toBe(b);
  expect(classifySwaps([c, b, a]).live).toBe(b);
  expect(classifySwaps([b, a, c]).live).toBe(b);
});
