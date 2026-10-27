import { expect, spyOn, test } from "bun:test";
import { existsSync } from "node:fs";
import {
  mkdtemp,
  mkdir,
  open,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { tryAcquire } from "../../shared/src/dir-lock.ts";
import { run } from "../src/engine.ts";
import { hasForegroundWaiter } from "../src/receipt.ts";
import { recoverExit, recoverGraveyard } from "../src/recover.ts";
import { removeTree } from "../src/lib/remove-tree.ts";
import { createRipExpiryTarget } from "../src/targets/rip-expire.ts";

const now = Temporal.Instant.from("2026-10-24T12:00:00Z").epochMilliseconds;
const config = {
  repo_roots: [],
  repos: [],
  scratch_roots: [],
  delete_roots: [],
  regenerable_ignored: [],
  session_grace_hours: 24,
  ignore_unreadable_procs: [],
  graveyard_min_age_hours: 24,
  graveyard_pressure_undo_minutes: 10,
  protected: [],
};
async function fixture() {
  const temp = await mkdtemp(join(tmpdir(), "disk-recover-"));
  const root = join(temp, "graveyard");
  await mkdir(root);
  const records: string[] = [];
  const pathByName = new Map<string, string>();
  return {
    temp,
    root,
    path: temp,
    async payload(name: string, bytes: number, age = 700_000) {
      const path = join(root, name);
      const file = await open(path, "w");
      await file.truncate(bytes);
      await file.close();
      await utimes(path, 1, 1);
      records.push(
        `${Temporal.Instant.fromEpochMilliseconds(now - age).toString()}\t/original\t${path}`,
      );
      await writeFile(join(root, ".record"), records.join("\n"));
      pathByName.set(name, path);
      return path;
    },
    options(extra: Record<string, unknown> = {}) {
      return {
        config,
        env: { RIP_GRAVEYARD: root },
        path: temp,
        now,
        state: join(temp, "state"),
        yes: true,
        log: (_line: string) => {},
        immutable: () => false,
        statfs: (_path: string) => ({ bavail: 1000, bsize: 1 }),
        ...extra,
      };
    },
    pathByName,
    [Symbol.asyncDispose]: () => rm(temp, { recursive: true, force: true }),
  };
}

test("logical unlink without available-byte recovery is unmet", async () => {
  await using f = await fixture();
  const path = await f.payload("sparse", 16 * 1024 * 1024);
  const result = await recoverGraveyard("1KiB", f.options());
  expect(result.unlinked_logical_bytes).toBe(16 * 1024 * 1024);
  expect(result.available_before).toBe(1000);
  expect(result.available_after).toBe(1000);
  expect(result.outcome).toBe("needs_more");
  expect(recoverExit(result)).toBe(1);
  expect(existsSync(path)).toBe(false);
});

test("undo-window candidates report paths, eligibility and shortfall without deletion", async () => {
  await using f = await fixture();
  const path = await f.payload("young", 4096, 590_000);
  const result = await recoverGraveyard("1KiB", f.options());
  expect(result.eligible_at).toEqual([
    {
      path,
      eligible_at: Temporal.Instant.fromEpochMilliseconds(
        now + 10_000,
      ).toString(),
    },
  ]);
  expect(result.shortfall_bytes).toBe(24);
  expect(existsSync(path)).toBe(true);
});

test("open-deleted payload can leave available bytes unchanged and goal unmet", async () => {
  await using f = await fixture();
  const path = await f.payload("held-open", 4096);
  const file = await open(path, "r");
  const result = await recoverGraveyard("1KiB", f.options());
  expect(result.unlinked_logical_bytes).toBe(4096);
  expect(result.available_after).toBe(1000);
  expect(result.outcome).toBe("needs_more");
  await file.close();
});

test("long non-TTY wait emits five-second heartbeat to stderr logger", async () => {
  await using f = await fixture();
  await f.payload("heartbeat-candidate", 1024);
  const stderr = spyOn(process.stderr, "write").mockImplementation(() => true);
  let measurements = 0;
  const result = await recoverGraveyard(
    "1KiB",
    f.options({
      log: undefined,
      withinMs: 8_000,
      statfs: async () => {
        measurements += 1;
        if (measurements === 2) await Bun.sleep(5_150);
        return { bavail: 1000, bsize: 1 };
      },
    }),
  );
  const lines = stderr.mock.calls.map(([chunk]) => String(chunk)).join("");
  stderr.mockRestore();
  expect(result.outcome).toBe("needs_more");
  expect(process.stderr.isTTY).not.toBe(true);
  expect(lines).toContain("elapsed");
});

test("recover waits within its work budget and proceeds when the holder releases", async () => {
  await using f = await fixture();
  const path = await f.payload("candidate", 1024);
  const holder = {
    pid: process.pid,
    host: hostname(),
    what: "fixture-holder",
    since: Temporal.Now.instant().toString(),
  };
  const lock = tryAcquire(join(f.temp, "state", "lock"), holder);
  expect(lock.ok).toBe(true);
  if (!lock.ok) return;
  const lines: string[] = [];
  const release = Bun.sleep(2_000).then(lock.release);
  const started = performance.now();
  const result = await recoverGraveyard(
    "1KiB",
    f.options({ withinMs: 10_000, log: (line: string) => lines.push(line) }),
  );
  await release;
  expect(performance.now() - started).toBeGreaterThanOrEqual(1_900);
  expect(lines.some((line) => line.includes("fixture-holder"))).toBe(true);
  expect(result.deleted_payloads).toEqual([path]);
  expect(result.errors).toEqual([]);
  expect(await hasForegroundWaiter(join(f.temp, "state"))).toBe(false);
});

test("recover returns busy with holder and elapsed wait when within expires", async () => {
  await using f = await fixture();
  await f.payload("candidate", 1024);
  const holder = {
    pid: process.pid,
    host: hostname(),
    what: "fixture-holder",
    since: Temporal.Now.instant().toString(),
  };
  const lock = tryAcquire(join(f.temp, "state", "lock"), holder);
  expect(lock.ok).toBe(true);
  if (!lock.ok) return;
  const started = performance.now();
  const result = await recoverGraveyard("1KiB", f.options({ withinMs: 250 }));
  const elapsed = performance.now() - started;
  lock.release();
  expect(result.outcome).toBe("busy");
  expect(recoverExit(result)).toBe(3);
  expect(elapsed).toBeGreaterThanOrEqual(200);
  const diagnostic = result.errors[0] ?? "";
  expect(diagnostic).toMatch(/lock stayed busy for [\d.]+s/u);
  expect(diagnostic).toContain("fixture-holder");
  expect(await hasForegroundWaiter(join(f.temp, "state"))).toBe(false);
});

test("rip expiry yields its lock after one payload to a waiting recover", async () => {
  await using f = await fixture();
  const timerPayload = await f.payload("timer-first", 1024, 800_000);
  const recoverPayload = await f.payload("recover-second", 1024, 700_000);
  const previousRoot = process.env.RIP_GRAVEYARD;
  process.env.RIP_GRAVEYARD = f.root;
  using _restoreRoot = {
    [Symbol.dispose]: () => {
      if (previousRoot === undefined) delete process.env.RIP_GRAVEYARD;
      else process.env.RIP_GRAVEYARD = previousRoot;
    },
  };
  const entered = Promise.withResolvers<void>();
  const continueFirst = Promise.withResolvers<void>();
  let pause = true;
  const timerDeleted: string[] = [];
  const logs: string[] = [];
  const expiry = createRipExpiryTarget({
    remove: async (path, options) => {
      if (pause) {
        pause = false;
        entered.resolve();
        await continueFirst.promise;
      }
      const removed = await removeTree(path, {
        ...options,
        immutable: () => false,
      });
      if (removed.ok) timerDeleted.push(path);
      return removed;
    },
  });
  const state = join(f.temp, "state");
  const timer = run([expiry.target], {
    context: {
      mode: "plan",
      config,
      log: (line) => {
        logs.push(line);
      },
    },
    state,
    yes: true,
    explicit: ["rip-expire"],
    headroom: { drives: [] },
  });
  await entered.promise;
  const foreground = recoverGraveyard(
    "1KiB",
    f.options({
      withinMs: 10_000,
      statfs: () => ({ bavail: 0, bsize: 1 }),
    }),
  );
  const waiterDeadline = performance.now() + 2_000;
  while (
    !(await hasForegroundWaiter(state)) &&
    performance.now() < waiterDeadline
  )
    await Bun.sleep(5);
  const waiterRegistered = await hasForegroundWaiter(state);
  continueFirst.resolve();
  const [timerResult, recoverResult] = await Promise.all([timer, foreground]);
  expect(waiterRegistered).toBe(true);
  expect(timerResult.exit).toBe(0);
  expect(timerDeleted).toEqual([timerPayload]);
  expect(recoverResult.deleted_payloads).toEqual([recoverPayload]);
  expect(existsSync(timerPayload)).toBe(false);
  expect(existsSync(recoverPayload)).toBe(false);
  expect(logs.some((line) => line.includes("foreground capacity waiter"))).toBe(
    true,
  );
  expect(await hasForegroundWaiter(state)).toBe(false);
});

test("lock contention is busy exit 3 while work-window end is needs_more exit 1", async () => {
  await using f = await fixture();
  const path = await f.payload("candidate", 1024);
  const holder = {
    pid: process.pid,
    host: hostname(),
    what: "fixture-holder",
    since: Temporal.Now.instant().toString(),
  };
  const lock = tryAcquire(join(f.temp, "state", "lock"), holder);
  expect(lock.ok).toBe(true);
  if (!lock.ok) return;
  const busy = await recoverGraveyard("1KiB", f.options({ lockWaitS: 0 }));
  expect(busy.outcome).toBe("busy");
  expect(recoverExit(busy)).toBe(3);
  lock.release();
  let clockTick = 0;
  const ended = await recoverGraveyard(
    "1KiB",
    f.options({
      clock: () => {
        clockTick += 1;
        return clockTick;
      },
      withinMs: 1,
    }),
  );
  expect(ended.outcome).toBe("needs_more");
  expect(recoverExit(ended)).toBe(1);
  expect(existsSync(path)).toBe(true);
});

test("cancel records partial result and maps to 130", async () => {
  await using f = await fixture();
  const path = await f.payload("first", 1024);
  const controller = new AbortController();
  const result = await recoverGraveyard(
    "1KiB",
    f.options({
      log: (line: string) => {
        if (line.includes("logical unlinked")) controller.abort();
      },
      signal: controller.signal,
      statfs: () => ({ bavail: 1000, bsize: 1 }),
    }),
  );
  expect(result.outcome).toBe("cancelled");
  expect(recoverExit(result)).toBe(130);
  expect(existsSync(path)).toBe(false);
  expect(result.receipt).not.toBeNull();
  expect(result.output).not.toBeNull();
  expect(await readFile(result.output ?? "", "utf8")).toContain(
    '"unlinked_logical_bytes":1024',
  );
  expect(await readFile(result.receipt ?? "", "utf8")).toContain(
    '"target":"recover"',
  );
});

test("stops before next payload when available-byte goal is reached", async () => {
  await using f = await fixture();
  const first = await f.payload("a-first", 1024);
  const next = await f.payload("z-next", 1024);
  const result = await recoverGraveyard(
    "1KiB",
    f.options({
      statfs: () => ({ bavail: existsSync(first) ? 1000 : 1024, bsize: 1 }),
    }),
  );
  expect(result.outcome).toBe("met");
  expect(result.deleted_payloads).toEqual([first]);
  expect(existsSync(next)).toBe(true);
});

test("already-met available-byte goal deletes nothing", async () => {
  await using f = await fixture();
  const path = await f.payload("kept", 1024);
  const result = await recoverGraveyard("1KB", f.options());
  expect(result.outcome).toBe("met");
  expect(recoverExit(result)).toBe(0);
  expect(result.unlinked_logical_bytes).toBe(0);
  expect(existsSync(path)).toBe(true);
});
