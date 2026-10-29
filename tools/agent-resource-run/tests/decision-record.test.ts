import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DecisionRecordSchema } from "../src/lib/decision-record.ts";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";

const runner = join(import.meta.dir, "../src/agent-resource-run.ts");
const preload = join(import.meta.dir, "decision-record-preload.ts");
const fixtures = join(import.meta.dir, "fixtures");
const invocationId = "00112233445566778899aabbccddeeff";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "arr-record-"));
  const bin = join(root, "bin");
  await mkdir(bin);
  await mkdir(join(root, "proc/self"), { recursive: true });
  await Bun.write(
    join(bin, "systemctl"),
    `#!${process.execPath}
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
const root = process.env.ARR_RECORD_FIXTURE_ROOT;
const args = process.argv.slice(2);
if (args.includes("stop")) {
  const path = join(root, "stop-count");
  let count = 0;
  try { count = Number(await readFile(path, "utf8")); } catch {}
  count += 1;
  await writeFile(path, String(count));
  if (count === 2 && process.env.ARR_RECORD_FAIL_PARENT_STOP === "1") {
    process.stderr.write("fixture parent scope stop failed");
    process.exit(1);
  }
}
if (args.includes("ControlGroup")) process.stdout.write("/fixture/scope\\n");
process.exit(0);
`,
  );
  await Bun.write(
    join(bin, "systemd-run"),
    `#!${process.execPath}
const args = process.argv.slice(2);
const child = Bun.spawn(args.slice(args.indexOf("--") + 1), {
  env: { ...process.env, INVOCATION_ID: "${invocationId}" },
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(await child.exited);
`,
  );
  await chmod(join(bin, "systemctl"), 0o755);
  await chmod(join(bin, "systemd-run"), 0o755);
  await Bun.write(join(root, "proc/self/status"), "Cpus_allowed_list:\t0-7\n");
  await Bun.write(
    join(root, "proc/self/smaps"),
    "KernelPageSize:        4 kB\n",
  );
  await Bun.write(
    join(root, "policy.toml"),
    "schema=1\ngpu_max_concurrent_jobs=1\ngpu_safety_mib=512\ngpu_partition_device=0\ngpu_partition_ccc_mib=2048\nmemory_high_fraction=0.9\n",
  );
  const manifest = {
    schema: 1,
    job_id: "record-fixture",
    run_class: "test",
    cpu_threads: 1,
    processes: 1,
    host_ram_peak_bytes: 1024 ** 2,
    memory_bound: "fixture",
    device: {
      kind: "cpu",
      gpu_status: "not-beneficial",
      rationale: "record fixture",
    },
    scratch_bytes: 0,
    child_fanout: 0,
    walltime_seconds: 5,
    cleanup: { mode: "term-then-kill", grace_seconds: 1 },
  };
  await Bun.write(join(root, "manifest.json"), JSON.stringify(manifest));
  return {
    root,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env["PATH"]}`,
      XDG_STATE_HOME: root,
      XDG_RUNTIME_DIR: root,
      AGENT_RESOURCE_POLICY: join(root, "policy.toml"),
      ARR_RECORD_FIXTURE_ROOT: root,
      BUN_OPTIONS: `--preload ${preload}`,
      AGENT_RESOURCE_ADMISSION_RECEIPT: undefined,
      AGENT_RESOURCE_DECISION_ID: undefined,
      INVOCATION_ID: undefined,
    },
    manifestPath: join(root, "manifest.json"),
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
}

async function invoke(
  f: Awaited<ReturnType<typeof fixture>>,
  args: string[],
  overrides: Record<string, string | undefined> = {},
) {
  const child = Bun.spawn(
    [process.execPath, runner, "--manifest", f.manifestPath, ...args],
    {
      env: { ...f.env, ...overrides },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10000,
    },
  );
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
  expect(names.every((name) => name.endsWith(".json"))).toBe(true);
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

async function expectFixture(
  row: Awaited<ReturnType<typeof records>>[number] | undefined,
  name: string,
) {
  if (row === undefined) expect.unreachable("missing decision record");
  const parsedExpected = jsonOf(z.record(z.string(), z.unknown())).safeParse(
    await readFile(join(fixtures, name), "utf8"),
  );
  if (!parsedExpected.success)
    expect.unreachable(`invalid decision fixture ${name}`);
  const expected = parsedExpected.data;
  expect(row).toMatchObject(expected);
  expect(Object.keys(row).toSorted()).toEqual(
    [
      "decision_id",
      "systemd_unit",
      "invocation_id",
      "stage",
      "launched",
      "reason",
      "timestamp",
      "final_status",
    ].toSorted(),
  );
  expect(row.decision_id).toMatch(/^[a-f0-9-]{36}$/u);
  expect(row.timestamp).toEndWith("Z");
}

test("commandless refusal writes one precheck decision", async () => {
  await using f = await fixture();
  const result = await invoke(f, ["--check-only"], {
    AGENT_RESOURCE_ADMISSION_RECEIPT: "inherited reservation",
  });
  expect(result.exit).toBe(69);
  const rows = await records(f.root);
  expect(rows).toHaveLength(1);
  await expectFixture(rows[0], "commandless-refusal.json");
  expect(rows[0]?.systemd_unit).toBeNull();
  expect(rows[0]?.invocation_id).toBeNull();
});

test("scope-entry refusal keeps its unit and invocation link", async () => {
  await using f = await fixture();
  const result = await invoke(f, ["--", "true"], {
    ARR_SCOPE_MISMATCH: "1",
  });
  expect(result.exit, result.stdout + result.stderr).toBe(69);
  const rows = await records(f.root);
  expect(rows).toHaveLength(1);
  await expectFixture(rows[0], "scope-entry-refusal.json");
  expect(rows[0]?.systemd_unit).toMatch(/^agent-resource-[a-f0-9-]+\.scope$/u);
  expect(rows[0]?.invocation_id).toBe(invocationId);
});

for (const code of [69, 75] as const)
  test(`launched command exit ${code} remains a command outcome`, async () => {
    await using f = await fixture();
    const result = await invoke(f, [
      "--",
      process.execPath,
      "-e",
      `process.exit(${code})`,
    ]);
    expect(result.exit, result.stdout + result.stderr).toBe(code);
    expect(result.stdout).toContain(`RELEASE job=record-fixture code=${code}`);
    expect(result.stdout).not.toContain("reservation not granted");
    if (code === 75)
      expect(result.stdout).not.toContain("admission lock wait expired");
    const rows = await records(f.root);
    expect(rows).toHaveLength(1);
    await expectFixture(rows[0], `command-exit-${code}.json`);
    expect(rows[0]?.systemd_unit).toMatch(
      /^agent-resource-[a-f0-9-]+\.scope$/u,
    );
    expect(rows[0]?.invocation_id).toBe(invocationId);
  });

test("cleanup uncertainty remains separate from the launched command result", async () => {
  await using f = await fixture();
  const result = await invoke(
    f,
    ["--", process.execPath, "-e", "process.exit(0)"],
    { ARR_RECORD_FAIL_PARENT_STOP: "1" },
  );
  expect(result.exit, result.stdout + result.stderr).toBe(70);
  const rows = await records(f.root);
  expect(rows).toHaveLength(1);
  await expectFixture(rows[0], "cleanup-uncertain.json");
  expect(rows[0]?.systemd_unit).toMatch(/^agent-resource-[a-f0-9-]+\.scope$/u);
  expect(rows[0]?.invocation_id).toBe(invocationId);
});
