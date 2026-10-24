import { expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import {
  mkdtemp,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
  utimes,
} from "node:fs/promises";
import { tmpdir, hostname } from "node:os";
import { join, resolve } from "node:path";
import { freeGraveyard, freeExit, requestedBytes } from "../../src/free.ts";
import { tryAcquire } from "../../../shared/src/dir-lock.ts";
import { hasForegroundWaiter } from "../../src/receipt.ts";
import { loadConfig, run } from "../../src/engine.ts";
import { jsonOf, jsonText } from "../../../shared/src/zod.ts";
import { collectProcesses } from "../../src/lib/procs.ts";
import { removeTree } from "../../src/lib/remove-tree.ts";
import { RIP_GRAVEYARD_MAX_BYTES } from "../../src/lib/graveyards.ts";
import { createRipExpiryTarget } from "../../src/targets/rip-expire.ts";
import type { Context } from "../../src/targets/index.ts";
import { procFixture } from "../fixtures/procs.ts";
import { ReceiptV2 } from "../../src/model.ts";

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
};
async function fixture() {
  const temp = await mkdtemp(join(tmpdir(), "disk-free-"));
  const root = join(temp, "graveyard");
  await mkdir(root);
  const records: string[] = [];
  return {
    temp,
    root,
    async payload(name: string, bytes: number, age?: number) {
      const path = join(root, name);
      const file = await open(path, "w");
      await file.truncate(bytes);
      await file.close();
      await utimes(path, 1, 1);
      if (age !== undefined)
        records.push(
          `${Temporal.Instant.fromEpochMilliseconds(now - age).toString()}\t/original\t${path}`,
        );
      await writeFile(join(root, ".record"), records.join("\n"));
      return path;
    },
    options: {
      config,
      env: { RIP_GRAVEYARD: root },
      now,
      state: join(temp, "state"),
      processes: () => ({ openPaths: () => ({ open: [], unknown: [] }) }),
      immutable: () => false,
      log: (_line: string) => {},
    },
    [Symbol.asyncDispose]: () => rm(temp, { recursive: true, force: true }),
  };
}

async function expireCapacity(
  f: Awaited<ReturnType<typeof fixture>>,
  processes: ReturnType<typeof collectProcesses>,
) {
  const expiry = createRipExpiryTarget({
    remove: (path, options) =>
      removeTree(path, {
        ...options,
        immutable: f.options.immutable,
        protection: { ...options.protection, processes },
      }),
  });
  const ctx: Context = { mode: "run", config, log: () => {} };
  const candidates = await expiry.candidates(f.options.env, f.temp, {
    now,
    config,
    context: ctx,
  });
  const selected: string[] = [];
  for (const candidate of candidates) {
    const row = await expiry.target.recheck(candidate, ctx);
    if (row?.verdict !== "RECLAIM") continue;
    expect(row.reason).toContain("oldest-first capacity expiry");
    expect((await expiry.target.act(row, ctx)).ok).toBe(true);
    selected.push(row.id);
  }
  await expiry.target.finish(ctx);
  return selected;
}

test("free chooses oldest burial first; ties by stable id; stops after SIZE", async () => {
  await using f = await fixture();
  const next = await f.payload("a-next", 1024, 700_000);
  const oldest = await f.payload("z-oldest", 1024, 800_000);
  const tie = await f.payload("b-tie", 1024, 700_000);
  const result = await freeGraveyard("2KiB", f.options);
  expect(result.outcome).toBe("met");
  expect(result.deleted_payloads).toEqual([
    "rip graveyard: z-oldest",
    "rip graveyard: a-next",
  ]);
  expect(result.unlinked_bytes).toBe(2048);
  expect(existsSync(oldest)).toBe(false);
  expect(existsSync(next)).toBe(false);
  expect(existsSync(tie)).toBe(true);
  expect(existsSync(join(f.root, ".record"))).toBe(true);
});

test("U-1s and unknown burial remain; exactly U is eligible even below R and C", async () => {
  await using f = await fixture();
  const fresh = await f.payload("fresh", 3000, 599_000);
  const edge = await f.payload("edge", 1024, 600_000);
  const unknown = await f.payload("unknown", 4000);
  const result = await freeGraveyard("1KiB", f.options);
  expect(result.outcome).toBe("met");
  expect(existsSync(edge)).toBe(false);
  expect(existsSync(fresh)).toBe(true);
  expect(existsSync(unknown)).toBe(true);
  expect(result.skip_counts).toMatchObject({
    unknown_burial: 1,
    u_protected: 1,
  });
  expect(result.u_protected_bytes).toBe(3000);
  expect(result.earliest_eligible_at).toBe(
    Temporal.Instant.fromEpochMilliseconds(now + 1000).toString(),
  );
});

test("foreign uid is skipped and next eligible payload is taken", async () => {
  await using f = await fixture();
  const foreign = await f.payload("foreign", 1024, 800_000);
  const next = await f.payload("next", 1024, 700_000);
  const result = await freeGraveyard("1KiB", {
    ...f.options,
    owner: (path) => ({
      uid:
        path === foreign
          ? (process.getuid?.() ?? 0) + 1
          : (process.getuid?.() ?? 0),
      name: "fixture",
    }),
  });
  expect(result.outcome).toBe("met");
  expect(result.skip_counts.foreign_uid).toBe(1);
  expect(existsSync(foreign)).toBe(true);
  expect(existsSync(next)).toBe(false);
});

test("one indivisible 20 GiB sparse payload overshoots 1 GiB, separate from statfs", async () => {
  await using f = await fixture();
  await f.payload("sparse", 20 * 1024 ** 3, 700_000);
  const result = await freeGraveyard("1GiB", f.options);
  expect(result.outcome).toBe("met");
  expect(result.unlinked_bytes).toBe(20 * 1024 ** 3);
  expect(result.overshoot_bytes).toBe(19 * 1024 ** 3);
  expect(result.free_delta_bytes).toBeNumber();
  expect(result.free_delta_bytes).not.toBe(result.unlinked_bytes);
  expect(result.free_delta_note).toContain("other writers and open files");
});

test("partial reports shortfall, held bytes and earliest eligible time", async () => {
  await using f = await fixture();
  await f.payload("eligible", 1024, 700_000);
  await f.payload("young", 2048, 590_000);
  await f.payload("younger", 4096, 580_000);
  const result = await freeGraveyard("4KiB", f.options);
  expect(result.outcome).toBe("partial");
  expect(freeExit(result)).toBe(1);
  expect(result.shortfall_bytes).toBe(3072);
  expect(result.u_protected_bytes).toBe(6144);
  expect(result.earliest_eligible_at).toBe(
    Temporal.Instant.fromEpochMilliseconds(now + 10_000).toString(),
  );
});

test("held reclaim lock returns busy within short bound, holder and elapsed, no deletion", async () => {
  await using f = await fixture();
  const payload = await f.payload("eligible", 1024, 700_000);
  const holder = {
    pid: process.pid,
    host: hostname(),
    what: "fixture-holder",
    since: Temporal.Now.instant().toString(),
  };
  const lock = tryAcquire(join(f.options.state, "lock"), holder);
  expect(lock.ok).toBe(true);
  if (!lock.ok) return;
  using _lock = { [Symbol.dispose]: lock.release };
  const start = performance.now();
  const result = await freeGraveyard("1KiB", { ...f.options, lockWaitS: 0.05 });
  expect(performance.now() - start).toBeLessThan(500);
  expect(result.outcome).toBe("busy");
  expect(freeExit(result)).toBe(3);
  expect(result.lock_holder).toEqual(holder);
  expect(result.lock_elapsed_ms).toBeGreaterThanOrEqual(50);
  expect(result.unlinked_bytes).toBe(0);
  expect(existsSync(payload)).toBe(true);
  expect(await hasForegroundWaiter(f.options.state)).toBe(false);
});

test("rip expiry yields after one complete payload to a foreground free request", async () => {
  await using f = await fixture();
  const payloads: string[] = [];
  for (let index = 0; index < 12; index += 1)
    payloads.push(
      await f.payload(`payload-${index}`, 1024 ** 3, 700_000 + index),
    );
  await writeFile(
    join(f.root, ".record"),
    payloads
      .map(
        (path, index) =>
          `${Temporal.Instant.fromEpochMilliseconds(Temporal.Now.instant().epochMilliseconds - 700_000 - index).toString()}\t/original\t${path}`,
      )
      .join("\n"),
  );
  const loaded = loadConfig();
  expect(loaded.config).not.toBeNull();
  if (loaded.config === null) return;
  const previousRoot = process.env.RIP_GRAVEYARD;
  process.env.RIP_GRAVEYARD = f.root;
  using _restoreEnv = {
    [Symbol.dispose]: () => {
      if (previousRoot === undefined) delete process.env.RIP_GRAVEYARD;
      else process.env.RIP_GRAVEYARD = previousRoot;
    },
  };
  const entered = Promise.withResolvers<void>();
  const continueFirst = Promise.withResolvers<void>();
  let pause = true;
  const backgroundDeleted: string[] = [];
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
        protection: {
          ...options.protection,
          processes: { openPaths: () => ({ open: [], unknown: [] }) },
        },
      });
      if (removed.ok) backgroundDeleted.push(path);
      return removed;
    },
  });
  const background = run([expiry.target], {
    context: { mode: "plan", config: loaded.config, log: () => {} },
    state: f.options.state,
    yes: true,
    explicit: ["rip-expire"],
    headroom: { drives: [] },
  });
  await entered.promise;
  const foregroundLocked = Promise.withResolvers<void>();
  const backgroundPayload = payloads[11] ?? f.root;
  const foregroundPayload = payloads[10] ?? f.root;
  const foreground = freeGraveyard("1KiB", {
    ...f.options,
    processes: () => {
      expect(backgroundDeleted).toEqual([backgroundPayload]);
      expect(existsSync(foregroundPayload)).toBe(true);
      foregroundLocked.resolve();
      return { openPaths: () => ({ open: [], unknown: [] }) };
    },
  });
  const waiterDeadline = performance.now() + 2_000;
  while (
    !(await hasForegroundWaiter(f.options.state)) &&
    performance.now() < waiterDeadline
  )
    await Bun.sleep(5);
  expect(await hasForegroundWaiter(f.options.state)).toBe(true);
  continueFirst.resolve();
  await foregroundLocked.promise;
  const [backgroundResult, freeResult] = await Promise.all([
    background,
    foreground,
  ]);
  expect(backgroundResult.exit).toBe(0);
  expect(freeResult.outcome).toBe("met");
  expect(freeResult.deleted_payloads).toEqual(["rip graveyard: payload-10"]);
  expect(backgroundDeleted).toEqual([backgroundPayload]);
  expect(payloads.filter((path) => !existsSync(path))).toHaveLength(2);
  expect(existsSync(backgroundPayload)).toBe(false);
  expect(existsSync(foregroundPayload)).toBe(false);
  expect(await hasForegroundWaiter(f.options.state)).toBe(false);
  const receiptLine = (
    await readFile(join(f.options.state, "log.jsonl"), "utf8")
  )
    .trim()
    .split("\n")
    .find((line) => line.includes('"name":"rip-expire"'));
  expect(receiptLine).toBeString();
  if (receiptLine === undefined) return;
  const receipt = jsonOf(ReceiptV2).safeParse(receiptLine);
  expect(receipt.success).toBe(true);
  expect(receipt.success ? receipt.data.lock_yield : undefined).toEqual({
    payloads_completed: 1,
    reason: "foreground disk:free waiter",
  });
});

test("stale foreground waiter is ignored and removed", async () => {
  await using f = await fixture();
  const waiters = join(f.options.state, "foreground-waiters");
  await mkdir(waiters, { recursive: true });
  await writeFile(
    join(waiters, "2147483647-stale.json"),
    JSON.stringify({
      pid: 2147483647,
      host: hostname(),
      since: now.toString(),
    }),
  );
  expect(await hasForegroundWaiter(f.options.state)).toBe(false);
  expect(await readdir(waiters)).toEqual([]);
});

test("protected payloads skip while the oldest open payload is reclaimed", async () => {
  await using f = await fixture();
  const protectedPath = await f.payload("protected", 1024, 900_000);
  const busy = await f.payload("busy", 1024, 800_000);
  const next = await f.payload("next", 1024, 700_000);
  const result = await freeGraveyard("1KiB", {
    ...f.options,
    config: { ...config, protected: [protectedPath] },
    processes: () => ({
      openPaths: (path) => ({
        open:
          path === busy ? [{ pid: process.pid, via: "fd/3", path: busy }] : [],
        unknown: [],
      }),
    }),
  });
  expect(result.outcome).toBe("met");
  expect(result.skip_counts).toEqual({
    foreign_uid: 0,
    unknown_burial: 0,
    u_protected: 0,
    protected: 1,
    in_use: 0,
    changed: 0,
    unreadable: 0,
    budget: 0,
  });
  expect(existsSync(protectedPath)).toBe(true);
  expect(existsSync(busy)).toBe(false);
  expect(existsSync(next)).toBe(true);
});

test("partial unreadable proc paths and an open fd match capacity expiry oldest-first", async () => {
  const deleted = new Map<string, string[]>();
  for (const mode of ["free", "capacity"]) {
    await using f = await fixture();
    const names = ["z-oldest", "a-middle", "b-newest"];
    const records: string[] = [];
    const paths: string[] = [];
    for (const [index, name] of names.entries()) {
      const path = join(f.root, name);
      paths.push(path);
      await mkdir(path);
      const file = await open(join(path, "data"), "w");
      await file.truncate(RIP_GRAVEYARD_MAX_BYTES / 2);
      await file.close();
      records.push(
        `${Temporal.Instant.fromEpochMilliseconds(now - (30 - index) * 60_000).toString()}\t/original/${name}\t${path}`,
      );
    }
    const record = records.join("\n");
    await writeFile(join(f.root, ".record"), record);
    const heldPath = join(f.root, names[0] ?? "", "data");
    const held = await open(heldPath, "r");
    await using _held = { [Symbol.asyncDispose]: () => held.close() };
    // Inject EACCES rather than chmod so the fixture remains meaningful as root.
    const unknown = procFixture(f.temp, "opaque-worker", ["cwd", "fd", "maps"]);
    const reader = procFixture(f.temp, "reader", [], "EACCES", 9999998);
    await symlink(heldPath, join(reader.base, "fd/4"));
    const processes = collectProcesses({
      procRoot: unknown.procRoot,
      fs: unknown.fs,
    });
    const evidence = processes.openPaths(paths[0] ?? f.root);
    expect(evidence.unknown).toHaveLength(3);
    for (const via of ["cwd", "fd", "maps"])
      expect(
        evidence.unknown.some((detail) => detail.includes(` ${via}: EACCES`)),
      ).toBe(true);
    expect(evidence.open).toContainEqual({
      pid: 9999998,
      via: "fd/4",
      path: heldPath,
    });

    if (mode === "free") {
      const result = await freeGraveyard("6GiB", {
        ...f.options,
        processes: () => processes,
      });
      expect(result.outcome).toBe("met");
      expect(result.skip_counts.in_use).toBe(0);
      deleted.set(mode, result.deleted_payloads);
    } else {
      deleted.set(mode, await expireCapacity(f, processes));
    }
    // No age expiry: all are <24h old. Both commands remove the first two 5 GiB payloads.
    expect(deleted.get(mode)).toEqual(
      names.slice(0, 2).map((name) => `rip graveyard: ${name}`),
    );
    expect(existsSync(paths[0] ?? f.root)).toBe(false);
    expect(existsSync(paths[1] ?? f.root)).toBe(false);
    expect(existsSync(paths[2] ?? f.root)).toBe(true);
    expect((await held.stat()).nlink).toBe(0);
    expect(await readFile(join(f.root, ".record"), "utf8")).toBe(record);
  }
  expect(deleted.get("free")).toEqual(deleted.get("capacity"));
});

test("snapshot excludes later writers", async () => {
  await using f = await fixture();
  const changed = await f.payload("old", 1024, 800_000);
  let late: string | undefined;
  const result = await freeGraveyard("2KiB", {
    ...f.options,
    processes: () => {
      // This runs after discovery and burial revalidation, during protection.
      late = join(f.root, "late");
      writeFileSync(late, "later writer");
      return { openPaths: () => ({ open: [], unknown: [] }) };
    },
  });
  expect(result.outcome).toBe("partial");
  expect(result.unlinked_bytes).toBe(1024);
  expect(existsSync(changed)).toBe(false);
  expect(late).toBeDefined();
});

test("one request deletes eligible payloads with more than 100000 entries", async () => {
  await using f = await fixture();
  const records: string[] = [];
  const payloads: string[] = [];
  for (const name of ["oldest", "next"]) {
    const path = join(f.root, name);
    payloads.push(path);
    await mkdir(path);
    for (let offset = 0; offset < 50_001; offset += 128)
      await Promise.all(
        Array.from({ length: Math.min(128, 50_001 - offset) }, (_, index) =>
          writeFile(join(path, `entry-${offset + index}`), "x"),
        ),
      );
    records.push(
      `${Temporal.Instant.fromEpochMilliseconds(now - (name === "oldest" ? 800_000 : 700_000)).toString()}\t/original\t${path}`,
    );
  }
  await writeFile(join(f.root, ".record"), records.join("\n"));
  const bytes =
    100_002 +
    (await lstat(payloads[0] ?? f.root)).size +
    (await lstat(payloads[1] ?? f.root)).size;
  const result = await freeGraveyard(`${bytes / 1024}KiB`, f.options);
  expect(result.outcome).toBe("met");
  expect(result.unlinked_bytes).toBe(bytes);
  expect(result.deleted_payloads).toEqual([
    "rip graveyard: oldest",
    "rip graveyard: next",
  ]);
  expect(result.budget.entries).toBeNull();
  expect(result.budget.visited).toBeGreaterThan(100_000);
  expect(result.budget.exhausted).toBe(false);
  expect(result.partial_payloads).toEqual([]);
  expect(result.errors).toEqual([]);
  for (const path of payloads) expect(existsSync(path)).toBe(false);
}, 120_000);

test("time exhaustion between payloads keeps the younger candidate", async () => {
  await using f = await fixture();
  const first = await f.payload("old", 1024, 800_000);
  const second = await f.payload("next", 1024, 700_000);
  const start = performance.now();
  const result = await freeGraveyard("2KiB", {
    ...f.options,
    budgetMs: 50,
    clock: () => (existsSync(first) ? 0 : 50),
  });
  expect(performance.now() - start).toBeLessThan(500);
  expect(result.outcome).toBe("partial");
  expect(result.budget.exhausted).toBe(true);
  expect(result.unlinked_bytes).toBe(1024);
  expect(result.deleted_payloads).toEqual(["rip graveyard: old"]);
  expect(result.partial_payloads).toEqual([]);
  expect(existsSync(first)).toBe(false);
  expect(existsSync(second)).toBe(true);
});

test("time exhaustion inside unlinking reports the payload and actual bytes", async () => {
  await using f = await fixture();
  const payload = join(f.root, "directory");
  await mkdir(payload);
  const names = Array.from({ length: 128 }, (_, index) => `file-${index}`);
  for (const name of names) await writeFile(join(payload, name), "data");
  const next = await f.payload("next", 1024, 700_000);
  await writeFile(
    join(f.root, ".record"),
    `2000-01-01T00:00:00Z\t/original\t${payload}\n2001-01-01T00:00:00Z\t/original\t${next}\n`,
  );
  const logs: string[] = [];
  const start = performance.now();
  const result = await freeGraveyard("1GiB", {
    ...f.options,
    budgetMs: 1000,
    // Move the injected monotonic clock to the deadline after the first unlink.
    clock: () => (!existsSync(join(payload, "file-0")) ? 1000 : 0),
    log: (line) => {
      logs.push(line);
    },
  });
  expect(performance.now() - start).toBeLessThan(500);
  const remaining = await readdir(payload);
  expect(remaining.length).toBeGreaterThan(0);
  expect(remaining.length).toBeLessThan(names.length);
  const unlinked = (names.length - remaining.length) * 4;
  expect(result.outcome).toBe("partial");
  expect(result.budget.exhausted).toBe(true);
  expect(result.skip_counts.budget).toBe(1);
  expect(result.unlinked_bytes).toBe(unlinked);
  expect(result.partial_payloads).toEqual([
    { path: payload, unlinked_bytes: unlinked },
  ]);
  expect(result.deleted_payloads).toEqual([]);
  expect(
    result.errors.some((error) => error.includes("budget exhausted")),
  ).toBe(true);
  expect(
    logs.some(
      (line) => line.includes("partially deleted") && line.includes(payload),
    ),
  ).toBe(true);
  expect(existsSync(next)).toBe(true);
});

test("large young mirrored payloads never consume the eligible payload walk budget", async () => {
  await using f = await fixture();
  const records: string[] = [];
  for (let index = 0; index < 12; index += 1) {
    const path = join(f.root, "home/user/workspaces", `young-${index}`);
    await mkdir(path, { recursive: true });
    for (let child = 0; child < 128; child += 1)
      await writeFile(join(path, `file-${child}`), "young payload");
    records.push(
      `${Temporal.Instant.fromEpochMilliseconds(now - 1000 - index).toString()}\t/source\t${path}`,
    );
  }
  const older = await f.payload("z-eligible", 1024, 700_000);
  records.push(
    `${Temporal.Instant.fromEpochMilliseconds(now - 700_000).toString()}\t/source\t${older}`,
  );
  await writeFile(join(f.root, ".record"), records.join("\n"));
  const result = await freeGraveyard("1KiB", f.options);
  expect(result.outcome).toBe("met");
  expect(result.deleted_payloads).toEqual(["rip graveyard: z-eligible"]);
  expect(result.skip_counts.u_protected).toBe(12);
  expect(result.budget.exhausted).toBe(false);
  expect(result.budget.visited).toBeLessThan(128);
  expect(result.u_protected_bytes_complete).toBe(false);
  for (let index = 0; index < 12; index += 1)
    expect(
      (await readdir(join(f.root, "home/user/workspaces", `young-${index}`)))
        .length,
    ).toBe(128);
});

test("sequential distinct burials advance the held frontier without refreshing burial times", async () => {
  await using f = await fixture();
  const base = join(f.root, "home/user/workspaces");
  await mkdir(base, { recursive: true });
  const records: string[] = [];
  // Actual local ctime record shape; interpret in the host zone as rip does.
  for (const [name, time] of [
    ["api15", "Sat Oct 24 16:27:33 2026"],
    ["column-xor", "Sat Oct 24 16:28:03 2026"],
    ["scanfield", "Sat Oct 24 16:30:36 2026"],
  ]) {
    const path = join(base, name ?? "");
    await writeFile(path, "payload");
    await utimes(path, 1, 1);
    records.push(`${time}\t/source/${name}\t${path}`);
  }
  await writeFile(join(f.root, ".record"), records.join("\n"));
  for (const [at, expected] of [
    ["2026-10-24T16:35:00", "2026-10-24T16:37:33"],
    ["2026-10-24T16:38:00", "2026-10-24T16:38:03"],
    ["2026-10-24T16:40:30", "2026-10-24T16:40:36"],
  ]) {
    const result = await freeGraveyard("1KiB", {
      ...f.options,
      now: Temporal.PlainDateTime.from(at ?? "").toZonedDateTime(
        Temporal.Now.timeZoneId(),
      ).epochMilliseconds,
    });
    expect(result.earliest_eligible_at).toBe(
      Temporal.PlainDateTime.from(expected ?? "")
        .toZonedDateTime(Temporal.Now.timeZoneId())
        .toInstant()
        .toString(),
    );
  }
  expect(await readFile(join(f.root, ".record"), "utf8")).toBe(
    records.join("\n"),
  );
});

for (const input of [
  undefined,
  "0GiB",
  "-1GiB",
  "1024",
  "InfinityGiB",
  "NaNMB",
  "1XB",
  "1e309GB",
  "1e308TiB",
]) {
  test(`invalid SIZE ${input ?? "missing"} deletes nothing`, async () => {
    await using f = await fixture();
    const payload = await f.payload("eligible", 1024, 700_000);
    const result = await freeGraveyard(input, f.options);
    expect(result.outcome).toBe("invalid");
    expect(freeExit(result)).toBe(2);
    expect(result.unlinked_bytes).toBe(0);
    expect(existsSync(payload)).toBe(true);
  });
}

test("SI and IEC units and positive fractional sizes", () => {
  expect(requestedBytes("1KB")).toBe(1000);
  expect(requestedBytes("1KiB")).toBe(1024);
  expect(requestedBytes(".5 MiB")).toBe(524288);
  expect(requestedBytes("0.00001KB")).toBe(1);
  expect(requestedBytes("1e2KB")).toBe(100000);
  expect(requestedBytes("1e20GiB")).toBe(1e20 * 1024 ** 3);
});

test("CLI invalid SIZE always emits one JSON document, including negative and flags", async () => {
  await using f = await fixture();
  const cli = resolve(import.meta.dir, "../../src/reclaim.ts");
  for (const args of [
    [],
    ["0GiB"],
    ["-1GiB"],
    ["1024"],
    ["1KiB", "--under-pressure"],
    ["1KiB", "extra"],
  ]) {
    const proc = Bun.spawn([process.execPath, cli, "free", ...args], {
      env: {
        ...process.env,
        RIP_GRAVEYARD: f.root,
        RECLAIM_STATE_DIR: f.options.state,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, _err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    expect(code).toBe(2);
    expect(jsonText.safeParse(out).data).toMatchObject({
      outcome: "invalid",
      unlinked_bytes: 0,
    });
    expect(out.trim().split("\n")).toHaveLength(1);
  }
});

test("mise disk:free resolves and forwards SIZE to JSON command on temporary root", async () => {
  await using f = await fixture();
  await f.payload("eligible", 1024, 700_000);
  // CLI uses the current clock rather than fixture clock; an ancient burial remains eligible.
  await writeFile(
    join(f.root, ".record"),
    `2000-01-01T00:00:00Z\t/original\t${join(f.root, "eligible")}\n`,
  );
  const procRoot = join(f.temp, "proc");
  await mkdir(procRoot);
  const proc = Bun.spawn(["mise", "run", "disk:free", "--", "1KiB"], {
    cwd: resolve(import.meta.dir, "../../../.."),
    env: {
      ...process.env,
      MISE_TRUSTED_CONFIG_PATHS: resolve(import.meta.dir, "../../../.."),
      RIP_GRAVEYARD: f.root,
      RECLAIM_STATE_DIR: f.options.state,
      RECLAIM_TEST_PROC_ROOT: procRoot,
    },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 20_000,
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  expect(err).toContain("disk:free: root");
  expect(code).toBe(0);
  expect(jsonText.safeParse(out).data).toMatchObject({
    schema: "reclaim.free/1",
    outcome: "met",
    requested_bytes: 1024,
    unlinked_bytes: 1024,
    root: f.root,
  });
});

test("fresh or unknown burial written during process checks is kept", async () => {
  await using f = await fixture();
  const payload = await f.payload("old", 1024, 800_000);
  const record = join(f.root, ".record");
  for (const burial of [
    Temporal.Instant.fromEpochMilliseconds(now).toString(),
    "invalid",
  ]) {
    await writeFile(record, `2000-01-01T00:00:00Z\t/original\t${payload}\n`);
    const result = await freeGraveyard("1KiB", {
      ...f.options,
      processes: () => {
        writeFileSync(record, `${burial}\t/original\t${payload}\n`);
        return { openPaths: () => ({ open: [], unknown: [] }) };
      },
    });
    expect(result.outcome).toBe("partial");
    expect(result.unlinked_bytes).toBe(0);
    expect(existsSync(payload)).toBe(true);
    expect(
      result.skip_counts.u_protected + result.skip_counts.unknown_burial,
    ).toBe(1);
  }
});

test("whole-payload preflight retains owned siblings when a child has foreign uid", async () => {
  await using f = await fixture();
  const payload = join(f.root, "directory");
  await mkdir(payload);
  await writeFile(join(payload, "mine"), "owned");
  const foreign = join(payload, "foreign");
  await writeFile(foreign, "foreign");
  const next = await f.payload("next", 1024, 700_000);
  await writeFile(
    join(f.root, ".record"),
    `2000-01-01T00:00:00Z\t/original\t${payload}\n2001-01-01T00:00:00Z\t/original\t${next}\n`,
  );
  const result = await freeGraveyard("1KiB", {
    ...f.options,
    owner: (path) => ({
      uid: (process.getuid?.() ?? 0) + (path === foreign ? 1 : 0),
      name: "fixture",
    }),
  });
  expect(result.outcome).toBe("met");
  expect(result.unlinked_bytes).toBe(1024);
  expect(result.skip_counts.foreign_uid).toBe(1);
  expect(existsSync(join(payload, "mine"))).toBe(true);
  expect(existsSync(foreign)).toBe(true);
});

test("time exhaustion during whole-payload preflight unlinks nothing", async () => {
  await using f = await fixture();
  const payload = join(f.root, "directory");
  await mkdir(payload);
  for (const name of ["a", "b", "c", "d"])
    await writeFile(join(payload, name), "data");
  await writeFile(
    join(f.root, ".record"),
    `2000-01-01T00:00:00Z\t/original\t${payload}\n`,
  );
  let visits = 0;
  const result = await freeGraveyard("1KiB", {
    ...f.options,
    budgetMs: 50,
    clock: () => (visits >= 3 ? 50 : 0),
    immutable: () => {
      visits += 1;
      return false;
    },
  });
  expect(result.outcome).toBe("partial");
  expect(result.budget.exhausted).toBe(true);
  expect(result.unlinked_bytes).toBe(0);
  for (const name of ["a", "b", "c", "d"])
    expect(existsSync(join(payload, name))).toBe(true);
});
