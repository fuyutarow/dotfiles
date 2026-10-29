import { expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  open,
  lstat,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { purgeCandidates } from "../../src/targets/purge.ts";
import { RIP_GRAVEYARD_MAX_BYTES } from "../../src/lib/graveyards.ts";
import type { LivenessSnapshot } from "../../src/liveness/facts.ts";
import { expireGraveyard } from "../../../../scripts/wsl-capacity-recover.ts";
import { cliEnv } from "../fixtures/cli-env.ts";
import { inspectRipGraveyard, ripRecords } from "../../src/lib/graveyards.ts";
import { Plan } from "../../src/model.ts";
import { jsonOf } from "@dotfiles/shared/src/zod.ts";
import { removeTree } from "../../src/lib/remove-tree.ts";
import { createRipExpiryTarget } from "../../src/targets/rip-expire.ts";
import type { Context } from "../../src/targets/index.ts";

test("only deleted graveyards bypass unknown and positive process-use guards", async () => {
  const root = await mkdtemp(join(tmpdir(), "rip-cap-process-guard-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const payload = join(root, "payload");
  await writeFile(payload, "deleted fixture");
  const held = await open(payload, "r");
  await using _held = { [Symbol.asyncDispose]: () => held.close() };
  for (const evidence of [
    { open: [], unknown: ["EACCES: non-dumpable process"] },
    { open: [{ pid: 123, via: "fd/1", path: payload }], unknown: [] },
  ]) {
    const options = {
      uid: process.getuid?.() ?? 0,
      immutable: () => false,
      dryRun: true,
      protection: { processes: { openPaths: () => evidence } },
    };
    expect((await removeTree(payload, options)).ok).toBe(false);
    expect(
      (await removeTree(payload, { ...options, graveyard: true })).ok,
    ).toBe(true);
  }
  const removed = await removeTree(payload, {
    uid: process.getuid?.() ?? 0,
    immutable: () => false,
    graveyard: true,
    protection: {
      processes: {
        openPaths: () => expect.unreachable("no graveyard process probes"),
      },
    },
  });
  expect(removed.ok).toBe(true);
  expect(await held.readFile("utf8")).toBe("deleted fixture");
});

test("budget cancellation inside a payload keeps and measures partial deletion", async () => {
  const root = await mkdtemp(join(tmpdir(), "rip-cap-partial-payload-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  await writeFile(join(root, "a"), "allocated payload a");
  await writeFile(join(root, "b"), "allocated payload b");
  const uid = process.getuid?.() ?? 0;
  const controller = new AbortController();
  let probes = 0;
  const result = await removeTree(root, {
    uid,
    graveyard: true,
    incrementalGraveyard: true,
    signal: controller.signal,
    immutable: () => false,
    progress: false,
    owner: () => {
      probes += 1;
      if (probes === 3) controller.abort();
      return { uid, name: String(uid) };
    },
  });
  expect(result.ok).toBe(false);
  expect(result.entries_removed).toBe(1);
  expect(result.bytes_freed).toBeGreaterThan(0);
  expect(result.errors[0]?.error).toContain("tree removal cancelled");
  expect((await readdir(root)).length).toBe(1);
  // A fresh invocation finishes the same payload without any saved cursor.
  const remaining = await removeTree(root, {
    uid,
    graveyard: true,
    incrementalGraveyard: true,
    immutable: () => false,
    progress: false,
  });
  expect(remaining.ok).toBe(true);
  expect(
    await lstat(root).then(
      () => true,
      () => false,
    ),
  ).toBe(false);
});

test("an old large payload starts deletion after a bounded measurement slice", async () => {
  const root = await mkdtemp(join(tmpdir(), "rip-cap-measurement-slice-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const payload = join(root, "payload");
  await mkdir(payload);
  for (let index = 0; index < 100; index += 1)
    await writeFile(
      join(payload, `file-${index}`),
      "allocated payload".repeat(1024),
    );
  const old = Temporal.Now.instant().subtract({ hours: 48 });
  await writeFile(
    join(root, ".record"),
    `${old.toString()}\t/original\t${payload}`,
  );
  const actual = inspectRipGraveyard(payload).bytes;
  let ticks = 0;
  const { target, candidates } = createRipExpiryTarget({
    clock: () => {
      ticks += 1000;
      return ticks;
    },
  });
  const ctx: Context = {
    mode: "run",
    config: {
      repo_roots: [],
      repos: [],
      scratch_roots: [],
      delete_roots: [],
      regenerable_ignored: [],
      session_grace_hours: 24,
      ignore_unreadable_procs: [],
    },
    log: () => {},
  };
  const planned = (
    await candidates({ RIP_GRAVEYARD: root }, root, { context: ctx })
  ).find((row) => row.path === payload);
  expect(planned?.bytes).toBeNull();
  if (planned === undefined) return;
  const selected = await target.recheck(planned, ctx);
  expect(selected?.verdict).toBe("RECLAIM");
  expect(selected?.bytes).toBeLessThan(actual);
  if (selected === null) return;
  const result = await target.act(selected, ctx);
  expect(result.ok).toBe(true);
  expect(result.bytes_freed).toBeGreaterThan(0);
  expect(
    await lstat(payload).then(
      () => true,
      () => false,
    ),
  ).toBe(false);
});

test("timer expires nested eligible rip payloads by ctime record order until bounded", async () => {
  const root = await mkdtemp(join(tmpdir(), "timer-rip-nested-ctime-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const env = cliEnv(root);
  await writeFile(
    env.RECLAIM_CONFIG,
    `${await readFile(env.RECLAIM_CONFIG, "utf8")}\ngraveyard_min_age_hours = 24\ngraveyard_pressure_undo_minutes = 10\n\n[collection_policy.class_rules.ownerless_cache]\ndefault_owner = "dotfiles"\nttl_days = 14\n\n[collection_policy.class_rules.deregistered_index_db]\nttl_days = 7\n`,
  );
  const parent = join(env.RIP_GRAVEYARD, "home/user/workspaces");
  await mkdir(parent, { recursive: true });
  // Names and mtimes deliberately disagree with record order. All entries are
  // inside the 24h retention period, but outside the absolute undo window.
  const names = ["z-oldest", "a-middle", "b-newest"];
  const sizes = [6, 5, 6].map((n) => n * 1024 ** 3);
  const now = Temporal.Now.zonedDateTimeISO();
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const records: string[] = [];
  for (const [index, name] of names.entries()) {
    const path = join(parent, name);
    await writeFile(path, "allocated fixture bytes");
    const file = await open(path, "r+");
    await file.truncate(sizes[index]);
    await file.close();
    const mtime = now.subtract({ minutes: index + 1 }).epochMilliseconds / 1000;
    await utimes(path, mtime, mtime);
    const time = now.subtract({ minutes: 13 - index });
    const clock = time.toPlainTime().toString({ smallestUnit: "second" });
    const stamp = `${days[time.dayOfWeek - 1]} ${months[time.month - 1]} ${String(time.day).padStart(2, " ")} ${clock} ${time.year}`;
    records.push(`${stamp}\t/original/${name}\t${path}`);
  }
  await writeFile(join(env.RIP_GRAVEYARD, ".record"), records.join("\n"));
  expect(ripRecords(env.RIP_GRAVEYARD)).toHaveLength(3);
  const before = inspectRipGraveyard(env.RIP_GRAVEYARD).bytes;
  const invoke = (dryRun: boolean) =>
    expireGraveyard(
      dryRun,
      async (stage) => {
        expect(stage.argv.slice(1, 4)).toEqual(["exec", "--", "bun"]);
        // Exercise the timer's CLI/flags with the current runtime, without
        // provisioning unrelated mise tools inside the isolated fixture HOME.
        const child = Bun.spawn([process.execPath, ...stage.argv.slice(4)], {
          env,
          stdout: "pipe",
          stderr: "pipe",
          timeout: stage.timeoutMs,
        });
        const [output, error, code] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        expect(error).not.toContain("ERROR");
        return { code, output, timedOut: child.signalCode !== null };
      },
      Bun.which("mise") ?? "mise",
    );
  const preview = await invoke(true);
  expect(preview.code).toBe(0);
  const plan = jsonOf(Plan).safeParse(preview.output);
  expect(plan.success).toBe(true);
  if (!plan.success) return;
  expect(
    plan.data.targets[0]?.candidates
      .filter((row) => row.verdict === "RECLAIM")
      .map((row) => row.path),
  ).toEqual(names.slice(0, 2).map((name) => join(parent, name)));
  expect(plan.data.totals.reclaim_bytes).toBeGreaterThanOrEqual(
    before - RIP_GRAVEYARD_MAX_BYTES,
  );
  expect(inspectRipGraveyard(env.RIP_GRAVEYARD).bytes).toBe(before);
  const applied = await invoke(false);
  expect(applied.code).toBe(0);
  const result = jsonOf(Plan).safeParse(applied.output);
  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(
    result.data.targets[0]?.candidates
      .filter((row) => row.result?.ok === true)
      .map((row) => row.path),
  ).toEqual(names.slice(0, 2).map((name) => join(parent, name)));
  expect(await stat(join(parent, "b-newest")).then(() => true)).toBe(true);
  expect(inspectRipGraveyard(env.RIP_GRAVEYARD).bytes).toBeLessThanOrEqual(
    RIP_GRAVEYARD_MAX_BYTES,
  );
  const logs = await readdir(join(env.RECLAIM_STATE_DIR, "runs"));
  const output = await Promise.all(
    logs
      .filter((name) => name.endsWith(".log"))
      .map((name) =>
        readFile(join(env.RECLAIM_STATE_DIR, "runs", name), "utf8"),
      ),
  );
  expect(output.join("\n")).toMatch(/1 files and directories, [1-9]\d* bytes/u);
}, 120_000);

test("capacity expiry ignores process evidence and preserves restore metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "rip-cap-record-age-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const graveyard = join(root, "graveyard");
  await mkdir(graveyard);
  const now = Temporal.Now.instant();
  const old = now.subtract({ hours: 48 }).epochMilliseconds / 1000;
  for (const name of ["locked", "oldest", "newest"]) {
    const path = join(graveyard, name);
    const file = await open(path, "w");
    await file.truncate(RIP_GRAVEYARD_MAX_BYTES / 2);
    await file.close();
    await utimes(path, old, old);
  }
  const record = ["locked", "oldest", "newest"]
    .map(
      (name, index) =>
        `${now.subtract({ hours: 3 - index }).toString()}\t/original/${name}\t${join(graveyard, name)}`,
    )
    .join("\n");
  await writeFile(join(graveyard, ".record"), record);
  const liveness: LivenessSnapshot = {
    facts: () => expect.unreachable("no scratch origins"),
    openPaths: () =>
      expect.unreachable("deleted payloads need no process scan"),
    refresh: () => liveness,
  };
  const rows = await purgeCandidates({ RIP_GRAVEYARD: graveyard }, root, {
    ripOnly: true,
    now: now.epochMilliseconds,
    liveness,
  });
  // Metadata consumes bytes too, so expire the first two 5 GiB entries.
  expect(
    rows.filter((row) => row.verdict === "RECLAIM").map((row) => row.path),
  ).toEqual([join(graveyard, "locked"), join(graveyard, "oldest")]);
  expect(
    rows.find((row) => row.path === join(graveyard, "newest")),
  ).toMatchObject({ verdict: "KEEP" });
  expect(
    rows.find((row) => row.path === join(graveyard, ".record")),
  ).toMatchObject({
    verdict: "KEEP",
    reason: "required to restore kept graveyard entries",
  });
});

test("an oversized sparse subtree without a burial record is held", async () => {
  const root = await mkdtemp(join(tmpdir(), "rip-cap-oversized-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const payload = join(root, "oversized");
  await mkdir(payload);
  const file = await open(join(payload, "sparse"), "w");
  await file.truncate(RIP_GRAVEYARD_MAX_BYTES + 1);
  await file.close();
  const rows = await purgeCandidates({ RIP_GRAVEYARD: root }, root, {
    ripOnly: true,
  });
  expect(rows.find((row) => row.path === payload)).toMatchObject({
    verdict: "KEEP",
  });
  expect(rows.find((row) => row.path === payload)?.reason).toContain(
    "burial time unknown",
  );
  expect(
    rows.find((row) => row.id === "rip graveyard capacity shortfall")?.reason,
  ).toContain("1 unknown-burial payloads held");
});

test("timer work budgets retain progress and converge over two fresh runs", async () => {
  const root = await mkdtemp(join(tmpdir(), "timer-rip-budget-convergence-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const env = cliEnv(root);
  await writeFile(
    env.RECLAIM_CONFIG,
    `${await readFile(env.RECLAIM_CONFIG, "utf8")}\ngraveyard_min_age_hours = 24\ngraveyard_pressure_undo_minutes = 10\n\n[collection_policy.class_rules.ownerless_cache]\ndefault_owner = "dotfiles"\nttl_days = 14\n\n[collection_policy.class_rules.deregistered_index_db]\nttl_days = 7\n`,
  );
  await mkdir(env.RIP_GRAVEYARD);
  // Both name order and mtime disagree with rip's record time; all are <24h old.
  const names = ["z-oldest", "a-middle", "b-newest"];
  const records: string[] = [];
  for (const [index, name] of names.entries()) {
    const path = join(env.RIP_GRAVEYARD, name);
    await writeFile(path, "allocated bytes for the receipt");
    const file = await open(path, "r+");
    await file.truncate((index === 1 ? 5 : 6) * 1024 ** 3);
    await file.close();
    const time = Temporal.Now.instant().subtract({ minutes: 13 - index });
    records.push(`${time.toString()}\t/original/${name}\t${path}`);
    const mtime =
      Temporal.Now.instant().subtract({ hours: index + 1 }).epochMilliseconds /
      1000;
    await utimes(path, mtime, mtime);
  }
  const record = records.join("\n");
  await writeFile(join(env.RIP_GRAVEYARD, ".record"), record);
  const invoke = () =>
    expireGraveyard(
      false,
      async (stage) => {
        expect(stage.timeoutMs).toBe(180_000);
        const child = Bun.spawn(
          [
            process.execPath,
            join(import.meta.dir, "../fixtures/rip-budget-cli.ts"),
            ...stage.argv.slice(5),
          ],
          { env, stdout: "pipe", stderr: "pipe", timeout: stage.timeoutMs },
        );
        const [output, error, code] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        expect(error).toContain(
          "budget exhausted or cancelled; next timer continues oldest-first",
        );
        return { output, code, timedOut: child.signalCode !== null };
      },
      "mise",
    );
  const first = await invoke();
  expect(first.code).toBe(0);
  const firstPlan = jsonOf(Plan).safeParse(first.output);
  expect(firstPlan.success).toBe(true);
  if (!firstPlan.success) return;
  expect(
    firstPlan.data.targets[0]?.candidates
      .filter((row) => row.result?.ok === true)
      .map((row) => row.path),
  ).toEqual([join(env.RIP_GRAVEYARD, names[0] ?? "")]);
  expect(firstPlan.data.totals.freed_bytes).toBeGreaterThan(0);
  expect(inspectRipGraveyard(env.RIP_GRAVEYARD).bytes).toBeGreaterThan(
    RIP_GRAVEYARD_MAX_BYTES,
  );
  const second = await invoke();
  expect(second.code).toBe(0);
  const secondPlan = jsonOf(Plan).safeParse(second.output);
  expect(secondPlan.success).toBe(true);
  if (!secondPlan.success) return;
  expect(
    secondPlan.data.targets[0]?.candidates
      .filter((row) => row.result?.ok === true)
      .map((row) => row.path),
  ).toEqual([join(env.RIP_GRAVEYARD, names[1] ?? "")]);
  expect(inspectRipGraveyard(env.RIP_GRAVEYARD).bytes).toBeLessThanOrEqual(
    RIP_GRAVEYARD_MAX_BYTES,
  );
  expect(await readFile(join(env.RIP_GRAVEYARD, ".record"), "utf8")).toBe(
    record,
  );
  const receipt = await readFile(
    join(env.RECLAIM_STATE_DIR, "log.jsonl"),
    "utf8",
  );
  expect(receipt.trim().split("\n")).toHaveLength(2);
  expect(receipt).toContain("z-oldest");
  expect(receipt).toContain("a-middle");
}, 30_000);

test("a cancelled timer run logs completed graveyard expiry in its receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "timer-rip-cancel-receipt-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const env = cliEnv(root);
  await mkdir(env.RIP_GRAVEYARD);
  const first = join(env.RIP_GRAVEYARD, "oldest");
  const second = join(env.RIP_GRAVEYARD, "next");
  const time = Temporal.Now.instant().subtract({ hours: 48 });
  await writeFile(first, "first allocated payload");
  await writeFile(second, "next allocated payload");
  await writeFile(
    join(env.RIP_GRAVEYARD, ".record"),
    `${time.toString()}\t/original/oldest\t${first}\n${time.add({ hours: 1 }).toString()}\t/original/next\t${second}\n`,
  );
  const child = Bun.spawn(
    [
      process.execPath,
      join(import.meta.dir, "../fixtures/rip-budget-cli.ts"),
      "run",
      "rip-expire",
      "--yes",
      "--json",
      "--no-progress",
    ],
    {
      env: { ...env, RECLAIM_TEST_CANCEL_AFTER_ONE: "1" },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10_000,
    },
  );
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code).toBe(143);
  expect(error).toContain(`deleted before cancellation: ${first}`);
  expect(error).toContain("1 payloads expired");
  const plan = jsonOf(Plan).safeParse(output);
  expect(plan.success).toBe(true);
  if (!plan.success) return;
  expect(plan.data.totals.freed_bytes).toBeGreaterThan(0);
  expect(await stat(second).then(() => true)).toBe(true);
  const receipt = await readFile(
    join(env.RECLAIM_STATE_DIR, "log.jsonl"),
    "utf8",
  );
  expect(receipt).toContain(first);
  expect(receipt).toContain('"ok":true');
}, 15_000);
