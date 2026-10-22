import { afterAll, expect, test } from "bun:test";
import { chmod, mkdtemp, mkdir, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "../../shared/src/zod.ts";
import {
  buildLockHolderLaunch,
  buildSystemdLaunch,
  gpuAdmissionRefusal,
  gpuSlotPool,
  validateManifest,
  type ResourceManifest,
} from "../src/agent-resource-run.ts";

const runtime = await mkdtemp(`/run/user/${process.getuid?.()}/arr-test-`);
await symlink(`/run/user/${process.getuid?.()}/bus`, join(runtime, "bus"));
await symlink(
  `/run/user/${process.getuid?.()}/systemd`,
  join(runtime, "systemd"),
);
afterAll(() => rm(runtime, { recursive: true, force: true }));
const root = await mkdtemp(join(tmpdir(), "arr-thin-"));
afterAll(() => rm(root, { recursive: true, force: true }));
const runner = join(import.meta.dir, "../src/agent-resource-run.ts");
async function holderIdentity(processDir: string, pid: number, state = "S") {
  await mkdir(join(processDir, "task", String(pid)), { recursive: true });
  await Bun.write(
    join(processDir, "stat"),
    `${pid} (fixture) ${state} ${Array.from({ length: 18 }, () => "1").join(" ")} 100 23 24\n`,
  );
  await Bun.write(
    join(processDir, "status"),
    `State:\t${state}\nPid:\t${pid}\nTgid:\t${pid}\nNSpid:\t${pid}\n`,
  );
}
const manifest = (
  overrides: Partial<ResourceManifest> = {},
): ResourceManifest => ({
  schema: 1,
  job_id: `test-${crypto.randomUUID()}`,
  run_class: "test",
  cpu_threads: 1,
  processes: 8,
  host_ram_peak_bytes: 128 * 1024 ** 2,
  memory_bound: "bounded fixture",
  device: { kind: "cpu", gpu_status: "incompatible", rationale: "CPU fixture" },
  scratch_bytes: 2 * 1024 ** 3,
  child_fanout: 0,
  walltime_seconds: 10,
  cleanup: { mode: "term-then-kill", grace_seconds: 1 },
  ...overrides,
});
async function fixture(m = manifest()) {
  const dir = join(root, m.job_id);
  await mkdir(dir, { recursive: true });
  const path = join(dir, "manifest.json");
  await Bun.write(path, JSON.stringify(m));
  const policy = join(dir, "policy.toml");
  await Bun.write(
    policy,
    "schema=1\ngpu_max_concurrent_jobs=1\ngpu_safety_mib=512\n",
  );
  if (m.device.kind === "gpu")
    await Bun.write(
      join(dir, "gpu-owner.json"),
      JSON.stringify({
        schema: 1,
        attemptAt: 1,
        devices: [
          { id: m.device.gpu_id, totalMiB: 12288, usedMiB: 0, utilPct: 0 },
        ],
        processes: [],
        samples: [],
      }),
    );
  return {
    m,
    path,
    dir,
    env: {
      ...process.env,
      AGENT_RESOURCE_POLICY: policy,
      XDG_STATE_HOME: dir,
      XDG_RUNTIME_DIR: runtime,
      DBUS_SESSION_BUS_ADDRESS: `unix:path=/run/user/${process.getuid?.()}/bus`,
      AGENT_RESOURCE_ADMISSION_RECEIPT: undefined,
      AGENT_RESOURCE_SCOPE_LAUNCH: undefined,
      BUN_OPTIONS: `--preload ${join(import.meta.dir, "proc-integration-preload.ts")}`,
    },
  };
}
async function invoke(
  args: string[],
  env: Record<string, string | undefined> = process.env,
) {
  const child = Bun.spawn([process.execPath, runner, ...args], {
    env,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30000,
  });
  const [stdout, stderr, exit] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);
  return { stdout, stderr, exit };
}
const live = process.platform === "linux" && Bun.which("systemd-run") !== null;

test("operator default permits up to six concurrent GPU jobs", async () => {
  const parsed = z
    .object({
      schema: z.literal(1),
      gpu_max_concurrent_jobs: z.number().int().min(1),
    })
    .safeParse(
      Bun.TOML.parse(
        await Bun.file(join(import.meta.dir, "../resource-policy.toml")).text(),
      ),
    );
  expect(parsed.success).toBe(true);
  expect(parsed.success ? parsed.data.gpu_max_concurrent_jobs : undefined).toBe(
    6,
  );
});

test("GPU slot holders run in a caller-independent systemd scope", () => {
  expect(
    buildLockHolderLaunch("agent-resource-holder-test.scope", [
      "flock",
      "gpu.0",
    ]),
  ).toEqual([
    "systemd-run",
    "--user",
    "--scope",
    "--collect",
    "--unit=agent-resource-holder-test.scope",
    "--",
    "flock",
    "gpu.0",
  ]);
});

test.skipIf(!live)(
  "cleanup failure retains the slot until scope stop succeeds",
  async () => {
    const dir = await mkdtemp(join(root, "cleanup-"));
    const bin = join(dir, "bin");
    await mkdir(bin);
    const attempted = join(dir, "stop-attempted");
    const release = join(dir, "allow-stop");
    const lock = join(dir, "gpu.0");
    await Bun.write(
      join(bin, "systemctl"),
      `#!${process.execPath}
    if (process.argv.includes('show')) process.exit(0);
    await Bun.write(${JSON.stringify(attempted)}, 'attempted');
    if (!(await Bun.file(${JSON.stringify(release)}).exists())) {
      process.stderr.write('scope still active: stop failed\\n'); process.exit(1);
    }
  `,
      { mode: 0o755 },
    );
    await chmod(join(bin, "systemctl"), 0o755);
    const controller = Bun.spawn(
      [
        "flock",
        "-F",
        lock,
        process.execPath,
        join(import.meta.dir, "../src/scope-controller.ts"),
      ],
      {
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          AGENT_RESOURCE_SCOPE_LAUNCH: JSON.stringify({
            argv: ["true"],
            scope: "fixture.scope",
          }),
        },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 10000,
      },
    );
    for (let n = 0; n < 300 && !(await Bun.file(attempted).exists()); n++)
      await Bun.sleep(10);
    // Let the controller consume the failed stop before probing its lock.
    await Bun.sleep(150);
    const probe = Bun.spawn(["flock", "-n", "-E", "75", lock, "true"], {
      stdout: "ignore",
      stderr: "ignore",
      timeout: 1000,
    });
    const held = await probe.exited;
    await Bun.write(release, "scope may stop");
    const [stdout, stderr, exit] = await Promise.all([
      controller.stdout.text(),
      controller.stderr.text(),
      controller.exited,
    ]);
    expect(held, stdout + stderr).toBe(75);
    expect(exit, stdout + stderr).toBe(0);
    const released = Bun.spawn(["flock", "-n", "-E", "75", lock, "true"], {
      stdout: "ignore",
      stderr: "ignore",
      timeout: 1000,
    });
    expect(await released.exited).toBe(0);
  },
  15000,
);

test("manifest schema retains all P7 fields, bounds and compile slot extension", () => {
  expect(validateManifest(manifest()).isOk()).toBe(true);
  expect(
    validateManifest(manifest({ compile_slots: ["julia-compile"] })).isOk(),
  ).toBe(true);
  const invalid = [
    manifest({ host_ram_peak_bytes: 0 }),
    { ...manifest(), child_fanout: 1 },
    { ...manifest(), extra: 1 },
    manifest({ cpu_threads: 1025 }),
    manifest({ processes: 4097 }),
    manifest({ walltime_seconds: 86401 }),
    manifest({ compile_slots: ["julia-compile", "julia-compile"] }),
    {
      ...manifest(),
      device: { kind: "cpu", gpu_status: "compatible", rationale: "test" },
    },
  ];
  for (const value of invalid)
    expect(validateManifest(value).isErr()).toBe(true);
});
test("GPU pool identity is the manifest device id, independent of compile slots", () => {
  expect(gpuSlotPool(0)).toBe("gpu.0");
  expect(gpuSlotPool(1)).toBe("gpu.1");
  expect(
    validateManifest(
      manifest({
        compile_slots: ["julia-compile"],
        device: { kind: "gpu", gpu_id: 1, vram_peak_bytes: 1 },
      }),
    ).isOk(),
  ).toBe(true);
});
test("GPU admission refuses a recorded stall and reports its evidence", async () => {
  const f = await fixture();
  const procRoot = join(f.dir, "proc");
  await mkdir(procRoot);
  const state = {
    schema: 1 as const,
    attemptAt: 1,
    unresponsiveSince: 2,
    stallEvidence: "NVML probe timed out",
    devices: [{ id: 0, totalMiB: 12288, usedMiB: 0, utilPct: 0 }],
    processes: [],
    samples: [],
  };
  const refusal = await gpuAdmissionRefusal(
    { gpu_id: 0, vram_peak_bytes: 1 },
    512,
    { state, procRoot },
  );
  expect(refusal).toContain("NVML probe timed out");
  expect(refusal).toContain("gpu-owner.json");
});
test("GPU admission refuses an unadmitted zombie GPU holder", async () => {
  const f = await fixture();
  const procRoot = join(f.dir, "proc");
  const pid = 987654321;
  const processDir = join(procRoot, String(pid));
  await mkdir(processDir, { recursive: true });
  await Bun.write(
    join(processDir, "cgroup"),
    "0::/user.slice/unmanaged.scope\n",
  );
  await Bun.write(
    join(processDir, "status"),
    "Name:\ttest\nState:\tZ (zombie)\n",
  );
  await Bun.write(join(processDir, "cmdline"), "julia\\0runner.jl");
  await holderIdentity(processDir, pid, "Z");
  const state = {
    schema: 1 as const,
    attemptAt: 1,
    devices: [{ id: 0, totalMiB: 12288, usedMiB: 100, utilPct: 0 }],
    processes: [{ pid, usedMiB: 100 }],
    samples: [],
  };
  const refusal = await gpuAdmissionRefusal(
    { gpu_id: 0, vram_peak_bytes: 1 },
    512,
    { procRoot, state },
  );
  expect(refusal).toContain(`pid=${pid}`);
  expect(refusal).toContain("state=ZOMBIE");
  expect(refusal).toContain("cgroup");
});
test("GPU VRAM guard sums admitted job peaks against device total and safety margin", async () => {
  const f = await fixture();
  const procRoot = join(f.dir, "proc");
  const pid = 987654322;
  const processDir = join(procRoot, String(pid));
  await mkdir(processDir, { recursive: true });
  await Bun.write(
    join(processDir, "cgroup"),
    "0::/user.slice/agent-resource-existing.scope\n",
  );
  await Bun.write(
    join(processDir, "status"),
    "Name:\tjulia\nState:\tS (sleeping)\n",
  );
  await holderIdentity(processDir, pid);
  await Bun.write(
    join(processDir, "environ"),
    `AGENT_RESOURCE_ADMISSION_RECEIPT=${JSON.stringify({ device: { kind: "gpu", gpu_id: 0, vram_peak_bytes: 300 * 1024 ** 2 } })}\0`,
  );
  const state = {
    schema: 1 as const,
    attemptAt: 1,
    devices: [{ id: 0, totalMiB: 1024, usedMiB: 300, utilPct: 0 }],
    processes: [{ pid, usedMiB: 300 }],
    samples: [],
  };
  const refusal = await gpuAdmissionRefusal(
    { gpu_id: 0, vram_peak_bytes: 300 * 1024 ** 2 },
    512,
    { procRoot, state },
  );
  expect(refusal).toContain("GPU VRAM budget exceeded");
  expect(refusal).toContain("admitted=314572800");
  expect(refusal).toContain("safety_margin=512MiB");
});
test("GPU VRAM re-check deduplicates scopes sharing one reservation receipt", async () => {
  const f = await fixture();
  const procRoot = join(f.dir, "proc");
  const reservationId = "reservation-own";
  const receipt = JSON.stringify({
    reservation_id: reservationId,
    device: {
      kind: "gpu",
      gpu_id: 0,
      vram_peak_bytes: 7 * 1024 ** 3,
    },
  });
  const pids = [987654323, 987654324];
  for (const [index, pid] of pids.entries()) {
    const processDir = join(procRoot, String(pid));
    await mkdir(processDir, { recursive: true });
    await Bun.write(
      join(processDir, "cgroup"),
      `0::/user.slice/agent-resource-${index === 0 ? "job" : "holder"}.scope\n`,
    );
    await Bun.write(join(processDir, "status"), "State:\tS (sleeping)\n");
    await holderIdentity(processDir, pid);
    await Bun.write(
      join(processDir, "environ"),
      `AGENT_RESOURCE_ADMISSION_RECEIPT=${receipt}\0`,
    );
  }
  const state = {
    schema: 1 as const,
    attemptAt: 1,
    devices: [{ id: 0, totalMiB: 12288, usedMiB: 7516, utilPct: 0 }],
    processes: pids.map((pid) => ({ pid, usedMiB: 3758 })),
    samples: [],
  };
  const request = { gpu_id: 0, vram_peak_bytes: 7 * 1024 ** 3 };
  expect(
    await gpuAdmissionRefusal(request, 512, {
      procRoot,
      state,
      currentReservationId: reservationId,
    }),
  ).toBeUndefined();
  const concurrent = await gpuAdmissionRefusal(request, 512, {
    procRoot,
    state,
  });
  expect(concurrent).toContain("GPU VRAM budget exceeded");
  expect(concurrent).toContain(`admitted=${7 * 1024 ** 3}`);
});
test("scope properties include RAM, zero swap, quota, tasks, walltime and OOM policy", () => {
  const m = manifest();
  const argv = buildSystemdLaunch(m, "agent-resource-test.scope", ["true"]);
  for (const value of [
    "--user",
    "--scope",
    "--collect",
    `MemoryMax=${m.host_ram_peak_bytes}`,
    `MemoryHigh=${m.host_ram_peak_bytes}`,
    "MemorySwapMax=0",
    "CPUQuota=100%",
    "TasksMax=136",
    "RuntimeMaxSec=10",
    "OOMPolicy=kill",
  ])
    expect(argv).toContain(value);
});
test("CLI retains version, help, unknown flag and malformed manifest exits", async () => {
  const pkg = (await import("../package.json")).default;
  expect((await invoke(["--version"])).stdout.trim()).toBe(
    `agent-resource-run ${pkg.version}`,
  );
  const help = await invoke(["--help"]);
  for (const flag of ["--manifest", "--check-only", "--job-id", "--slot"])
    expect(help.stdout).toContain(flag);
  expect((await invoke(["-Z"])).exit).toBe(1);
  expect((await invoke(["--__proto__"])).exit).toBe(2);
  expect((await invoke([])).exit).toBe(2);
  const f = await fixture();
  await Bun.write(f.path, "{}");
  expect(
    (await invoke(["--manifest", f.path, "--check-only"], f.env)).exit,
  ).toBe(2);
}, 30000);
for (const stopMode of ["real-stop", "false-success"])
  test.skipIf(!live)(
    `GPU slot remains held until a wrapper's surviving child and scope have ended (${stopMode})`,
    async () => {
      const f = await fixture(
        manifest({ device: { kind: "gpu", gpu_id: 0, vram_peak_bytes: 1 } }),
      );
      const events = join(f.dir, "scope-events");
      const scopeFile = join(f.dir, "scope");
      const ready = join(f.dir, "child-ready");
      const wrapper = join(f.dir, "wrapper.ts");
      const child = join(f.dir, "child.ts");
      await Bun.write(
        child,
        `
      process.on('SIGTERM', async () => {
        await Bun.sleep(250);
        await Bun.write(${JSON.stringify(events)}, 'child-ended\\n');
        process.exit(0);
      });
      await Bun.write(${JSON.stringify(ready)}, 'ready');
      await Bun.sleep(1800);
      await Bun.write(${JSON.stringify(events)}, 'child-ended\\n');
    `,
      );
      await Bun.write(
        wrapper,
        `
      await Bun.write(${JSON.stringify(scopeFile)}, JSON.parse(process.env.AGENT_RESOURCE_ADMISSION_RECEIPT).scope_unit);
      // Bun closes unrelated descriptors: the child cannot retain the flock for us.
      Bun.spawn([process.execPath, ${JSON.stringify(child)}], {stdin:'ignore',stdout:'ignore',stderr:'ignore'}).unref();
      while (!(await Bun.file(${JSON.stringify(ready)}).exists())) await Bun.sleep(10);
    `,
      );
      const firstEnv: Record<string, string | undefined> = { ...f.env };
      if (stopMode === "false-success") {
        const bin = join(f.dir, "bin");
        await mkdir(bin);
        // Simulate a stop that reports success while the real scope stays populated.
        await Bun.write(
          join(bin, "systemctl"),
          `#!${process.execPath}
        if(process.argv.includes('stop')) process.exit(0);
        const child=Bun.spawn([${JSON.stringify(Bun.which("systemctl"))},...process.argv.slice(2)],{stdin:'inherit',stdout:'inherit',stderr:'inherit'});
        process.exit(await child.exited);
      `,
        );
        await chmod(join(bin, "systemctl"), 0o755);
        firstEnv.PATH = `${bin}:${process.env.PATH}`;
      }
      const first = invoke(
        ["--manifest", f.path, "--", process.execPath, wrapper],
        firstEnv,
      );
      for (let n = 0; n < 300 && !(await Bun.file(ready).exists()); n++)
        await Bun.sleep(10);
      expect(await Bun.file(ready).exists()).toBe(true);
      const second = invoke(
        [
          "--manifest",
          f.path,
          "--job-id",
          `second-${crypto.randomUUID()}`,
          "--",
          process.execPath,
          "-e",
          `const fs=await import('node:fs/promises');
       const scope=await Bun.file(${JSON.stringify(scopeFile)}).text();
       const probe=Bun.spawn(['systemctl','--user','is-active',scope],{stdout:'pipe',stderr:'pipe'});
       const [state,,code]=await Promise.all([probe.stdout.text(),probe.stderr.text(),probe.exited]);
       if(code===0 || state.trim()==='deactivating') process.exit(42);
       await fs.appendFile(${JSON.stringify(events)},'second-started\\n');`,
        ],
        f.env,
      );
      const results = await Promise.all([first, second]);
      for (const result of results)
        expect(result.exit, result.stdout + result.stderr).toBe(0);
      if (stopMode === "false-success")
        expect(results[0]?.stderr).toContain("scope cgroup still populated");
      expect(await Bun.file(events).text()).toBe(
        "child-ended\nsecond-started\n",
      );
    },
    15000,
  );
test.skipIf(!live)(
  "all caller invocation shapes and job-id/slot flags still execute",
  async () => {
    const f = await fixture();
    const slots = join(f.dir, "slots.toml");
    await Bun.write(slots, "schema=1\njulia_compile=1\n");
    for (const flags of [
      [],
      ["--job-id", `override-${crypto.randomUUID()}`],
      ["--slot", "julia-compile"],
    ]) {
      const result = await invoke(
        ["--manifest", f.path, ...flags, "--", "/bin/sh", "-c", "exit 23"],
        { ...f.env, AGENT_RESOURCE_SLOTS: slots },
      );
      expect(result.exit, result.stderr).toBe(23);
      expect(result.stdout).toContain("ADMIT job=");
      expect(result.stdout).toContain("RELEASE job=");
    }
    expect(
      (await invoke(["--manifest", f.path, "--check-only"], f.env)).exit,
    ).toBe(0);
    expect(
      (
        await invoke(
          ["--manifest", f.path, "--check-only", "--", "true"],
          f.env,
        )
      ).exit,
    ).toBe(2);
  },
  30000,
);
test.skipIf(!live)(
  "real GPU admission re-check admits one 7 GiB job and refuses a concurrent second",
  async () => {
    const requestBytes = 7 * 1024 ** 3;
    const f = await fixture(
      manifest({
        device: { kind: "gpu", gpu_id: 0, vram_peak_bytes: requestBytes },
      }),
    );
    const policy = join(f.dir, "policy-concurrent.toml");
    await Bun.write(
      policy,
      "schema=1\ngpu_max_concurrent_jobs=2\ngpu_safety_mib=512\n",
    );
    f.env.AGENT_RESOURCE_POLICY = policy;
    const marker = join(f.dir, "first-job-started");
    const first = invoke(
      [
        "--manifest",
        f.path,
        "--",
        process.execPath,
        "-e",
        `
          const fs = await import('node:fs/promises');
          await fs.writeFile(${JSON.stringify(marker)}, 'admitted');
          await Bun.sleep(3000);
        `,
      ],
      f.env,
    );
    for (let n = 0; n < 1000 && !(await Bun.file(marker).exists()); n++)
      await Bun.sleep(10);
    expect(await Bun.file(marker).exists()).toBe(true);
    const secondManifest = manifest({
      device: { kind: "gpu", gpu_id: 0, vram_peak_bytes: requestBytes },
    });
    const second = await invoke(
      ["--manifest", f.path, "--job-id", secondManifest.job_id, "--", "true"],
      f.env,
    );
    expect(second.exit, second.stdout + second.stderr).toBe(69);
    expect(second.stdout).toContain("GPU VRAM budget exceeded");
    expect(second.stdout).toContain(`admitted=${requestBytes}`);
    const firstResult = await first;
    expect(firstResult.exit, firstResult.stdout + firstResult.stderr).toBe(0);
    expect(firstResult.stdout).toContain("ADMIT job=");
  },
  30000,
);
test.skipIf(!live)(
  "scope exposes per-run pids.peak and intact inherited polysearch admission",
  async () => {
    const f = await fixture(
      manifest({ host_ram_peak_bytes: 1536 * 1024 ** 2 }),
    );
    const result = await invoke(
      [
        "--manifest",
        f.path,
        "--",
        process.execPath,
        "-e",
        `
    const fs = await import('node:fs/promises'); const crypto = await import('node:crypto');
    const payload=process.env.AGENT_RESOURCE_ADMISSION_RECEIPT;
    const receipt=JSON.parse(payload); const group=(await fs.readFile('/proc/self/cgroup','utf8')).trim().split('::')[1];
    const root='/sys/fs/cgroup'+group;
    const peak=Number(await fs.readFile(root+'/pids.peak','utf8'));
    if(!group.endsWith(receipt.scope_unit) || !(peak>=1 && peak<136)) process.exit(41);
    if(crypto.createHash('sha256').update(payload).digest('hex')!==process.env.AGENT_RESOURCE_ADMISSION_RECEIPT_SHA256) process.exit(42);
    if(process.env.AGENT_RESOURCE_ENFORCEMENT!=='cgroup' || process.env.AGENT_RESOURCE_CPU_IDS.split(',').length!==1
      || Number(process.env.AGENT_RESOURCE_MAX_PROCESSES)<8 || Number(process.env.AGENT_RESOURCE_HOST_RAM_BYTES)<1610612736
      || Number(process.env.AGENT_RESOURCE_SCRATCH_BYTES)<2147483648) process.exit(43);
    console.log('CGROUP',group,'PEAK',peak);
    const child=Bun.spawn([process.execPath,${JSON.stringify(runner)},'--manifest',${JSON.stringify(f.path)},'--','true'],{stdout:'pipe',stderr:'pipe'});
    const [out,err,code]=await Promise.all([child.stdout.text(),child.stderr.text(),child.exited]);
    console.log(out,err);if(code!==69 || !out.includes('nested reservation refused')) process.exit(44);
  `,
      ],
      f.env,
    );
    expect(result.exit, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain("CGROUP");
    expect(result.stdout).toContain("nested reservation refused");
  },
  15000,
);
test.skipIf(!live)(
  "two fake GPU jobs on one slot never overlap; status names the holder",
  async () => {
    const f = await fixture(
      manifest({ device: { kind: "gpu", gpu_id: 0, vram_peak_bytes: 1 } }),
    );
    const log = join(f.dir, "events");
    const job = (name: string) =>
      invoke(
        [
          "--manifest",
          f.path,
          "--job-id",
          `${name}-${crypto.randomUUID()}`,
          "--",
          "/bin/sh",
          "-c",
          `[ "$AGENT_RESOURCE_VRAM_BYTES" = 1 ] || exit 42; echo start-${name} >> '${log}'; sleep 1; echo end-${name} >> '${log}'`,
        ],
        f.env,
      );
    const first = job("a");
    for (let n = 0; n < 100 && !(await Bun.file(log).exists()); n++)
      await Bun.sleep(20);
    const second = job("b");
    const status = await invoke(["status"], f.env);
    expect(status.exit, status.stderr).toBe(0);
    expect(status.stdout).toContain("gpu.0");
    expect(status.stdout).toContain("GPU_OWNER");
    const results = await Promise.all([first, second]);
    for (const result of results) expect(result.exit, result.stderr).toBe(0);
    expect((await readFile(log, "utf8")).trim().split("\n")).toEqual([
      "start-a",
      "end-a",
      "start-b",
      "end-b",
    ]);
  },
  15000,
);
test.skipIf(!live)(
  "flock queue timeout is 75 and duplicate job id remains DENY 69",
  async () => {
    const f = await fixture(
      manifest({
        walltime_seconds: 1,
        device: { kind: "gpu", gpu_id: 0, vram_peak_bytes: 1 },
      }),
    );
    const locksRoot = join(runtime, "agent-resource");
    await mkdir(join(locksRoot, "slots"), { recursive: true });
    const blocker = Bun.spawn(
      ["flock", "-F", join(locksRoot, "slots/gpu.0.0"), "sleep", "3"],
      { stdout: "ignore", stderr: "ignore", timeout: 5000 },
    );
    await Bun.sleep(100);
    const timed = await invoke(["--manifest", f.path, "--", "true"], f.env);
    expect(timed.exit, timed.stderr).toBe(75);
    expect(timed.stdout).toContain("flock wait expired");
    await blocker.exited;
    const marker = join(f.dir, "started");
    const a = await fixture(manifest());
    const running = invoke(
      [
        "--manifest",
        a.path,
        "--",
        "/bin/sh",
        "-c",
        `touch '${marker}'; sleep 8`,
      ],
      a.env,
    );
    for (let n = 0; n < 500 && !(await Bun.file(marker).exists()); n++)
      await Bun.sleep(20);
    expect(
      (await invoke(["--manifest", a.path, "--", "true"], a.env)).exit,
    ).toBe(69);
    expect((await running).exit).toBe(0);
  },
  15000,
);
test.skipIf(!live)(
  "RAM ceiling causes a scope OOM kill and passes through exit 137",
  async () => {
    const f = await fixture(manifest({ host_ram_peak_bytes: 96 * 1024 ** 2 }));
    const result = await invoke(
      [
        "--manifest",
        f.path,
        "--",
        process.execPath,
        "-e",
        "const a=[];for(;;){a.push(Buffer.alloc(8*1024*1024,1));}",
      ],
      f.env,
    );
    expect(result.exit, result.stdout + result.stderr).toBe(137);
    expect(result.stdout).toContain("RELEASE job=");
    const unit = result.stderr.match(/agent-resource-[a-z0-9-]+\.scope/u)?.[0];
    expect(unit).toBeDefined();
    const journal = Bun.spawn(
      ["journalctl", "--user", "-u", unit!, "--no-pager", "-n", "20"],
      { stdout: "pipe", stderr: "pipe", timeout: 5000 },
    );
    const [log, errors, exit] = await Promise.all([
      journal.stdout.text(),
      journal.stderr.text(),
      journal.exited,
    ]);
    expect(exit, errors).toBe(0);
    expect(log).toContain("oom-kill");
  },
  15000,
);
test.skipIf(!live)(
  "RuntimeMaxSec ends a walltime overrun without a runner monitor",
  async () => {
    const f = await fixture(manifest({ walltime_seconds: 1 }));
    const start = performance.now();
    const result = await invoke(
      ["--manifest", f.path, "--", "sleep", "20"],
      f.env,
    );
    expect(result.exit, result.stdout + result.stderr).toBe(143);
    expect(performance.now() - start).toBeLessThan(6000);
  },
  10000,
);
test("recorded stall DENY contains evidence and GPU-holding pid/command", async () => {
  const f = await fixture(
    manifest({ device: { kind: "gpu", gpu_id: 0, vram_peak_bytes: 1 } }),
  );
  await Bun.write(
    join(f.dir, "gpu-owner.json"),
    JSON.stringify({
      schema: 1,
      attemptAt: Temporal.Now.instant().epochMilliseconds,
      unresponsiveSince: Temporal.Now.instant().epochMilliseconds,
      stallEvidence: "probe timed out twice",
      devices: [],
      processes: [{ pid: process.pid, usedMiB: null }],
      samples: [],
    }),
  );
  const result = await invoke(["--manifest", f.path, "--", "true"], f.env);
  expect(result.exit, result.stderr).toBe(69);
  for (const value of [
    "probe timed out twice",
    "gpu-owner.json",
    String(process.pid),
    "bun",
  ])
    expect(result.stdout).toContain(value);
});

test("fresh recovery HOLD retains exit 70", async () => {
  const f = await fixture();
  const home = join(f.dir, "home");
  const state = join(home, ".local/state/wsl-capacity-recover");
  await mkdir(state, { recursive: true });
  await Bun.write(
    join(state, "latest-verdict.json"),
    JSON.stringify({
      schema: 1,
      verdict: "HOLD",
      memory_emergency: true,
      windows_available_mb: 100,
      recorded_at: Temporal.Now.instant().toString(),
    }),
  );
  const result = await invoke(["--manifest", f.path, "--", "true"], {
    ...f.env,
    HOME: home,
  });
  expect(result.exit, result.stdout + result.stderr).toBe(70);
  expect(result.stdout).toContain("HOLD RECOVER_VERDICT");
}, 10000);

test.skipIf(!live)(
  "caller argv snapshots preserve downstream flags without executing consumer work",
  async () => {
    const f = await fixture();
    const bin = join(f.dir, "bin");
    await mkdir(bin);
    for (const tool of ["mise", "cargo", "julia"]) {
      await Bun.write(
        join(bin, tool),
        `#!${process.execPath}\nprocess.stdout.write('CALLER '+JSON.stringify(process.argv.slice(2))+'\\n');\n`,
        { mode: 0o755 },
      );
      await chmod(join(bin, tool), 0o755);
    }
    const callers = [
      {
        name: "firedancer launcher/launch.ts via launch_checks.ts",
        flags: ["--job-id", "launcher-gpu-0-exclusive"],
        argv: [
          "mise",
          "exec",
          "--",
          "bun",
          "launcher/launch.ts",
          "--exec-in-snapshot",
          "sealed-rev",
          "--",
          "julia",
          "--project=envs/gpu",
          "runner.jl",
        ],
      },
      {
        name: "firedancer launcher/jq_submit.py",
        flags: [],
        argv: ["julia", "--project=envs/gpu", "runner.jl"],
      },
      {
        name: "polysearch-v1 mise.toml up",
        flags: [],
        argv: ["cargo", "update", "--workspace"],
      },
      {
        name: "polysearch-v1 mise.toml up:check",
        flags: [],
        argv: ["cargo", "update", "--workspace", "--dry-run"],
      },
      {
        name: "polysearch-v1 scripts/gate-timings.ts",
        flags: ["--job-id", "polysearch-v1-gate-fixture"],
        argv: [
          "cargo",
          "test",
          "-j1",
          "--workspace",
          "--no-run",
          "--message-format=json",
        ],
      },
    ];
    for (const caller of callers) {
      const result = await invoke(
        ["--manifest", f.path, ...caller.flags, "--", ...caller.argv],
        { ...f.env, PATH: `${bin}:${process.env.PATH}` },
      );
      expect(result.exit, caller.name + result.stdout + result.stderr).toBe(0);
      expect(result.stdout).toContain(
        `CALLER ${JSON.stringify(caller.argv.slice(1))}`,
      );
    }
    // jq_capacity.py consumes these policy fields without any runner invocation.
    const decodedPolicy = z
      .record(z.string(), z.unknown())
      .safeParse(
        Bun.TOML.parse(
          await readFile(
            join(import.meta.dir, "../resource-policy.toml"),
            "utf8",
          ),
        ),
      );
    expect(decodedPolicy.success).toBe(true);
    if (!decodedPolicy.success) return;
    const policy = decodedPolicy.data;
    for (const key of [
      "min_host_ram_safety_gib",
      "host_ram_safety_fraction",
      "gpu_partition_device",
      "gpu_partition_ccc_mib",
      "gpu_safety_mib",
    ])
      expect(typeof policy[key]).toBe("number");
  },
  60000,
);
