import { expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  open,
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
import { jsonOf } from "../../../shared/src/zod.ts";
import { removeTree } from "../../src/lib/remove-tree.ts";

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

test("timer expires nested fresh rip payloads by ctime record order until bounded", async () => {
  const root = await mkdtemp(join(tmpdir(), "timer-rip-nested-ctime-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const env = cliEnv(root);
  const parent = join(env.RIP_GRAVEYARD, "home/user/workspaces");
  await mkdir(parent, { recursive: true });
  // Names and mtimes deliberately disagree with record order. All entries are
  // inside both the 24h retention period and the pressure undo window.
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
    const time = now.subtract({ minutes: 3 - index });
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

test("an oversized sparse subtree cannot remain below the logical-byte ceiling", async () => {
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
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ path: payload, verdict: "RECLAIM" });
  expect(rows[0]?.reason).toContain("oldest-first capacity expiry");
});
