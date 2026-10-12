import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFollowWaiter, FOLLOW_FALLBACK_MS } from "../src/follow-watch.ts";

const scratch = mkdtempSync(join(tmpdir(), "agx-follow-watch-"));
const waiters: ReturnType<typeof createFollowWaiter>[] = [];
afterAll(() => {
  waiters.forEach((waiter) => {
    waiter.close();
  });
  rmSync(scratch, { recursive: true, force: true });
});

test("idle follow waiter wakes once at the bounded fallback interval", async () => {
  const directory = join(scratch, "idle");
  mkdirSync(directory);
  const waiter = createFollowWaiter([directory]);
  waiters.push(waiter);
  const started = performance.now();
  expect(await waiter.wait()).toBe("fallback");
  expect(performance.now() - started).toBeGreaterThanOrEqual(
    FOLLOW_FALLBACK_MS - 100,
  );
});

test("filesystem events wake follow before the fallback", async () => {
  const directory = join(scratch, "event");
  mkdirSync(directory);
  const waiter = createFollowWaiter([directory]);
  waiters.push(waiter);
  const started = performance.now();
  const waiting = waiter.wait();
  setTimeout(() => {
    writeFileSync(join(directory, "changed"), "event");
  }, 50);
  expect(await waiting).toBe("event");
  expect(performance.now() - started).toBeLessThan(FOLLOW_FALLBACK_MS);
});
