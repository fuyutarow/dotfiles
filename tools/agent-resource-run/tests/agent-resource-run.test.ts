import { afterAll, expect, spyOn, test } from "bun:test";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "../../shared/src/zod.ts";
import {
  buildLockHolderLaunch,
  buildSystemdLaunch,
  gpuAdmissionRefusal,
  validateManifest,
  type ResourceManifest,
} from "../src/agent-resource-run.ts";
import {
  effectiveMemoryLimitsMatch,
  kernelPageSizeBytes,
} from "../src/lib/cgroup-memory-limits.ts";

// Holder identity only contributes an advisory diagnostic, never a refusal.
async function advisoryAdmission(
  ...args: Parameters<typeof gpuAdmissionRefusal>
) {
  const warning = spyOn(console, "error").mockImplementation(() => {});
  using _restoreWarning = {
    [Symbol.dispose]: () => {
      warning.mockRestore();
    },
  };
  expect(await gpuAdmissionRefusal(...args)).toBeUndefined();
  const lines = warning.mock.calls.map(([line]) => String(line));
  for (const line of lines)
    expect(line).toStartWith(
      "WARN GPU holder check is advisory, not refusing: ",
    );
  return lines.join("\n");
}

const runtimeBase = process.env.AGX_TEST_RUNTIME_DIR ?? "/tmp";
const runtime = await mkdtemp(join(runtimeBase, "arr-test-"));
afterAll(() => rm(runtime, { recursive: true, force: true }));
const privateSocketPath = join(runtime, "systemd", "private");
const privateSocketPathBytes = new TextEncoder().encode(
  privateSocketPath,
).byteLength;
expect(
  privateSocketPathBytes,
  `AGENT_RESOURCE_TEST_RUNTIME_SOCKET_PATH_TOO_LONG: ${privateSocketPath} is ${privateSocketPathBytes} bytes; must be below 108 bytes. Set AGX_TEST_RUNTIME_DIR to a shorter writable base.`,
).toBeLessThan(108);
await symlink(`/run/user/${process.getuid?.()}/bus`, join(runtime, "bus"));
await symlink(
  `/run/user/${process.getuid?.()}/systemd`,
  join(runtime, "systemd"),
);
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
    "schema=1\ngpu_max_concurrent_jobs=1\ngpu_safety_mib=512\nmemory_high_fraction=0.9\n",
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
  timeout = 30000,
) {
  const child = Bun.spawn([process.execPath, runner, ...args], {
    env,
    stdout: "pipe",
    stderr: "pipe",
    timeout,
  });
  const [stdout, stderr, exit] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);
  return { stdout, stderr, exit };
}
const live = process.platform === "linux" && Bun.which("systemd-run") !== null;

test("operator policy declares GPU concurrency and a sub-max memory-high fraction", async () => {
  const parsed = z
    .object({
      schema: z.literal(1),
      gpu_max_concurrent_jobs: z.number().int().min(1),
      memory_high_fraction: z.number().gt(0).lt(1),
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
  expect(parsed.success ? parsed.data.memory_high_fraction : undefined).toBe(
    0.9,
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

test("minimal manifest is accepted and retains its hard-limit systemd properties", () => {
  const minimal = {
    schema: 1,
    job_id: "minimal-manifest",
    cpu_threads: 1,
    processes: 8,
    host_ram_peak_bytes: 128 * 1024 ** 2,
    device: { kind: "cpu" },
    walltime_seconds: 10,
    cleanup: { mode: "term-then-kill", grace_seconds: 1 },
  };
  const parsed = validateManifest(minimal);
  expect(parsed.isOk()).toBe(true);
  if (parsed.isErr()) return;
  const argv = buildSystemdLaunch(
    parsed.value,
    "agent-resource-minimal.scope",
    ["true"],
    0.9,
  );
  for (const value of [
    `MemoryMax=${minimal.host_ram_peak_bytes}`,
    `MemoryHigh=${Math.floor(minimal.host_ram_peak_bytes * 0.9)}`,
    "MemorySwapMax=0",
    "CPUQuota=100%",
    "TasksMax=136",
    "RuntimeMaxSec=10",
    "OOMPolicy=kill",
    "TimeoutStopSec=1",
  ])
    expect(argv).toContain(value);
});
test("old full manifest remains accepted with byte-identical systemd arguments", () => {
  const oldFullManifest = manifest();
  expect(validateManifest(oldFullManifest).isOk()).toBe(true);
  expect(
    JSON.stringify(
      buildSystemdLaunch(
        oldFullManifest,
        "agent-resource-test.scope",
        ["true"],
        0.9,
      ),
    ),
  ).toBe(
    JSON.stringify([
      "systemd-run",
      "--user",
      "--scope",
      "--collect",
      "--unit=agent-resource-test.scope",
      "-p",
      "MemoryMax=134217728",
      "-p",
      "MemoryHigh=120795955",
      "-p",
      "MemorySwapMax=0",
      "-p",
      "CPUQuota=100%",
      "-p",
      "TasksMax=136",
      "-p",
      "RuntimeMaxSec=10",
      "-p",
      "OOMPolicy=kill",
      "-p",
      "TimeoutStopSec=1",
      "--",
      "true",
    ]),
  );
});
test("missing or invalid host RAM hard limit remains rejected", () => {
  const { host_ram_peak_bytes: _hardLimit, ...missingHardLimit } = manifest();
  expect(validateManifest(missingHardLimit).isErr()).toBe(true);
  expect(validateManifest(manifest({ host_ram_peak_bytes: 0 })).isErr()).toBe(
    true,
  );
});
test("manifest schema retains bounds and compile slot extension", () => {
  expect(validateManifest(manifest()).isOk()).toBe(true);
  expect(
    validateManifest(manifest({ compile_slots: ["julia-compile"] })).isOk(),
  ).toBe(true);
  const invalid = [
    { ...manifest(), child_fanout: 1 },
    { ...manifest(), extra: 1 },
    manifest({ cpu_threads: 1025 }),
    manifest({ processes: 4097 }),
    manifest({ walltime_seconds: 86401 }),
    manifest({ compile_slots: ["julia-compile", "julia-compile"] }),
  ];
  for (const value of invalid)
    expect(validateManifest(value).isErr()).toBe(true);
});
test("GPU manifests remain independent of compile slots", () => {
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
test("GPU admission warns about an unadmitted zombie GPU holder without refusing", async () => {
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
  const warning = await advisoryAdmission(
    { gpu_id: 0, vram_peak_bytes: 1 },
    512,
    { procRoot, state },
  );
  expect(warning).toContain(`pid=${pid}`);
  expect(warning).toContain("state=ZOMBIE");
  expect(warning).toContain("cgroup");
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
    devices: [{ id: 0, totalMiB: 3072, usedMiB: 300, utilPct: 0 }],
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
test("scope properties set MemoryHigh to the declared fraction below MemoryMax", async () => {
  const m = manifest();
  const policy = Bun.TOML.parse(
    await Bun.file(join(import.meta.dir, "../resource-policy.toml")).text(),
  );
  const parsedPolicy = z
    .object({ memory_high_fraction: z.number().gt(0).lt(1) })
    .safeParse(policy);
  expect(parsedPolicy.success).toBe(true);
  if (!parsedPolicy.success) return;
  const fraction = parsedPolicy.data.memory_high_fraction;
  const memoryHigh = Math.floor(m.host_ram_peak_bytes * fraction);
  const argv = buildSystemdLaunch(
    m,
    "agent-resource-test.scope",
    ["true"],
    fraction,
  );
  for (const value of [
    "--user",
    "--scope",
    "--collect",
    `MemoryMax=${m.host_ram_peak_bytes}`,
    `MemoryHigh=${memoryHigh}`,
    "MemorySwapMax=0",
    "CPUQuota=100%",
    "TasksMax=136",
    "RuntimeMaxSec=10",
    "OOMPolicy=kill",
  ])
    expect(argv).toContain(value);
  expect(memoryHigh).toBeLessThan(m.host_ram_peak_bytes);
});

test("effective cgroup memory limits accept page-aligned readbacks", () => {
  const pageSizeBytes = 4096;
  const memoryMaxBytes = 128 * 1024 ** 2 + 1;
  const memoryHighBytes = Math.floor(memoryMaxBytes * 0.9);
  const roundedMax = Math.floor(memoryMaxBytes / pageSizeBytes) * pageSizeBytes;
  const roundedHigh =
    Math.floor(memoryHighBytes / pageSizeBytes) * pageSizeBytes;
  expect(
    kernelPageSizeBytes(
      "00400000-00452000 r-xp 0 00:00 0\nKernelPageSize: 4 kB\n",
    ),
  ).toBe(pageSizeBytes);
  expect(
    effectiveMemoryLimitsMatch(
      {
        memoryMax: String(roundedMax),
        memoryHigh: String(roundedHigh),
        memorySwapMax: "0",
        pidsPeak: "1",
      },
      { memoryMaxBytes, memoryHighBytes },
      pageSizeBytes,
    ),
  ).toBe(true);
  const roundedUpMax =
    Math.ceil(memoryMaxBytes / pageSizeBytes) * pageSizeBytes;
  const roundedUpHigh =
    Math.ceil(memoryHighBytes / pageSizeBytes) * pageSizeBytes;
  expect(
    effectiveMemoryLimitsMatch(
      {
        memoryMax: String(roundedUpMax),
        memoryHigh: String(roundedUpHigh),
        memorySwapMax: "0",
        pidsPeak: "1",
      },
      { memoryMaxBytes, memoryHighBytes },
      pageSizeBytes,
    ),
  ).toBe(true);
  expect(
    effectiveMemoryLimitsMatch(
      {
        memoryMax: String(roundedMax),
        memoryHigh: String(roundedMax),
        memorySwapMax: "0",
        pidsPeak: "1",
      },
      { memoryMaxBytes, memoryHighBytes },
      pageSizeBytes,
    ),
  ).toBe(false);
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
    `GPU holder retains the output lock until a wrapper's surviving child and scope end (${stopMode})`,
    async () => {
      const f = await fixture(
        manifest({
          output_lock: "holder-lifetime",
          host_ram_peak_bytes: 512 * 1024 ** 2,
          cleanup: { mode: "term-then-kill", grace_seconds: 3 },
          device: { kind: "gpu", gpu_id: 0, vram_peak_bytes: 1 },
        }),
      );
      const events = join(f.dir, "scope-events");
      const ready = join(f.dir, "child-ready");
      const wrapperDone = join(f.dir, "wrapper-done");
      const wrapper = join(f.dir, "wrapper.ts");
      const child = join(f.dir, "child.ts");
      await Bun.write(
        child,
        `
      process.on('SIGTERM', async () => {
        await Bun.sleep(1000);
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
      // Bun closes unrelated descriptors: the child cannot retain the flock for us.
      Bun.spawn([process.execPath, ${JSON.stringify(child)}], {stdin:'ignore',stdout:'ignore',stderr:'ignore'}).unref();
      while (!(await Bun.file(${JSON.stringify(ready)}).exists())) await Bun.sleep(10);
      await Bun.write(${JSON.stringify(wrapperDone)}, 'done');
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
        [
          "--manifest",
          f.path,
          "--job-id",
          "holder-lifetime",
          "--",
          process.execPath,
          wrapper,
        ],
        firstEnv,
      );
      for (let n = 0; n < 300 && !(await Bun.file(wrapperDone).exists()); n++)
        await Bun.sleep(10);
      expect(await Bun.file(wrapperDone).exists()).toBe(true);
      const duplicate = await invoke(
        ["--manifest", f.path, "--job-id", "holder-lifetime", "--", "true"],
        f.env,
      );
      expect(duplicate.exit, duplicate.stdout + duplicate.stderr).toBe(69);
      expect(duplicate.stdout).toContain(
        "output_lock=holder-lifetime already held",
      );
      const firstResult = await first;
      expect(firstResult.exit, firstResult.stdout + firstResult.stderr).toBe(0);
      if (stopMode === "false-success")
        expect(firstResult.stderr).toContain("scope cgroup still populated");
      const afterCleanup = await invoke(
        [
          "--manifest",
          f.path,
          "--job-id",
          "holder-lifetime",
          "--",
          "/bin/sh",
          "-c",
          `echo second-started >> '${events}'`,
        ],
        f.env,
      );
      expect(afterCleanup.exit, afterCleanup.stdout + afterCleanup.stderr).toBe(
        0,
      );
      expect(await Bun.file(events).text()).toBe(
        "child-ended\nsecond-started\n",
      );
    },
    15000,
  );
test.skipIf(!live)(
  "compile slot compatibility forms launch without reading capacity or taking a slot",
  async () => {
    const manifestForm = await fixture(
      manifest({ compile_slots: ["julia-compile"] }),
    );
    const flagForm = await fixture();
    const slots = join(manifestForm.dir, "slots.toml");
    await Bun.write(slots, "this is deliberately invalid TOML");
    for (const [f, flags] of [
      [manifestForm, []],
      [flagForm, ["--slot", "julia-compile"]],
    ] as const) {
      const result = await invoke(
        ["--manifest", f.path, ...flags, "--", "/bin/sh", "-c", "exit 23"],
        { ...f.env, AGENT_RESOURCE_SLOTS: slots },
      );
      expect(result.exit, result.stderr).toBe(23);
      expect(result.stdout).toContain("ADMIT job=");
      expect(result.stdout).toContain("RELEASE job=");
      const names = await readdir(join(runtime, "agent-resource", "slots"));
      expect(names.filter((name) => name.startsWith("julia-compile."))).toEqual(
        [],
      );
    }
    const f = manifestForm;
    for (const flags of [[], ["--job-id", `override-${crypto.randomUUID()}`]]) {
      const result = await invoke(
        ["--manifest", f.path, ...flags, "--", "/bin/sh", "-c", "exit 23"],
        f.env,
      );
      expect(result.exit, result.stderr).toBe(23);
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
      "schema=1\ngpu_max_concurrent_jobs=2\ngpu_safety_mib=512\nmemory_high_fraction=0.9\n",
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
    const second = await invoke(["--manifest", f.path, "--", "true"], f.env);
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
  "scope exposes per-run pids.peak and intact inherited example-search admission",
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
  "same-label GPU reservations remain distinct and are all counted",
  async () => {
    const f = await fixture(
      manifest({
        device: { kind: "gpu", gpu_id: 0, vram_peak_bytes: 1024 ** 3 },
      }),
    );
    const started = join(f.dir, "started");
    const release = join(f.dir, "release");
    await mkdir(started);
    const jobs = Array.from({ length: 7 }, (_, index) => {
      const name = `job-${index}`;
      return invoke(
        [
          "--manifest",
          f.path,
          "--job-id",
          "shared-reservation-label",
          "--",
          "/bin/sh",
          "-c",
          `[ "$AGENT_RESOURCE_VRAM_BYTES" = 1073741824 ] || exit 42; printf '%s' "$AGENT_RESOURCE_RESERVATION_ID" > '${started}/${name}'; while [ ! -e '${release}' ]; do sleep 0.02; done`,
        ],
        f.env,
      );
    });
    let names: string[] = [];
    for (let n = 0; n < 400; n++) {
      names = await readdir(started);
      if (names.length === 7) break;
      await Bun.sleep(25);
    }
    const reservationIds = await Promise.all(
      names.map((name) => Bun.file(join(started, name)).text()),
    );
    const extraPath = join(f.dir, "over-budget-manifest.json");
    await Bun.write(
      extraPath,
      JSON.stringify(
        manifest({
          job_id: "shared-reservation-label",
          device: { kind: "gpu", gpu_id: 0, vram_peak_bytes: 5 * 1024 ** 3 },
        }),
      ),
    );
    const overBudget = await invoke(
      ["--manifest", extraPath, "--", "true"],
      f.env,
    );
    await Bun.write(release, "release");
    const results = await Promise.all(jobs);
    expect(names).toHaveLength(7);
    expect(new Set(reservationIds).size).toBe(7);
    expect(overBudget.exit, overBudget.stdout + overBudget.stderr).toBe(69);
    expect(overBudget.stdout).toContain(`admitted=${7 * 1024 ** 3}`);
    for (const result of results) expect(result.exit, result.stderr).toBe(0);
    const slotNames = await readdir(join(runtime, "agent-resource", "slots"));
    expect(slotNames.filter((name) => /^gpu\.0\.\d+$/u.test(name))).toEqual([]);
  },
  30000,
);
test.skipIf(!live)(
  "same job id label allows independent reservations to run concurrently",
  async () => {
    const a = await fixture(manifest());
    const started = join(a.dir, "started");
    await mkdir(started);
    const first = invoke(
      [
        "--manifest",
        a.path,
        "--",
        "/bin/sh",
        "-c",
        `touch '${started}/first'; sleep 3`,
      ],
      a.env,
    );
    for (
      let n = 0;
      n < 500 && !(await Bun.file(join(started, "first")).exists());
      n++
    )
      await Bun.sleep(20);
    const second = invoke(
      [
        "--manifest",
        a.path,
        "--",
        "/bin/sh",
        "-c",
        `touch '${started}/second'; sleep 3`,
      ],
      a.env,
    );
    for (
      let n = 0;
      n < 500 && !(await Bun.file(join(started, "second")).exists());
      n++
    )
      await Bun.sleep(20);
    expect(await Bun.file(join(started, "second")).exists()).toBe(true);
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.exit, firstResult.stdout + firstResult.stderr).toBe(0);
    expect(secondResult.exit, secondResult.stdout + secondResult.stderr).toBe(
      0,
    );
  },
  15000,
);
test.skipIf(!live)(
  "same output lock key refuses a concurrent writer with DENY 69",
  async () => {
    const a = await fixture(manifest({ output_lock: "shared-output" }));
    const marker = join(a.dir, "started");
    const running = invoke(
      [
        "--manifest",
        a.path,
        "--",
        "/bin/sh",
        "-c",
        `touch '${marker}'; sleep 5`,
      ],
      a.env,
    );
    for (let n = 0; n < 500 && !(await Bun.file(marker).exists()); n++)
      await Bun.sleep(20);
    const secondManifest = await fixture(
      manifest({ output_lock: "shared-output" }),
    );
    secondManifest.env.XDG_STATE_HOME = a.env.XDG_STATE_HOME;
    const denied = await invoke(
      ["--manifest", secondManifest.path, "--", "true"],
      secondManifest.env,
    );
    expect(denied.exit, denied.stdout + denied.stderr).toBe(69);
    expect(denied.stdout).toContain("output_lock=shared-output already held");
    expect((await running).exit).toBe(0);
  },
  15000,
);
test.skipIf(!live)(
  "RAM ceiling causes a scope OOM kill and passes through exit 137",
  async () => {
    const f = await fixture(manifest({ host_ram_peak_bytes: 96 * 1024 ** 2 }));
    const oomPolicy = join(f.dir, "policy-oom.toml");
    await Bun.write(
      oomPolicy,
      "schema=1\ngpu_max_concurrent_jobs=1\ngpu_safety_mib=512\nmemory_high_fraction=0.99\n",
    );
    f.env.AGENT_RESOURCE_POLICY = oomPolicy;
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
    if (unit === undefined) expect.unreachable("missing scope unit");
    const journal = Bun.spawn(
      ["journalctl", "--user", "-u", unit, "--no-pager", "-n", "20"],
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
        name: "example-repo launcher/launch.ts via launch_checks.ts",
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
        name: "example-repo launcher/jq_submit.py",
        flags: [],
        argv: ["julia", "--project=envs/gpu", "runner.jl"],
      },
      {
        name: "example-search-v1 mise.toml up",
        flags: [],
        argv: ["cargo", "update", "--workspace"],
      },
      {
        name: "example-search-v1 mise.toml up:check",
        flags: [],
        argv: ["cargo", "update", "--workspace", "--dry-run"],
      },
      {
        name: "example-search-v1 scripts/gate-timings.ts",
        flags: ["--job-id", "example-search-v1-gate-fixture"],
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
