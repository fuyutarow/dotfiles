import { expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DecisionRecord,
  MAX_RECORD_BYTES,
  MAX_RECORDS,
  RETENTION_MS,
  saveDecision,
  DecisionRecordSchema,
} from "../src/lib/decision-record.ts";
import { jsonOf } from "../../shared/src/zod.ts";

const runner = join(import.meta.dir, "../src/agent-resource-run.ts");
const preload = join(import.meta.dir, "decision-record-preload.ts");
const fixtures = join(import.meta.dir, "fixtures");
const procStat = (pid: string, state: string, start: string) =>
  `${pid} (fixture worker) ${state} ${Array.from({ length: 18 }, () => "1").join(" ")} ${start} 23 24\n`;
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "arr-record-"));
  const bin = join(root, "bin");
  await mkdir(bin);
  await mkdir(join(root, "proc"));
  // The commands exercise the actual controller/scope child with filesystem fixtures.
  await Bun.write(
    join(bin, "systemctl"),
    `#!${process.execPath}\nprocess.exit(0);\n`,
  );
  await Bun.write(
    join(bin, "systemd-run"),
    `#!${process.execPath}\nconst args=process.argv.slice(2); const child=Bun.spawn(args.slice(args.indexOf('--')+1),{stdin:'inherit',stdout:'inherit',stderr:'inherit'}); process.exit(await child.exited);\n`,
  );
  await chmod(join(bin, "systemctl"), 0o755);
  await chmod(join(bin, "systemd-run"), 0o755);
  await mkdir(join(root, "proc/self"));
  await Bun.write(join(root, "proc/self/status"), "Cpus_allowed_list:\t0-7\n");
  await Bun.write(
    join(root, "policy.toml"),
    "schema=1\ngpu_max_concurrent_jobs=1\ngpu_safety_mib=512\n",
  );
  await Bun.write(
    join(root, "gpu-owner.json"),
    JSON.stringify({
      schema: 1,
      attemptAt: 1,
      sampledAt: 1,
      devices: [{ id: 0, totalMiB: 8192, usedMiB: 0, utilPct: 0 }],
      processes: [],
      samples: [],
    }),
  );
  const manifest = {
    schema: 1,
    job_id: "record-fixture",
    run_class: "test",
    cpu_threads: 1,
    processes: 1,
    host_ram_peak_bytes: 1024 ** 2,
    memory_bound: "fixture",
    device: { kind: "gpu", gpu_id: 0, vram_peak_bytes: 1 },
    scratch_bytes: 0,
    child_fanout: 0,
    walltime_seconds: 5,
    cleanup: { mode: "term-then-kill", grace_seconds: 1 },
  };
  await Bun.write(join(root, "manifest.json"), JSON.stringify(manifest));
  return {
    root,
    manifest,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      XDG_STATE_HOME: root,
      XDG_RUNTIME_DIR: root,
      AGENT_RESOURCE_POLICY: join(root, "policy.toml"),
      ARR_RECORD_FIXTURE_ROOT: root,
      BUN_OPTIONS: `--preload ${preload}`,
      AGENT_RESOURCE_ADMISSION_RECEIPT: undefined,
      AGENT_RESOURCE_DECISION_ID: undefined,
    },
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
}
async function stalled(root: string, tgid: string, tid: string) {
  await mkdir(join(root, "proc", tgid, "task", tid), { recursive: true });
  await Bun.write(join(root, "proc", tgid, "stat"), procStat(tgid, "S", "100"));
  await Bun.write(
    join(root, "proc", tgid, "task", tid, "stat"),
    procStat(tid, "D", "200"),
  );
  await Bun.write(
    join(root, "proc", tgid, "task", tid, "wchan"),
    "dxgvmb_send_sync_msg\n",
  );
}
async function invoke(argv: string[], env: Record<string, string | undefined>) {
  const child = Bun.spawn([process.execPath, ...argv], {
    env,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10000,
  });
  const [stdout, stderr, exit] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);
  return { stdout, stderr, exit };
}
async function records(root: string) {
  const directory = join(root, "agent-resource/decisions");
  const names = await readdir(directory);
  const rows = await Promise.all(
    names.map(async (name) => {
      const parsed = jsonOf(DecisionRecordSchema).safeParse(
        await readFile(join(directory, name), "utf8"),
      );
      expect(parsed.success).toBe(true);
      return parsed.success ? parsed.data : undefined;
    }),
  );
  return rows.filter((row) => row !== undefined);
}
for (const shape of [
  "commandless-deny",
  "commandless-admit",
  "scope-entry-deny",
])
  test(`real log shape: ${shape} preserves decision and observation evidence`, async () => {
    await using f = await fixture();
    const raw = await readFile(join(fixtures, `${shape}.log`), "utf8");
    const identity = /tgid=(\d+) tid=(\d+)/u.exec(raw);
    if (identity !== null) {
      const tgid = identity[1];
      const tid = identity[2];
      if (tgid === undefined || tid === undefined)
        expect.unreachable("missing fixture process identity");
      await stalled(f.root, tgid, tid);
    }
    const checkOnly = shape !== "scope-entry-deny";
    const result = await invoke(
      [
        runner,
        "--manifest",
        join(f.root, "manifest.json"),
        ...(checkOnly ? ["--check-only"] : ["--", "true"]),
      ],
      f.env,
    );
    expect(result.exit, result.stdout + result.stderr).toBe(0);
    const rows = await records(f.root);
    expect(rows).toHaveLength(1);
    const record = rows[0];
    if (record === undefined) expect.unreachable("missing decision record");
    expect(record.stage).toBe(checkOnly ? "precheck" : "command");
    expect(record.launched).toBe(!checkOnly);
    expect(record.outcome).toBe("admit");
    expect(record.decision_id).toMatch(/^[a-f0-9-]{36}$/u);
    expect(record.started_at).toEndWith("Z");
    expect(record.decided_at).toEndWith("Z");
    expect(record.monotonic_span_ms).toBeGreaterThanOrEqual(0);
    expect(record.omitted_observations).toBe(0);
    const sampled = record.observations.find((row) => row.input === "cached");
    expect(sampled?.sample_time).toBe("1970-01-01T00:00:00.001Z");
    if (identity !== null) {
      const observations = record.observations.filter(
        (row) =>
          row.tid === identity[2] && row.wchan === "dxgvmb_send_sync_msg",
      );
      expect(observations).toHaveLength(10);
      for (const observation of observations) {
        expect(observation).toMatchObject({
          tgid: identity[1],
          tid: identity[2],
          starttime: "200",
          state: "D",
          wchan: "dxgvmb_send_sync_msg",
          read_status: "read",
          input: "live",
          sample_time: null,
        });
        expect(observation.utc).toEndWith("Z");
        expect(observation.branch).toContain("wchan");
      }
      expect(record.branch).toContain("persistent dxg stall");
      expect(record.reason_code).toBe("dxg-suspected");
      expect(result.stderr).toContain("WARN dxg-suspected:");
      expect(result.stdout).not.toContain("DENY");
    }
    expect(result.stderr).not.toContain("scope enforcement unavailable");
  });

test("launched workload exit 69 stays a command exit, including through the controller", async () => {
  await using f = await fixture();
  const result = await invoke(
    [
      runner,
      "--manifest",
      join(f.root, "manifest.json"),
      "--",
      process.execPath,
      "-e",
      "process.exit(69)",
    ],
    f.env,
  );
  expect(result.exit, result.stdout + result.stderr).toBe(69);
  expect(result.stdout).toContain("RELEASE job=record-fixture code=69");
  expect(result.stdout + result.stderr).not.toContain(
    "reservation not granted",
  );
  const [record] = await records(f.root);
  expect(record).toMatchObject({
    stage: "command",
    launched: true,
    outcome: "admit",
    reason_code: "admitted",
    exit_code: 69,
  });
});

test("unreadable and missing observation fields are explicit without altering the refusal", () => {
  const record = new DecisionRecord();
  record.read("/proc/123/stat", undefined, "unreadable");
  expect(record.observations[0]).toMatchObject({
    tgid: "123",
    tid: "123",
    starttime: null,
    state: null,
    wchan: null,
    read_status: "unreadable",
    input: "live",
    sample_time: null,
  });
});

test("record bytes, retained count and age are bounded", async () => {
  await using f = await fixture();
  const previous = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = f.root;
  using _restoreState = {
    [Symbol.dispose]: () => {
      if (previous === undefined) delete process.env.XDG_STATE_HOME;
      else process.env.XDG_STATE_HOME = previous;
    },
  };
  {
    const record = new DecisionRecord();
    for (let n = 0; n < 10000; n++)
      record.read("/proc/123/stat", procStat("123", "D", "200"), "read");
    expect(record.omitted_observations).toBeGreaterThan(0);
    expect(Buffer.byteLength(JSON.stringify(record.snapshot()))).toBeLessThan(
      MAX_RECORD_BYTES,
    );
    for (let n = 0; n < MAX_RECORDS + 2; n++)
      await saveDecision(new DecisionRecord().snapshot());
    const directory = join(f.root, "agent-resource/decisions");
    const names = await readdir(directory);
    expect(names).toHaveLength(MAX_RECORDS);
    const recordName = names[0];
    if (recordName === undefined) expect.unreachable("missing retained record");
    const old = join(directory, recordName);
    const seconds =
      (Temporal.Now.instant().epochMilliseconds - RETENTION_MS - 1000) / 1000;
    await utimes(old, seconds, seconds);
    await saveDecision(new DecisionRecord().snapshot());
    expect(await Bun.file(old).exists()).toBe(false);
    for (const name of await readdir(directory))
      expect((await stat(join(directory, name))).size).toBeLessThanOrEqual(
        MAX_RECORD_BYTES,
      );
  }
});

for (const latch of ["set", "cleared"] as const)
  test(`production owner file latch ${latch} during confirmation determines admission`, async () => {
    await using f = await fixture();
    await stalled(f.root, "123", "456");
    const owner = {
      schema: 1,
      attemptAt: 1,
      sampledAt: 1,
      devices: [{ id: 0, totalMiB: 8192, usedMiB: 0, utilPct: 0 }],
      processes: [],
      samples: [],
    };
    await Bun.write(
      join(f.root, "gpu-owner.json"),
      JSON.stringify({
        ...owner,
        ...(latch === "cleared" ? { unresponsiveSince: 1 } : {}),
      }),
    );
    await Bun.write(
      join(f.root, "next-owner.json"),
      JSON.stringify({
        ...owner,
        ...(latch === "set" ? { unresponsiveSince: 2 } : {}),
      }),
    );
    const result = await invoke(
      [runner, "--manifest", join(f.root, "manifest.json"), "--check-only"],
      { ...f.env, ARR_RECORD_REPLACE_OWNER: "1" },
    );
    expect(result.exit, result.stdout + result.stderr).toBe(
      latch === "set" ? 69 : 0,
    );
    const [record] = await records(f.root);
    expect(record?.outcome).toBe(latch === "set" ? "refuse" : "admit");
    expect(
      record?.observations.some((row) => row.branch === "gpu-sampler-decision"),
    ).toBe(true);
    if (latch === "set")
      expect(result.stdout).toContain("GPU stall recorded since 2");
    else expect(record?.reason_code).toBe("dxg-suspected");
  });
