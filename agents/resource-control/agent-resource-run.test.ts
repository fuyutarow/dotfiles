import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  buildSystemdLaunch,
  commandEnvironment,
  createAdmissionReceipt,
  decideAdmission,
  checkJob,
  executeJob,
  kernelTasksMax,
  parseCpuList,
  probeKernelEnforcement,
  probeHostSnapshot,
  manifestSourceFromBytes,
  scopeUnitFor,
  validateManifest,
  verifyAdmissionReceipt,
  type HostSnapshot,
  type ResourceManifest,
  type Reservation,
} from "./agent-resource-run.ts";

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;

function cpuManifest(
  overrides: Partial<ResourceManifest> = {},
): ResourceManifest {
  return {
    schema: 1,
    job_id: "test-job",
    run_class: "test",
    cpu_threads: 1,
    processes: 2,
    host_ram_peak_bytes: 128 * MiB,
    memory_bound: "measured shell baseline plus 64 MiB margin",
    device: {
      kind: "cpu",
      gpu_status: "incompatible",
      rationale: "the fixture only validates process control",
    },
    scratch_bytes: 0,
    child_fanout: 0,
    walltime_seconds: 5,
    cleanup: { mode: "term-then-kill", grace_seconds: 1 },
    ...overrides,
  };
}

function hostSnapshot(overrides: Partial<HostSnapshot> = {}): HostSnapshot {
  return {
    allowed_cpu_ids: [0, 1, 2, 3, 4, 5, 6, 7],
    mem_total_bytes: 32 * GiB,
    mem_available_bytes: 24 * GiB,
    scratch_available_bytes: 100 * GiB,
    gpus: [
      {
        id: 0,
        total_bytes: 12 * GiB,
        used_bytes: 2 * GiB,
        utilization_percent: 0,
      },
    ],
    ...overrides,
  };
}

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    schema: 1,
    reservation_id: "existing-1",
    job_id: "other-job",
    controller_pid: process.pid,
    cpu_ids: [0],
    host_ram_peak_bytes: GiB,
    scratch_bytes: 0,
    device: { kind: "cpu" },
    started_at: new Date().toISOString(),
    ...overrides,
  };
}

function gpuManifest(
  overrides: Partial<ResourceManifest> = {},
): ResourceManifest {
  return cpuManifest({
    device: { kind: "gpu", gpu_id: 0, vram_peak_bytes: 2 * GiB },
    ...overrides,
  });
}

function gpuReservation(
  name: string,
  vramBytes = 2 * GiB,
  gpuId = 0,
): Reservation {
  return reservation({
    reservation_id: name,
    job_id: `job-${name}`,
    device: { kind: "gpu", gpu_id: gpuId, vram_peak_bytes: vramBytes },
  });
}

function manifestSourceFor(manifest: ResourceManifest) {
  return manifestSourceFromBytes(
    "fixtures/test.resource.json",
    Buffer.from(JSON.stringify(manifest), "utf8"),
  );
}

const temporaryDirectories: string[] = [];
function temporaryStateDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), "agent-resource-test-"));
  temporaryDirectories.push(path);
  return path;
}

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("resource manifest", () => {
  test("parses Linux CPU list ranges without duplicates", () => {
    expect(parseCpuList("0-2,4,6-7,2")).toEqual([0, 1, 2, 4, 6, 7]);
  });

  test("accepts a complete bounded CPU manifest", () => {
    expect(validateManifest(cpuManifest())).toEqual(cpuManifest());
  });

  test("rejects an unbounded memory claim and nested agent fanout", () => {
    expect(() =>
      validateManifest({
        ...cpuManifest(),
        memory_bound: "",
      }),
    ).toThrow(/memory_bound/);
    expect(() =>
      validateManifest({ ...cpuManifest(), child_fanout: 1 }),
    ).toThrow(/child_fanout/);
  });
});

describe("admission", () => {
  test("GPU-first rejects CPU when a compatible idle GPU has headroom", () => {
    const manifest = cpuManifest({
      device: {
        kind: "cpu",
        gpu_status: "compatible",
        gpu_vram_peak_bytes: 4 * GiB,
        rationale: "CPU fallback only if no compatible GPU is available",
      },
    });
    const result = decideAdmission(manifest, hostSnapshot(), []);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("gpu-first");
  });

  test("allows an explicit CPU fallback when compatible GPUs lack headroom", () => {
    const manifest = cpuManifest({
      device: {
        kind: "cpu",
        gpu_status: "compatible",
        gpu_vram_peak_bytes: 10 * GiB,
        rationale: "GPU has insufficient free VRAM at admission",
      },
    });
    const result = decideAdmission(manifest, hostSnapshot(), []);
    expect(result.ok).toBe(true);
  });

  test("subtracts concurrent reservations and preserves system headroom", () => {
    const existing = reservation({
      cpu_ids: [0, 1],
      host_ram_peak_bytes: 3 * GiB,
    });
    const manifest = cpuManifest({
      cpu_threads: 2,
      host_ram_peak_bytes: 2 * GiB,
    });
    const result = decideAdmission(
      manifest,
      hostSnapshot({ mem_available_bytes: 8 * GiB }),
      [existing],
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("host RAM");
  });

  test("packs several declared GPU jobs onto one device", () => {
    const result = decideAdmission(gpuManifest(), hostSnapshot(), [
      gpuReservation("a"),
      gpuReservation("b"),
    ]);
    expect(result).toMatchObject({
      ok: true,
      device: { kind: "gpu", gpu_id: 0, vram_peak_bytes: 2 * GiB },
    });
  });

  test("aggregates declared VRAM and denies the job that overflows the device", () => {
    const snapshot = hostSnapshot({
      gpus: [
        { id: 0, total_bytes: 12 * GiB, used_bytes: 0, utilization_percent: 0 },
      ],
    });
    const result = decideAdmission(gpuManifest(), snapshot, [
      gpuReservation("a", 5 * GiB),
      gpuReservation("b", 5 * GiB),
    ]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("VRAM request");
    expect(result.reason).toContain(`${1536 * MiB} available`);
  });

  test("observed device usage still floors the ledger above the declarations", () => {
    const snapshot = hostSnapshot({
      gpus: [
        {
          id: 0,
          total_bytes: 12 * GiB,
          used_bytes: 9 * GiB,
          utilization_percent: 0,
        },
      ],
    });
    const held = [gpuReservation("a", 2 * GiB)];
    expect(decideAdmission(gpuManifest(), snapshot, held).ok).toBe(true);
    expect(
      decideAdmission(
        gpuManifest({
          device: { kind: "gpu", gpu_id: 0, vram_peak_bytes: 3 * GiB },
        }),
        snapshot,
        held,
      ).ok,
    ).toBe(false);
  });

  test("utilization screens unmanaged load but not a job's own reservations", () => {
    const busy = hostSnapshot({
      gpus: [
        {
          id: 0,
          total_bytes: 12 * GiB,
          used_bytes: 2 * GiB,
          utilization_percent: 97,
        },
      ],
    });
    const unmanaged = decideAdmission(gpuManifest(), busy, []);
    expect(unmanaged.ok).toBe(false);
    expect(unmanaged.reason).toContain("97% utilization");
    expect(decideAdmission(gpuManifest(), busy, [gpuReservation("a")]).ok).toBe(
      true,
    );
  });

  test("caps concurrent jobs on one device even when VRAM is abundant", () => {
    const result = decideAdmission(gpuManifest(), hostSnapshot(), [
      gpuReservation("a", 128 * MiB),
      gpuReservation("b", 128 * MiB),
      gpuReservation("c", 128 * MiB),
      gpuReservation("d", 128 * MiB),
    ]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("concurrency cap");
  });

  test("reservations on another device do not consume this device's ledger", () => {
    const snapshot = hostSnapshot({
      gpus: [
        { id: 0, total_bytes: 12 * GiB, used_bytes: 0, utilization_percent: 0 },
        { id: 1, total_bytes: 12 * GiB, used_bytes: 0, utilization_percent: 0 },
      ],
    });
    const result = decideAdmission(gpuManifest(), snapshot, [
      gpuReservation("elsewhere", 11 * GiB, 1),
    ]);
    expect(result.ok).toBe(true);
  });

  test("rejects a duplicate live job id", () => {
    const result = decideAdmission(cpuManifest(), hostSnapshot(), [
      reservation({ job_id: "test-job" }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("already reserved");
  });
});

describe("kernel enforcement", () => {
  test("maps the envelope to a user-systemd scope", () => {
    const manifest = cpuManifest({ cpu_threads: 2, processes: 3 });
    const launch = buildSystemdLaunch(
      manifest,
      reservation({
        reservation_id: "controller-1",
        cpu_ids: [2, 3],
      }),
      ["sh", "-c", "true"],
    );

    expect(kernelTasksMax(manifest)).toBe(54);
    expect(launch).toMatchObject({
      scopeUnit: "agent-resource-controller-1.scope",
      tasksMax: 54,
    });
    expect(launch.argv).toContain("--property=CPUQuota=200%");
    expect(launch.argv).toContain(`--property=MemoryHigh=${128 * MiB}`);
    expect(launch.argv).toContain(`--property=MemoryMax=${128 * MiB}`);
    expect(launch.argv).toContain("--property=MemorySwapMax=0");
    expect(launch.argv).toContain("--property=TasksMax=54");
    expect(launch.argv).toContain("--property=OOMPolicy=kill");
    expect(launch.argv.slice(-6)).toEqual([
      "taskset",
      "-c",
      "2,3",
      "sh",
      "-c",
      "true",
    ]);
  });

  test("MemoryHigh and MemoryMax both equal the declared envelope, no runner-added margin (2026-09-04 incident)", () => {
    const declared = 28 * GiB;
    const manifest = cpuManifest({ host_ram_peak_bytes: declared });
    const launch = buildSystemdLaunch(manifest, reservation(), ["true"]);
    expect(launch.argv).toContain(`--property=MemoryHigh=${declared}`);
    expect(launch.argv).toContain(`--property=MemoryMax=${declared}`);
    // No multiplier anywhere: both properties cite the exact declared byte count.
    const memoryProps = launch.argv.filter((a) =>
      a.startsWith("--property=Memory"),
    );
    for (const prop of memoryProps) {
      if (prop.startsWith("--property=MemorySwapMax=")) continue;
      expect(prop.endsWith(`=${declared}`)).toBe(true);
    }
  });

  test("the current host accepts the required user-systemd properties", () => {
    expect(probeKernelEnforcement()).toEqual({ available: true });
  });

  test("binds the reserved VRAM budget inside the job's CUDA runtime", () => {
    const manifest = gpuManifest();
    const reserved = reservation({
      reservation_id: "controller-1",
      job_id: manifest.job_id,
      host_ram_peak_bytes: manifest.host_ram_peak_bytes,
      scratch_bytes: manifest.scratch_bytes,
      device: { kind: "gpu", gpu_id: 0, vram_peak_bytes: 2 * GiB },
    });
    const environment = commandEnvironment(
      manifest,
      reserved,
      createAdmissionReceipt(
        manifestSourceFor(manifest),
        reserved,
        "admit-gpu",
      ),
    );
    expect(environment).toMatchObject({
      CUDA_VISIBLE_DEVICES: "0",
      AGENT_RESOURCE_VRAM_BYTES: String(2 * GiB),
      JULIA_CUDA_HARD_MEMORY_LIMIT: String(2 * GiB),
      JULIA_CUDA_SOFT_MEMORY_LIMIT: String(Math.floor(2 * GiB * 0.9)),
    });
  });

  test("leaves no CUDA budget behind on a CPU reservation", () => {
    const manifest = cpuManifest();
    const reserved = reservation({
      job_id: manifest.job_id,
      host_ram_peak_bytes: manifest.host_ram_peak_bytes,
      scratch_bytes: manifest.scratch_bytes,
    });
    const environment = commandEnvironment(
      manifest,
      reserved,
      createAdmissionReceipt(
        manifestSourceFor(manifest),
        reserved,
        "admit-cpu",
      ),
    );
    expect(environment.CUDA_VISIBLE_DEVICES).toBe("");
    expect(environment.JULIA_CUDA_HARD_MEMORY_LIMIT).toBeUndefined();
    expect(environment.AGENT_RESOURCE_VRAM_BYTES).toBeUndefined();
  });

  test("refuses an environment when the live reservation differs from the manifest", () => {
    const manifest = cpuManifest();
    const reserved = reservation({
      job_id: manifest.job_id,
      host_ram_peak_bytes: 512 * MiB,
    });
    const receipt = createAdmissionReceipt(
      manifestSourceFor(manifest),
      reserved,
      "admit-mismatch",
    );
    expect(() => commandEnvironment(manifest, reserved, receipt)).toThrow(
      "manifest and reservation resources must match",
    );
  });

  test("replaces spoofed resource environment with an exact scope-bound receipt", () => {
    const manifest = cpuManifest({
      cpu_threads: 2,
      host_ram_peak_bytes: 512 * MiB,
      scratch_bytes: 64 * MiB,
    });
    const reserved = reservation({
      reservation_id: "reservation-123",
      job_id: "test-job",
      controller_pid: 4_242,
      cpu_ids: [2, 5],
      host_ram_peak_bytes: 512 * MiB,
      scratch_bytes: 64 * MiB,
      started_at: "2026-08-20T01:02:03.000Z",
    });
    const manifestBytes = Buffer.from(JSON.stringify(manifest), "utf8");
    const source = manifestSourceFromBytes(
      "fixtures/exact.resource.json",
      manifestBytes,
    );
    const receipt = createAdmissionReceipt(source, reserved, "admission-456");
    const expectedPayload = JSON.stringify({
      schema: 1,
      admission_id: "admission-456",
      manifest_path: resolve("fixtures/exact.resource.json"),
      manifest_sha256: createHash("sha256").update(manifestBytes).digest("hex"),
      job_id: "test-job",
      reservation_id: "reservation-123",
      scope_unit: "agent-resource-reservation-123.scope",
      controller_pid: 4_242,
      cpu_ids: [2, 5],
      host_ram_peak_bytes: 512 * MiB,
      scratch_bytes: 64 * MiB,
      device: { kind: "cpu" },
      started_at: "2026-08-20T01:02:03.000Z",
    });
    expect(source).toEqual({
      path: resolve("fixtures/exact.resource.json"),
      sha256: createHash("sha256").update(manifestBytes).digest("hex"),
    });
    expect(receipt.payload).toBe(expectedPayload);
    expect(receipt.sha256).toBe(
      createHash("sha256").update(expectedPayload).digest("hex"),
    );
    expect(scopeUnitFor(reserved)).toBe("agent-resource-reservation-123.scope");
    expect(
      verifyAdmissionReceipt(
        receipt.payload,
        receipt.sha256,
        "0::/user.slice/user-1000.slice/agent-resource-reservation-123.scope",
      ),
    ).toBe(true);
    expect(
      verifyAdmissionReceipt(
        receipt.payload,
        receipt.sha256,
        "0::/user.slice/user-1000.slice/not-agent-resource-reservation-123.scope",
      ),
    ).toBe(false);
    expect(
      verifyAdmissionReceipt(
        receipt.payload,
        "0".repeat(64),
        "0::/user.slice/user-1000.slice/agent-resource-reservation-123.scope",
      ),
    ).toBe(false);

    const reservedKeys = [
      "AGENT_RESOURCE_JOB_ID",
      "AGENT_RESOURCE_CPU_IDS",
      "AGENT_RESOURCE_MAX_PROCESSES",
      "AGENT_RESOURCE_HOST_RAM_BYTES",
      "AGENT_RESOURCE_SCRATCH_BYTES",
      "AGENT_RESOURCE_MANIFEST_SHA256",
      "AGENT_RESOURCE_MANIFEST_PATH",
      "AGENT_RESOURCE_ADMISSION_ID",
      "AGENT_RESOURCE_RESERVATION_ID",
      "AGENT_RESOURCE_ADMISSION_RECEIPT",
      "AGENT_RESOURCE_ADMISSION_RECEIPT_SHA256",
      "AGENT_RESOURCE_VRAM_BYTES",
      "JULIA_CUDA_HARD_MEMORY_LIMIT",
      "JULIA_CUDA_SOFT_MEMORY_LIMIT",
      "CUDA_VISIBLE_DEVICES",
    ];
    const inherited = new Map(
      reservedKeys.map((key) => [key, process.env[key]]),
    );
    try {
      for (const key of reservedKeys) process.env[key] = "caller-spoofed";
      const environment = commandEnvironment(manifest, reserved, receipt);
      expect(environment).toMatchObject({
        AGENT_RESOURCE_JOB_ID: "test-job",
        AGENT_RESOURCE_CPU_IDS: "2,5",
        AGENT_RESOURCE_MAX_PROCESSES: "2",
        AGENT_RESOURCE_HOST_RAM_BYTES: String(512 * MiB),
        AGENT_RESOURCE_SCRATCH_BYTES: String(64 * MiB),
        AGENT_RESOURCE_MANIFEST_SHA256: source.sha256,
        AGENT_RESOURCE_MANIFEST_PATH: source.path,
        AGENT_RESOURCE_ADMISSION_ID: "admission-456",
        AGENT_RESOURCE_RESERVATION_ID: "reservation-123",
        AGENT_RESOURCE_ADMISSION_RECEIPT: expectedPayload,
        AGENT_RESOURCE_ADMISSION_RECEIPT_SHA256: receipt.sha256,
      });
      expect(environment.AGENT_RESOURCE_VRAM_BYTES).toBeUndefined();
      expect(environment.JULIA_CUDA_HARD_MEMORY_LIMIT).toBeUndefined();
      expect(environment.JULIA_CUDA_SOFT_MEMORY_LIMIT).toBeUndefined();
      expect(environment.CUDA_VISIBLE_DEVICES).toBe("");
    } finally {
      for (const [key, value] of inherited) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});

describe("admission receipt", () => {
  test("rejects malformed, unknown, altered, and non-canonical receipts", () => {
    const source = manifestSourceFromBytes(
      "fixtures/receipt.resource.json",
      Buffer.from('{"schema":1}\n', "utf8"),
    );
    const reserved = reservation({
      reservation_id: "receipt-123",
      job_id: "receipt-job",
      controller_pid: 4_242,
      cpu_ids: [1, 3],
      host_ram_peak_bytes: 512 * MiB,
      scratch_bytes: 0,
      started_at: "2026-08-21T01:02:03.000Z",
    });
    const receipt = createAdmissionReceipt(source, reserved, "admission-123");
    const cgroup =
      "0::/user.slice/user-1000.slice/agent-resource-receipt-123.scope";
    const validPayload = {
      schema: 1,
      admission_id: "admission-123",
      manifest_path: source.path,
      manifest_sha256: source.sha256,
      job_id: "receipt-job",
      reservation_id: "receipt-123",
      scope_unit: "agent-resource-receipt-123.scope",
      controller_pid: 4_242,
      cpu_ids: [1, 3],
      host_ram_peak_bytes: 512 * MiB,
      scratch_bytes: 0,
      device: { kind: "cpu" },
      started_at: "2026-08-21T01:02:03.000Z",
    };
    const digestFor = (payload: string): string =>
      createHash("sha256").update(payload).digest("hex");
    const invalidPayloads = [
      "{",
      JSON.stringify({ ...validPayload, unexpected: true }),
      JSON.stringify({ ...validPayload, schema: 2 }),
      JSON.stringify({ ...validPayload, admission_id: 1 }),
      JSON.stringify({ ...validPayload, manifest_path: "relative.json" }),
      JSON.stringify({ ...validPayload, manifest_sha256: "A".repeat(64) }),
      JSON.stringify({ ...validPayload, job_id: null }),
      JSON.stringify({ ...validPayload, reservation_id: null }),
      JSON.stringify({ ...validPayload, scope_unit: "wrong.scope" }),
      JSON.stringify({ ...validPayload, controller_pid: 1.5 }),
      JSON.stringify({ ...validPayload, cpu_ids: [1, 1] }),
      JSON.stringify({ ...validPayload, host_ram_peak_bytes: 1.5 }),
      JSON.stringify({ ...validPayload, scratch_bytes: -1 }),
      JSON.stringify({
        ...validPayload,
        device: { kind: "gpu", gpu_id: 0, vram_peak_bytes: 1.5 },
      }),
      JSON.stringify({ ...validPayload, started_at: "not-an-iso-timestamp" }),
      JSON.stringify({
        admission_id: validPayload.admission_id,
        ...validPayload,
      }),
    ];
    for (const payload of invalidPayloads) {
      expect(verifyAdmissionReceipt(payload, digestFor(payload), cgroup)).toBe(
        false,
      );
    }
    expect(
      verifyAdmissionReceipt(
        receipt.payload.replace("admission-123", "admission-124"),
        receipt.sha256,
        cgroup,
      ),
    ).toBe(false);
  });

  test("check-only admission does not issue receipt identifiers", async () => {
    const reports: string[] = [];
    const result = await checkJob(cpuManifest(), {
      stateDirectory: temporaryStateDirectory(),
      snapshot: hostSnapshot(),
      kernelEnforcement: { available: true },
      report: (line) => reports.push(line),
    });
    expect(result).toMatchObject({ ok: true, exitCode: 0 });
    expect(reports.join("\n")).toContain("check_only=true");
    expect(reports.join("\n")).not.toContain("admission_id=");
    expect(reports.join("\n")).not.toContain("receipt_sha256=");
  });

  test("accepts only a runner child in the receipt's live systemd scope", async () => {
    const outerManifestPath = join(
      import.meta.dir,
      "examples/resource-runner-tests.resource.json",
    );
    const outerManifestBytes = readFileSync(outerManifestPath);
    const outerManifest = validateManifest(
      JSON.parse(outerManifestBytes.toString()),
    );
    const outerSource = manifestSourceFromBytes(
      outerManifestPath,
      outerManifestBytes,
    );
    expect(outerManifest).toMatchObject({
      cpu_threads: 3,
      processes: 4,
      host_ram_peak_bytes: 768 * MiB,
    });
    const manifestPath = join(
      import.meta.dir,
      "examples/resource-runner-receipt-inner.resource.json",
    );
    const manifestBytes = readFileSync(manifestPath);
    const manifest = validateManifest(JSON.parse(manifestBytes.toString()));
    const manifestSource = manifestSourceFromBytes(manifestPath, manifestBytes);
    const outerPayload = process.env.AGENT_RESOURCE_ADMISSION_RECEIPT;
    const outerReceiptSha256 =
      process.env.AGENT_RESOURCE_ADMISSION_RECEIPT_SHA256;
    const outerCgroup = readFileSync("/proc/self/cgroup", "utf8");
    expect(process.env.AGENT_RESOURCE_MANIFEST_PATH).toBe(outerSource.path);
    expect(process.env.AGENT_RESOURCE_MANIFEST_SHA256).toBe(outerSource.sha256);
    expect(process.env.AGENT_RESOURCE_JOB_ID).toBe(outerManifest.job_id);
    expect(typeof process.env.AGENT_RESOURCE_RESERVATION_ID).toBe("string");
    expect(typeof outerPayload).toBe("string");
    expect(typeof outerReceiptSha256).toBe("string");
    if (
      typeof outerPayload !== "string" ||
      typeof outerReceiptSha256 !== "string"
    ) {
      throw new Error(
        "the outer test envelope did not provide an admission receipt",
      );
    }
    expect(outerReceiptSha256).toBe(
      createHash("sha256").update(outerPayload).digest("hex"),
    );
    expect(
      verifyAdmissionReceipt(outerPayload, outerReceiptSha256, outerCgroup),
    ).toBe(true);
    const outerReceipt = JSON.parse(outerPayload);
    expect(JSON.stringify(outerReceipt)).toBe(outerPayload);
    expect(outerReceipt).toMatchObject({
      schema: 1,
      admission_id: process.env.AGENT_RESOURCE_ADMISSION_ID,
      manifest_path: outerSource.path,
      manifest_sha256: outerSource.sha256,
      job_id: outerManifest.job_id,
      reservation_id: process.env.AGENT_RESOURCE_RESERVATION_ID,
      host_ram_peak_bytes: outerManifest.host_ram_peak_bytes,
      scratch_bytes: outerManifest.scratch_bytes,
      device: { kind: "cpu" },
    });
    expect(outerReceipt.cpu_ids).toHaveLength(outerManifest.cpu_threads);
    expect(outerReceipt.scope_unit).toBe(
      `agent-resource-${process.env.AGENT_RESOURCE_RESERVATION_ID}.scope`,
    );
    expect(outerReceipt.manifest_path).not.toBe(manifestSource.path);
    expect(outerReceipt.manifest_sha256).not.toBe(manifestSource.sha256);
    expect(outerReceipt.job_id).not.toBe(manifest.job_id);
    const stateDirectory = temporaryStateDirectory();
    const receiptPath = join(stateDirectory, "child-receipt.json");
    const runnerModulePath = join(import.meta.dir, "agent-resource-run.ts");
    const childScript = [
      'import { readFileSync, writeFileSync } from "node:fs";',
      `import { verifyAdmissionReceipt } from ${JSON.stringify(runnerModulePath)};`,
      `const receiptPath = ${JSON.stringify(receiptPath)};`,
      "const payload = process.env.AGENT_RESOURCE_ADMISSION_RECEIPT;",
      "const sha256 = process.env.AGENT_RESOURCE_ADMISSION_RECEIPT_SHA256;",
      "const cgroup = readFileSync('/proc/self/cgroup', 'utf8');",
      "const verified = typeof payload === 'string' && typeof sha256 === 'string' && verifyAdmissionReceipt(payload, sha256, cgroup);",
      "const environment = Object.fromEntries(Object.entries(process.env));",
      "writeFileSync(receiptPath, JSON.stringify({ verified, cgroup, environment }) + '\\n');",
      "process.exit(verified ? 0 : 1);",
    ].join("\n");
    const reports: string[] = [];
    const result = await executeJob(
      manifest,
      [process.execPath, "-e", childScript],
      {
        stateDirectory,
        snapshot: probeHostSnapshot(process.cwd()),
        monitorIntervalMs: 25,
        manifestSource,
        report: (line) => reports.push(line),
      },
    );
    expect(result).toMatchObject({ ok: true, exitCode: 0 });
    const admit = reports.find((line) => line.startsWith("ADMIT "));
    expect(admit).toContain("admission_id=");
    expect(admit).toContain("reservation_id=");
    expect(admit).toContain("scope_unit=");
    expect(admit).toContain("manifest_sha256=");
    expect(admit).toContain("receipt_sha256=");

    const saved = JSON.parse(readFileSync(receiptPath, "utf8"));
    expect(saved.verified).toBe(true);
    const innerEnvironment = saved.environment;
    const innerPayload = innerEnvironment.AGENT_RESOURCE_ADMISSION_RECEIPT;
    const innerReceiptSha256 =
      innerEnvironment.AGENT_RESOURCE_ADMISSION_RECEIPT_SHA256;
    expect(innerEnvironment.AGENT_RESOURCE_MANIFEST_PATH).toBe(
      manifestSource.path,
    );
    expect(innerEnvironment.AGENT_RESOURCE_MANIFEST_SHA256).toBe(
      manifestSource.sha256,
    );
    expect(innerEnvironment.AGENT_RESOURCE_JOB_ID).toBe(manifest.job_id);
    expect(typeof innerEnvironment.AGENT_RESOURCE_RESERVATION_ID).toBe(
      "string",
    );
    expect(typeof innerEnvironment.AGENT_RESOURCE_ADMISSION_ID).toBe("string");
    expect(typeof innerPayload).toBe("string");
    expect(typeof innerReceiptSha256).toBe("string");
    expect(innerReceiptSha256).toBe(
      createHash("sha256").update(innerPayload).digest("hex"),
    );
    expect(
      verifyAdmissionReceipt(innerPayload, innerReceiptSha256, saved.cgroup),
    ).toBe(true);
    const innerReceipt = JSON.parse(innerPayload);
    expect(JSON.stringify(innerReceipt)).toBe(innerPayload);
    expect(innerReceipt).toMatchObject({
      schema: 1,
      admission_id: innerEnvironment.AGENT_RESOURCE_ADMISSION_ID,
      manifest_path: manifestSource.path,
      manifest_sha256: manifestSource.sha256,
      job_id: manifest.job_id,
      reservation_id: innerEnvironment.AGENT_RESOURCE_RESERVATION_ID,
      host_ram_peak_bytes: manifest.host_ram_peak_bytes,
      scratch_bytes: manifest.scratch_bytes,
      device: { kind: "cpu" },
    });
    expect(innerReceipt.cpu_ids).toHaveLength(manifest.cpu_threads);
    expect(innerReceipt.scope_unit).toBe(
      `agent-resource-${innerEnvironment.AGENT_RESOURCE_RESERVATION_ID}.scope`,
    );
    expect(innerReceipt.manifest_path).not.toBe(outerSource.path);
    expect(innerReceipt.manifest_sha256).not.toBe(outerSource.sha256);
    expect(innerReceipt.job_id).not.toBe(outerManifest.job_id);
    const directScript = [
      'import { readFileSync } from "node:fs";',
      `import { verifyAdmissionReceipt } from ${JSON.stringify(runnerModulePath)};`,
      "const payload = process.env.AGENT_RESOURCE_ADMISSION_RECEIPT;",
      "const sha256 = process.env.AGENT_RESOURCE_ADMISSION_RECEIPT_SHA256;",
      "const verified = typeof payload === 'string' && typeof sha256 === 'string' && verifyAdmissionReceipt(payload, sha256, readFileSync('/proc/self/cgroup', 'utf8'));",
      "process.exit(verified ? 1 : 0);",
    ].join("\n");
    const direct = Bun.spawnSync([process.execPath, "-e", directScript], {
      env: { ...process.env, ...saved.environment },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(direct.exitCode).toBe(0);
  });
});

describe("bounded execution", () => {
  test("fails closed when kernel enforcement is unavailable", async () => {
    const stateDirectory = temporaryStateDirectory();
    const reports: string[] = [];
    const result = await checkJob(cpuManifest(), {
      stateDirectory,
      snapshot: hostSnapshot(),
      kernelEnforcement: {
        available: false,
        reason: "fixture user manager unavailable",
      },
      report: (line) => reports.push(line),
    });
    expect(result).toMatchObject({
      ok: false,
      exitCode: 69,
      reason: "admission",
    });
    expect(reports.join("\n")).toContain("kernel enforcement unavailable");
    expect(readdirSync(stateDirectory)).toEqual([]);
  });

  test("reclaims an old lock left before its owner file was written", async () => {
    const stateDirectory = temporaryStateDirectory();
    const lockDirectory = join(stateDirectory, ".lock");
    mkdirSync(lockDirectory);
    const old = new Date(Date.now() - 10_000);
    utimesSync(lockDirectory, old, old);
    const result = await checkJob(cpuManifest(), {
      stateDirectory,
      snapshot: probeHostSnapshot(process.cwd()),
    });
    expect(result).toMatchObject({ ok: true, exitCode: 0 });
    expect(readdirSync(stateDirectory)).toEqual([]);
  });

  test("injects one-thread settings and releases the reservation", async () => {
    const stateDirectory = temporaryStateDirectory();
    const snapshot = probeHostSnapshot(process.cwd());
    const result = await executeJob(
      cpuManifest(),
      [
        "sh",
        "-c",
        'test "$OMP_NUM_THREADS" = 1 && test "$JULIA_NUM_THREADS" = 1',
      ],
      {
        stateDirectory,
        snapshot,
        monitorIntervalMs: 25,
        manifestSource: manifestSourceFor(cpuManifest()),
      },
    );
    expect(result).toMatchObject({ ok: true, exitCode: 0 });
    expect(readdirSync(stateDirectory)).toEqual([]);
  });

  test("terminates the whole process group at the walltime", async () => {
    const stateDirectory = temporaryStateDirectory();
    const snapshot = probeHostSnapshot(process.cwd());
    const started = performance.now();
    const result = await executeJob(
      cpuManifest({ walltime_seconds: 1 }),
      ["sh", "-c", "sleep 10"],
      {
        stateDirectory,
        snapshot,
        monitorIntervalMs: 25,
        manifestSource: manifestSourceFor(cpuManifest({ walltime_seconds: 1 })),
      },
    );
    expect(result).toMatchObject({
      ok: false,
      exitCode: 124,
      reason: "walltime",
    });
    expect(performance.now() - started).toBeLessThan(4_000);
    expect(readdirSync(stateDirectory)).toEqual([]);
  });

  test("terminates a process fanout beyond the declared ceiling", async () => {
    const stateDirectory = temporaryStateDirectory();
    const snapshot = probeHostSnapshot(process.cwd());
    const result = await executeJob(
      cpuManifest({ processes: 1 }),
      ["sh", "-c", "sleep 10 & wait"],
      {
        stateDirectory,
        snapshot,
        monitorIntervalMs: 25,
        manifestSource: manifestSourceFor(cpuManifest({ processes: 1 })),
      },
    );
    expect(result).toMatchObject({
      ok: false,
      exitCode: 137,
      reason: "processes",
    });
    expect(readdirSync(stateDirectory)).toEqual([]);
  });

  // This test deliberately triggers a REAL kernel OOM-kill against a REAL systemd scope —
  // it is not simulated (2026-09-04, recurred twice in one evening as "unattributed OOM kill on
  // agent-resource-*.scope" reports to two other fleets, once resolved by matching this run's
  // own scope UUIDs against dmesg, once by attribution failing because the dmesg ring had
  // already rolled past the run and only a firedancer journal read settled it). Before
  // investigating an unattributed `agent-resource-*.scope` OOM-kill in dmesg or a journal, check
  // whether `bun test agents/resource-control/` ran around that time — this is very likely it.
  test("the cgroup kills a job before it can exceed its RAM envelope", async () => {
    const stateDirectory = temporaryStateDirectory();
    const snapshot = probeHostSnapshot(process.cwd());
    const started = performance.now();
    const result = await executeJob(
      cpuManifest({ host_ram_peak_bytes: 64 * MiB }),
      [
        process.execPath,
        "-e",
        "const value = Buffer.alloc(256 * 1024 * 1024, 1); " +
          "process.stdout.write(String(value.length)); await Bun.sleep(5_000);",
      ],
      {
        stateDirectory,
        snapshot,
        monitorIntervalMs: 1_000,
        manifestSource: manifestSourceFor(
          cpuManifest({ host_ram_peak_bytes: 64 * MiB }),
        ),
      },
    );
    expect(result).toMatchObject({
      ok: false,
      exitCode: 137,
      reason: "command-exit",
    });
    expect(performance.now() - started).toBeLessThan(4_000);
    expect(readdirSync(stateDirectory)).toEqual([]);
  });

  test("scope cleanup kills a descendant that escapes the process group", async () => {
    const stateDirectory = temporaryStateDirectory();
    const snapshot = probeHostSnapshot(process.cwd());
    const pidFile = join(stateDirectory, "escaped.pid");
    const result = await executeJob(
      cpuManifest({ processes: 3 }),
      [
        "sh",
        "-c",
        `setsid sh -c 'echo $$ > ${pidFile}; exec sleep 10' & ` +
          `while [ ! -s ${pidFile} ]; do sleep 0.01; done`,
      ],
      {
        stateDirectory,
        snapshot,
        monitorIntervalMs: 25,
        manifestSource: manifestSourceFor(cpuManifest({ processes: 3 })),
      },
    );
    const escapedPid = Number(readFileSync(pidFile, "utf8").trim());
    let escapedProcessIsLive = true;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        const stat = readFileSync(`/proc/${escapedPid}/stat`, "utf8");
        const close = stat.lastIndexOf(")");
        escapedProcessIsLive = close !== -1 && stat.slice(close + 2)[0] !== "Z";
      } catch {
        escapedProcessIsLive = false;
      }
      if (!escapedProcessIsLive) break;
      await Bun.sleep(25);
    }

    expect(result).toMatchObject({ ok: true, exitCode: 0 });
    expect(escapedProcessIsLive).toBe(false);
    expect(readdirSync(stateDirectory)).toEqual(["escaped.pid"]);
  });

  test("fails closed when systemd scope cleanup cannot be verified", async () => {
    const stateDirectory = temporaryStateDirectory();
    await expect(
      executeJob(cpuManifest(), ["true"], {
        stateDirectory,
        snapshot: probeHostSnapshot(process.cwd()),
        kernelEnforcement: { available: true },
        monitorIntervalMs: 25,
        systemdScopeCleanup: () => false,
        manifestSource: manifestSourceFor(cpuManifest()),
      }),
    ).rejects.toThrow("failed to verify cleanup of systemd scope");
    expect(readdirSync(stateDirectory)).toEqual([]);
  });
});
