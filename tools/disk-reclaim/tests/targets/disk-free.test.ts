import { expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { mkdtemp, mkdir, open, rm, writeFile, utimes } from "node:fs/promises";
import { tmpdir, hostname } from "node:os";
import { join, resolve } from "node:path";
import { freeGraveyard, freeExit, requestedBytes } from "../../src/free.ts";
import { tryAcquire } from "../../../shared/src/dir-lock.ts";
import { jsonText } from "../../../shared/src/zod.ts";

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
});

test("protected and in-use payloads skip while later eligible payload is taken", async () => {
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
  expect(result.skip_counts).toMatchObject({ protected: 1, in_use: 1 });
  expect(existsSync(protectedPath)).toBe(true);
  expect(existsSync(busy)).toBe(true);
  expect(existsSync(next)).toBe(false);
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

test("count budget stops discovery without deleting a younger candidate", async () => {
  await using f = await fixture();
  const first = await f.payload("old", 1024, 800_000);
  const second = await f.payload("next", 1024, 700_000);
  const result = await freeGraveyard("1KiB", { ...f.options, maxEntries: 1 });
  expect(result.outcome).toBe("partial");
  expect(result.budget.exhausted).toBe(true);
  expect(result.unlinked_bytes).toBe(0);
  expect(existsSync(first)).toBe(true);
  expect(existsSync(second)).toBe(true);
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

test("budget exhaustion during whole-payload preflight unlinks nothing", async () => {
  await using f = await fixture();
  const payload = join(f.root, "directory");
  await mkdir(payload);
  for (const name of ["a", "b", "c", "d"])
    await writeFile(join(payload, name), "data");
  await writeFile(
    join(f.root, ".record"),
    `2000-01-01T00:00:00Z\t/original\t${payload}\n`,
  );
  const result = await freeGraveyard("1KiB", { ...f.options, maxEntries: 12 });
  expect(result.outcome).toBe("partial");
  expect(result.budget.exhausted).toBe(true);
  expect(result.unlinked_bytes).toBe(0);
  for (const name of ["a", "b", "c", "d"])
    expect(existsSync(join(payload, name))).toBe(true);
});
