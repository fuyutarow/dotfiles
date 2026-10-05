import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fromThrowable } from "neverthrow";
import { z } from "../../hooks/zod.ts";
import {
  buildSampledLaunch,
  buildSystemdLaunch,
  readHostOptIn,
  resolveEnforcement,
  commandEnvironment,
  createAdmissionReceipt,
  decideAdmission,
  hasUnmanagedGpuLoad,
  parseNvidiaSmiComputeAppRow,
  parseNvidiaSmiGpuRow,
  checkJob,
  executeJob,
  kernelTasksMax,
  loadResourcePolicy,
  parseCpuList,
  resourcePolicy,
  resourcePolicyPath,
  probeKernelEnforcement,
  probeHostSnapshot,
  manifestSourceFromBytes,
  scopeUnitFor,
  validateJobId,
  validateManifest,
  verifyAdmissionReceipt,
  type AdmissionFailure,
  type AdmissionResult,
  type HostSnapshot,
  type ResourceManifest,
  type Reservation,
} from "../agent-resource-run.ts";
import { decoded, decodedJson } from "../../hooks/tests/decode.ts";

// Platform requirements, declared — a test that needs a facility this machine lacks is SKIPPED
// and counted as such, never failed for that reason (macOS has no util-linux setsid/taskset; a
// container has no user systemd).
const NO_UTIL_LINUX =
  Bun.which("taskset") === null || Bun.which("setsid") === null;
const NO_CGROUP_SCOPES = NO_UTIL_LINUX || !probeKernelEnforcement().available;

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;

const parseJson = (text: string): unknown => decodedJson(z.json(), text);

// The fields of an admission receipt the tests read directly. Assertions on the whole receipt
// (JSON.stringify round-trip, toMatchObject) stay on the unparsed value, whose key order is the
// writer's.
const ReceiptFieldsSchema = z.object({
  cpu_ids: z.array(z.unknown()),
  scope_unit: z.string(),
  manifest_path: z.string(),
  manifest_sha256: z.string(),
  job_id: z.string(),
});

// What the child script in the receipt test writes to disk.
const SavedChildSchema = z.object({
  verified: z.boolean(),
  cgroup: z.string(),
  environment: z.record(z.string(), z.string()),
});

const PeakFieldsSchema = z.object({
  ram_peak_measured_bytes: z.number(),
  ram_peak_source: z.string(),
});

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
    started_at: Temporal.Now.instant().toString({ fractionalSecondDigits: 3 }),
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

/** Asserts admission was denied, the same runtime check the callers below used inline, and
 * narrows the result so `.reason` is available afterward. */
function denied(result: AdmissionResult): AdmissionFailure {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected admission to be denied");
  return result;
}

function manifestSourceFor(manifest: ResourceManifest) {
  return manifestSourceFromBytes(
    "fixtures/test.resource.json",
    Buffer.from(JSON.stringify(manifest), "utf8"),
  );
}

/** Restores one env var to its pre-test value, deleting it when it was previously unset. */
function restoreEnvValue(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
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

  test("validateJobId enforces the same rule for the manifest field and the --job-id override", () => {
    expect(validateJobId("firedancer-ticket-42", "--job-id")).toBe(
      "firedancer-ticket-42",
    );
    expect(() => validateJobId("", "--job-id")).toThrow(/--job-id/u);
    expect(() => validateJobId("has spaces", "--job-id")).toThrow(
      /--job-id must contain only/u,
    );
    expect(() => validateJobId("-leading-hyphen", "--job-id")).toThrow(
      /--job-id must contain only/u,
    );
    expect(() => validateJobId("a".repeat(81), "--job-id")).toThrow();
  });

  test("rejects an unbounded memory claim and nested agent fanout", () => {
    expect(() =>
      validateManifest({
        ...cpuManifest(),
        memory_bound: "",
      }),
    ).toThrow(/memory_bound/u);
    expect(() =>
      validateManifest({ ...cpuManifest(), child_fanout: 1 }),
    ).toThrow(/child_fanout/u);
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
    const result = denied(decideAdmission(manifest, hostSnapshot(), []));
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
    const result = denied(
      decideAdmission(
        manifest,
        hostSnapshot({ mem_available_bytes: 8 * GiB }),
        [existing],
      ),
    );
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
    const result = denied(
      decideAdmission(gpuManifest(), snapshot, [
        gpuReservation("a", 5 * GiB),
        gpuReservation("b", 5 * GiB),
      ]),
    );
    expect(result.reason).toContain("VRAM request");
    // 12 GiB - (10 GiB declared + 2 GiB standing ccc partition) - safety -> clamped to 0.
    expect(result.reason).toContain("0 available");
    expect(result.reason).toContain(
      `${2 * GiB} bytes of standing service partitions`,
    );
  });

  test("standing service partitions are reserved before any job, used or not", () => {
    // Shipped policy: ccc 2 GiB always, reranker 2 GiB only while it runs, on GPU 0. The card reads
    // 1 GiB used, yet a job sees 12 - 2 - 0.5 = 9.5 GiB with the reranker off, 7.5 GiB with it on —
    // never the 10.5 GiB the instantaneous reading suggests.
    const card = (rerank_active?: boolean) =>
      hostSnapshot({
        gpus: [
          {
            id: 0,
            total_bytes: 12 * GiB,
            used_bytes: GiB,
            utilization_percent: 0,
            ...(rerank_active === undefined ? {} : { rerank_active }),
          },
        ],
      });
    const want = (bytes: number) =>
      gpuManifest({
        device: { kind: "gpu", gpu_id: 0, vram_peak_bytes: bytes },
      });
    const off = denied(decideAdmission(want(10 * GiB), card(), []));
    expect(off.reason).toContain(`${9.5 * GiB} available`);
    expect(off.reason).toContain("standing service partitions");
    expect(decideAdmission(want(9 * GiB), card(), []).ok).toBe(true);
    const on = denied(decideAdmission(want(8 * GiB), card(true), []));
    expect(on.reason).toContain(`${7.5 * GiB} available`);
    expect(decideAdmission(want(7 * GiB), card(true), []).ok).toBe(true);
    // Another device carries no partition.
    const gpu1 = hostSnapshot({
      gpus: [
        {
          id: 1,
          total_bytes: 12 * GiB,
          used_bytes: GiB,
          utilization_percent: 0,
        },
      ],
    });
    expect(
      decideAdmission(
        gpuManifest({
          device: { kind: "gpu", gpu_id: 1, vram_peak_bytes: 10 * GiB },
        }),
        gpu1,
        [],
      ).ok,
    ).toBe(true);
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
    const unmanaged = denied(decideAdmission(gpuManifest(), busy, []));
    expect(unmanaged.reason).toContain("97% utilization");
    // The VRAM fits, so the reason must lead with the clause that refused, not read as a VRAM
    // denial (2026-09-24: 4.3 GB asked, 8.4 GB free, reported as "VRAM request … exceeds").
    expect(unmanaged.reason.startsWith("unmanaged load")).toBe(true);
    expect(unmanaged.reason).not.toContain("exceeds");
    expect(decideAdmission(gpuManifest(), busy, [gpuReservation("a")]).ok).toBe(
      true,
    );
  });

  test("idle board power overrides a display-only utilization reading (WSL2 compositor)", () => {
    // Observed 2026-09-24 on the WSL2 host: P8, 16 W, 462 MiB, no compute process, 39 %.
    const displayOnly = hostSnapshot({
      gpus: [
        {
          id: 0,
          total_bytes: 12 * GiB,
          used_bytes: 462 * MiB,
          utilization_percent: 39,
          power_watts: 16,
        },
      ],
    });
    expect(decideAdmission(gpuManifest(), displayOnly, []).ok).toBe(true);
  });

  test("high utilization with compute-level power, or unknown power, is still unmanaged load", () => {
    const base = {
      id: 0,
      total_bytes: 12 * GiB,
      used_bytes: 2 * GiB,
      utilization_percent: 97,
    };
    expect(hasUnmanagedGpuLoad({ ...base, power_watts: 150 })).toBe(true);
    expect(hasUnmanagedGpuLoad({ ...base })).toBe(true);
    expect(hasUnmanagedGpuLoad({ ...base, utilization_percent: 10 })).toBe(
      false,
    );
    const computeBound = hostSnapshot({
      gpus: [{ ...base, power_watts: 150 }],
    });
    expect(
      denied(decideAdmission(gpuManifest(), computeBound, [])).reason,
    ).toContain("150 W board power");
  });

  test("parses the nvidia-smi row including power.draw, and tolerates [N/A] power", () => {
    const row = parseNvidiaSmiGpuRow("0, 12288, 462, 39, 16.23");
    expect(row.utilization_percent).toBe(39);
    expect(row.power_watts).toBeCloseTo(16.23);
    expect(row.used_bytes).toBe(462 * MiB);
    expect(
      parseNvidiaSmiGpuRow("0, 12288, 462, 39, [N/A]").power_watts,
    ).toBeUndefined();
    expect(() => parseNvidiaSmiGpuRow("0, 12288, 462, 39")).toThrow();
    expect(() => parseNvidiaSmiGpuRow("0, 12288, oops, 39, 16")).toThrow();
  });

  test("parses a nvidia-smi compute-apps row and rejects malformed ones", () => {
    expect(parseNvidiaSmiComputeAppRow("12345, 2048")).toEqual({
      pid: 12345,
      usedBytes: 2048 * MiB,
    });
    expect(parseNvidiaSmiComputeAppRow("12345")).toBeNull();
    expect(parseNvidiaSmiComputeAppRow("oops, 2048")).toBeNull();
    expect(parseNvidiaSmiComputeAppRow("0, 2048")).toBeNull();
    expect(parseNvidiaSmiComputeAppRow("-1, 2048")).toBeNull();
  });

  test("caps concurrent jobs on one device even when VRAM is abundant", () => {
    // Derived from the live policy, so moving the cap in resource-policy.toml needs no test edit.
    const cap = resourcePolicy().gpu_max_concurrent_jobs;
    const held = Array.from({ length: cap }, (_, index) =>
      gpuReservation(`held-${index}`, 128 * MiB),
    );
    expect(
      decideAdmission(gpuManifest(), hostSnapshot(), held.slice(1)).ok,
    ).toBe(true);
    const result = denied(decideAdmission(gpuManifest(), hostSnapshot(), held));
    expect(result.reason).toContain("concurrency cap");
    expect(result.reason.startsWith("GPU 0 already holds")).toBe(true);
    expect(result.reason).not.toContain("exceeds");
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
    const result = denied(
      decideAdmission(cpuManifest(), hostSnapshot(), [
        reservation({ job_id: "test-job" }),
      ]),
    );
    expect(result.reason).toContain("already reserved");
  });
});

function withKey(key: string, value: string): (text: string) => string {
  return (text) => {
    const pattern = new RegExp(`^${key} = .*$`, "mu");
    expect(pattern.test(text)).toBe(true);
    return text.replace(pattern, `${key} = ${value}`);
  };
}

const digestFor = (payload: string): string =>
  createHash("sha256").update(payload).digest("hex");

describe("resource policy", () => {
  const shippedPolicyPath = resolve(
    import.meta.dir,
    "..",
    "resource-policy.toml",
  );
  const scriptPath = resolve(import.meta.dir, "..", "agent-resource-run.ts");

  /** Writes the shipped policy with `edit` applied to its text; returns the fixture path. */
  function policyFixture(edit: (text: string) => string): string {
    const path = join(temporaryStateDirectory(), "resource-policy.toml");
    writeFileSync(path, edit(readFileSync(shippedPolicyPath, "utf8")));
    return path;
  }

  test("the shipped TOML carries exactly the former hardcoded thresholds", () => {
    const expected = {
      cpu_safety_count: 1,
      min_host_ram_safety_bytes: 4 * GiB,
      host_ram_safety_fraction: 0.1,
      scratch_safety_bytes: GiB,
      gpu_safety_bytes: 512 * MiB,
      gpu_idle_utilization_percent: 20,
      gpu_idle_power_watts: 30,
      gpu_max_concurrent_jobs: 8,
      gpu_soft_limit_fraction: 0.9,
      default_monitor_interval_ms: 200,
      gpu_vram_sample_interval_ms: 1_000,
      gpu_partition_device: 0,
      gpu_partition_ccc_bytes: 2048 * MiB,
      gpu_partition_rerank_bytes: 2048 * MiB,
    };
    expect(loadResourcePolicy(shippedPolicyPath)).toEqual(expected);
    expect(resourcePolicyPath()).toBe(shippedPolicyPath);
    expect(resourcePolicy()).toEqual(expected);
  });

  test("AGENT_RESOURCE_POLICY moves the GPU cap without a code edit", () => {
    const fixture = policyFixture(withKey("gpu_max_concurrent_jobs", "2"));
    const saved = process.env.AGENT_RESOURCE_POLICY;
    process.env.AGENT_RESOURCE_POLICY = fixture;
    const policy = loadResourcePolicy();
    restoreEnvValue("AGENT_RESOURCE_POLICY", saved);
    expect(policy.gpu_max_concurrent_jobs).toBe(2);
    const one = [gpuReservation("a", 128 * MiB)];
    const two = [...one, gpuReservation("b", 128 * MiB)];
    expect(decideAdmission(gpuManifest(), hostSnapshot(), one, policy).ok).toBe(
      true,
    );
    expect(
      denied(decideAdmission(gpuManifest(), hostSnapshot(), two, policy))
        .reason,
    ).toContain("2-job concurrency cap");
    // The module-level startup load honours the variable too, in a fresh process.
    const probe = Bun.spawnSync(
      [
        process.execPath,
        "-e",
        `import { resourcePolicy } from ${JSON.stringify(scriptPath)};` +
          "console.log(resourcePolicy().gpu_max_concurrent_jobs);",
      ],
      {
        env: { ...process.env, AGENT_RESOURCE_POLICY: fixture },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    expect(probe.stdout.toString().trim()).toBe("2");
  });

  test("a relative AGENT_RESOURCE_POLICY is refused", () => {
    const saved = process.env.AGENT_RESOURCE_POLICY;
    process.env.AGENT_RESOURCE_POLICY = "resource-policy.toml";
    const result = fromThrowable(() => resourcePolicyPath())();
    restoreEnvValue("AGENT_RESOURCE_POLICY", saved);
    expect(result.isErr()).toBe(true);
    expect(String(result._unsafeUnwrapErr())).toContain("absolute path");
  });

  test("a missing key fails closed and names the key and file", () => {
    const fixture = policyFixture((text) =>
      text.replace(/^gpu_max_concurrent_jobs = .*$/mu, ""),
    );
    expect(() => loadResourcePolicy(fixture)).toThrow(
      "gpu_max_concurrent_jobs: required key is missing (expected a positive integer)",
    );
    expect(() => loadResourcePolicy(fixture)).toThrow(fixture);
  });

  test("an unknown key fails closed and names the key", () => {
    const fixture = policyFixture(
      (text) => `${text}\ngpu_max_concurent_jobs = 8\n`,
    );
    expect(() => loadResourcePolicy(fixture)).toThrow(
      "gpu_max_concurent_jobs: unknown key",
    );
  });

  test("out-of-range and mistyped values fail closed with the key and value named", () => {
    const cases: [string, string, string][] = [
      ["gpu_max_concurrent_jobs", "0", "expected a positive integer, got 0"],
      [
        "gpu_max_concurrent_jobs",
        "2.5",
        "expected a positive integer, got 2.5",
      ],
      [
        "gpu_soft_limit_fraction",
        "1.5",
        "expected a fraction in (0, 1], got 1.5",
      ],
      [
        "host_ram_safety_fraction",
        '"0.1"',
        'expected a fraction in (0, 1], got "0.1"',
      ],
      ["gpu_safety_mib", "-512", "expected a positive integer (MiB), got -512"],
      [
        "gpu_idle_power_watts",
        "nan",
        "expected a positive number (W), got null",
      ],
    ];
    for (const [key, value, message] of cases) {
      const fixture = policyFixture(withKey(key, value));
      expect(() => loadResourcePolicy(fixture)).toThrow(`${key}: ${message}`);
    }
  });

  test("the CLI refuses with USAGE exit 2 when the policy is invalid", () => {
    const fixture = policyFixture((text) =>
      text.replace(/^gpu_max_concurrent_jobs = .*$/mu, ""),
    );
    const run = Bun.spawnSync(
      [process.execPath, scriptPath, "--manifest", "/nonexistent.json"],
      {
        env: { ...process.env, AGENT_RESOURCE_POLICY: fixture },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    expect(run.exitCode).toBe(2);
    expect(run.stderr.toString()).toContain("USAGE: resource policy");
    expect(run.stderr.toString()).toContain("gpu_max_concurrent_jobs");
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

  test.skipIf(NO_CGROUP_SCOPES)(
    "the current host accepts the required user-systemd properties",
    () => {
      expect(probeKernelEnforcement()).toEqual({ available: true });
    },
  );

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
    // Cleanup runs on return AND on throw, same as the prior try/finally: a `using` block whose
    // only job is to restore every spoofed env var when this test's scope ends, in any manner.
    using _restoreEnv = {
      [Symbol.dispose]: () => {
        for (const [key, value] of inherited) restoreEnvValue(key, value);
      },
    };
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
      // Same field values as validPayload but with admission_id reordered to the front: the
      // canonical round-trip in admissionReceiptPayloadFrom must reject non-canonical key order,
      // not just semantic equality. Destructuring (not a literal duplicate key) reorders without
      // ever naming admission_id twice in one object literal.
      (() => {
        const { admission_id, ...rest } = validPayload;
        return JSON.stringify({ admission_id, ...rest });
      })(),
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

  test.skipIf(NO_UTIL_LINUX)(
    "check-only admission does not issue receipt identifiers",
    async () => {
      const reports: string[] = [];
      const result = await checkJob(cpuManifest(), {
        stateDirectory: temporaryStateDirectory(),
        snapshot: hostSnapshot(),
        kernelEnforcement: { available: true },
        report: (line) => {
          reports.push(line);
        },
      });
      expect(result).toMatchObject({ ok: true, exitCode: 0 });
      expect(reports.join("\n")).toContain("check_only=true");
      expect(reports.join("\n")).not.toContain("admission_id=");
      expect(reports.join("\n")).not.toContain("receipt_sha256=");
    },
  );

  // WHY skipIf, not a plain assertion (2026-09-12, tests/ move regression + invocation gap): this
  // test verifies a receipt-bearing CHILD from INSIDE a receipt-bearing PARENT, so it requires
  // this `bun test` PROCESS ITSELF to already be running under agent-resource-run's own admission
  // — see README.md "Child admission receipt" and the task-owned outer envelope at
  // examples/resource-runner-tests.resource.json. `mise run test:resource-control` wraps itself
  // that way wherever the runner can admit (Linux + a live user systemd); a plain
  // `bun test agents/resource-control`, or the task on macOS, does not (measured:
  // AGENT_RESOURCE_ADMISSION_RECEIPT is unset there), so this test skips instead of failing on a
  // precondition the invocation never promised — asserting on `undefined` would be a false
  // failure, not a caught bug. Confirmed green when actually wrapped:
  //   bun agents/resource-control/agent-resource-run.ts \
  //     --manifest agents/resource-control/examples/resource-runner-tests.resource.json -- \
  //     bun test agents/resource-control/tests/agent-resource-run.test.ts -t "accepts only a runner child"
  const outerReceiptIsPresent =
    process.env.AGENT_RESOURCE_ADMISSION_RECEIPT !== undefined;
  if (!outerReceiptIsPresent) {
    console.warn(
      "SKIP admission receipt > accepts only a runner child in the receipt's live systemd " +
        "scope: AGENT_RESOURCE_ADMISSION_RECEIPT is unset — this bun test process was not " +
        "launched via agent-resource-run, so the self-referential outer receipt this test " +
        "checks does not exist here. See the test's own comment for the wrapped invocation.",
    );
  }
  test.skipIf(!outerReceiptIsPresent)(
    "accepts only a runner child in the receipt's live systemd scope",
    async () => {
      const outerManifestPath = join(
        import.meta.dir,
        "../examples/resource-runner-tests.resource.json",
      );
      const outerManifestBytes = readFileSync(outerManifestPath);
      const outerManifest = validateManifest(
        parseJson(outerManifestBytes.toString()),
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
        "../examples/resource-runner-receipt-inner.resource.json",
      );
      const manifestBytes = readFileSync(manifestPath);
      const manifest = validateManifest(parseJson(manifestBytes.toString()));
      const manifestSource = manifestSourceFromBytes(
        manifestPath,
        manifestBytes,
      );
      const outerPayload = process.env.AGENT_RESOURCE_ADMISSION_RECEIPT;
      const outerReceiptSha256 =
        process.env.AGENT_RESOURCE_ADMISSION_RECEIPT_SHA256;
      const outerCgroup = readFileSync("/proc/self/cgroup", "utf8");
      expect(process.env.AGENT_RESOURCE_MANIFEST_PATH).toBe(outerSource.path);
      expect(process.env.AGENT_RESOURCE_MANIFEST_SHA256).toBe(
        outerSource.sha256,
      );
      expect(process.env.AGENT_RESOURCE_JOB_ID).toBe(outerManifest.job_id);
      expect(typeof process.env.AGENT_RESOURCE_RESERVATION_ID).toBe("string");
      expect(typeof outerPayload).toBe("string");
      expect(typeof outerReceiptSha256).toBe("string");
      if (
        typeof outerPayload !== "string" ||
        typeof outerReceiptSha256 !== "string"
      ) {
        throw new TypeError(
          "the outer test envelope did not provide an admission receipt",
        );
      }
      expect(outerReceiptSha256).toBe(
        createHash("sha256").update(outerPayload).digest("hex"),
      );
      expect(
        verifyAdmissionReceipt(outerPayload, outerReceiptSha256, outerCgroup),
      ).toBe(true);
      const outerReceiptRaw = parseJson(outerPayload);
      const outerReceipt = decoded(ReceiptFieldsSchema, outerReceiptRaw);
      expect(JSON.stringify(outerReceiptRaw)).toBe(outerPayload);
      expect(outerReceiptRaw).toMatchObject({
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
      const runnerModulePath = join(
        import.meta.dir,
        "../agent-resource-run.ts",
      );
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
          report: (line) => {
            reports.push(line);
          },
        },
      );
      expect(result).toMatchObject({ ok: true, exitCode: 0 });
      const admit = reports.find((line) => line.startsWith("ADMIT "));
      expect(admit).toContain("admission_id=");
      expect(admit).toContain("reservation_id=");
      expect(admit).toContain("scope_unit=");
      expect(admit).toContain("manifest_sha256=");
      expect(admit).toContain("receipt_sha256=");

      const saved = decoded(
        SavedChildSchema,
        parseJson(readFileSync(receiptPath, "utf8")),
      );
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
      expect(typeof innerEnvironment.AGENT_RESOURCE_ADMISSION_ID).toBe(
        "string",
      );
      expect(typeof innerPayload).toBe("string");
      expect(typeof innerReceiptSha256).toBe("string");
      if (
        typeof innerPayload !== "string" ||
        typeof innerReceiptSha256 !== "string"
      ) {
        throw new TypeError(
          "the inner child did not receive an admission receipt",
        );
      }
      expect(innerReceiptSha256).toBe(
        createHash("sha256").update(innerPayload).digest("hex"),
      );
      expect(
        verifyAdmissionReceipt(innerPayload, innerReceiptSha256, saved.cgroup),
      ).toBe(true);
      const innerReceiptRaw = parseJson(innerPayload);
      const innerReceipt = decoded(ReceiptFieldsSchema, innerReceiptRaw);
      expect(JSON.stringify(innerReceiptRaw)).toBe(innerPayload);
      expect(innerReceiptRaw).toMatchObject({
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
    },
  );
});

describe("bounded execution", () => {
  test.skipIf(NO_UTIL_LINUX)(
    "fails closed when kernel enforcement is unavailable",
    async () => {
      const stateDirectory = temporaryStateDirectory();
      const reports: string[] = [];
      const result = await checkJob(cpuManifest(), {
        stateDirectory,
        snapshot: hostSnapshot(),
        kernelEnforcement: {
          available: false,
          reason: "fixture user manager unavailable",
        },
        hostOptIn: null, // hermetic: never this machine's own ~/.config/agent-resource/host.toml
        report: (line) => {
          reports.push(line);
        },
      });
      expect(result).toMatchObject({
        ok: false,
        exitCode: 69,
        reason: "admission",
      });
      expect(reports.join("\n")).toContain("kernel enforcement unavailable");
      expect(readdirSync(stateDirectory)).toEqual([]);
    },
  );

  test.skipIf(NO_CGROUP_SCOPES)(
    "reclaims an old lock left before its owner file was written",
    async () => {
      const stateDirectory = temporaryStateDirectory();
      const lockDirectory = join(stateDirectory, ".lock");
      mkdirSync(lockDirectory);
      // utimes takes epoch SECONDS as a number.
      const old = (Temporal.Now.instant().epochMilliseconds - 10_000) / 1000;
      utimesSync(lockDirectory, old, old);
      const result = await checkJob(cpuManifest(), {
        stateDirectory,
        snapshot: probeHostSnapshot(process.cwd()),
      });
      expect(result).toMatchObject({ ok: true, exitCode: 0 });
      expect(readdirSync(stateDirectory)).toEqual([]);
    },
  );

  test.skipIf(NO_CGROUP_SCOPES)(
    "injects one-thread settings and releases the reservation",
    async () => {
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
    },
  );

  test.skipIf(NO_CGROUP_SCOPES)(
    "reports a measured RAM peak and persists it beside the manifest",
    async () => {
      const stateDirectory = temporaryStateDirectory();
      const manifestDirectory = temporaryStateDirectory();
      const manifest = cpuManifest();
      const manifestPath = join(manifestDirectory, "job.resource.json");
      const manifestBytes = Buffer.from(JSON.stringify(manifest), "utf8");
      writeFileSync(manifestPath, manifestBytes);
      const manifestSource = manifestSourceFromBytes(
        manifestPath,
        manifestBytes,
      );
      const reports: string[] = [];
      const result = await executeJob(
        manifest,
        [
          process.execPath,
          "-e",
          "Buffer.alloc(4 * 1024 * 1024, 1); await Bun.sleep(300);",
        ],
        {
          stateDirectory,
          snapshot: probeHostSnapshot(process.cwd()),
          monitorIntervalMs: 25,
          manifestSource,
          report: (line) => {
            reports.push(line);
          },
        },
      );
      expect(result).toMatchObject({ ok: true, exitCode: 0 });

      const release = reports.find((line) => line.startsWith("RELEASE "));
      expect(release).toContain(`job=${manifest.job_id}`);
      expect(release).toMatch(/ram_peak_measured_bytes=\d+/u);
      expect(release).toMatch(/ram_peak_source=(cgroup|sampled)/u);
      expect(release).toContain("released_at=");
      // A CPU-only manifest never samples VRAM — see executeJob's onSample.
      expect(release).not.toContain("vram_peak_measured_bytes=");

      const peakPath = `${manifestPath}.peak.json`;
      const peakRaw = parseJson(readFileSync(peakPath, "utf8"));
      const peak = decoded(PeakFieldsSchema, peakRaw);
      expect(peakRaw).toMatchObject({
        schema: 1,
        job_id: manifest.job_id,
      });
      expect(peak.ram_peak_source).toMatch(/^(cgroup|sampled)$/u);
      expect(peak.ram_peak_measured_bytes).toBeGreaterThan(0);
      rmSync(peakPath);
    },
  );

  test.skipIf(NO_CGROUP_SCOPES)(
    "terminates the whole process group at the walltime",
    async () => {
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
          manifestSource: manifestSourceFor(
            cpuManifest({ walltime_seconds: 1 }),
          ),
        },
      );
      expect(result).toMatchObject({
        ok: false,
        exitCode: 124,
        reason: "walltime",
      });
      expect(performance.now() - started).toBeLessThan(4_000);
      expect(readdirSync(stateDirectory)).toEqual([]);
    },
  );

  test.skipIf(NO_CGROUP_SCOPES)(
    "terminates a process fanout beyond the declared ceiling",
    async () => {
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
    },
  );

  // This test deliberately triggers a REAL kernel OOM-kill against a REAL systemd scope —
  // it is not simulated (2026-09-04, recurred twice in one evening as "unattributed OOM kill on
  // agent-resource-*.scope" reports to two other fleets, once resolved by matching this run's
  // own scope UUIDs against dmesg, once by attribution failing because the dmesg ring had
  // already rolled past the run and only a firedancer journal read settled it). Before
  // investigating an unattributed `agent-resource-*.scope` OOM-kill in dmesg or a journal, check
  // whether `bun test agents/resource-control/` ran around that time — this is very likely it.
  test.skipIf(NO_CGROUP_SCOPES)(
    "the cgroup kills a job before it can exceed its RAM envelope",
    async () => {
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
    },
  );

  test.skipIf(NO_CGROUP_SCOPES)(
    "scope cleanup kills a descendant that escapes the process group",
    async () => {
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
        const statResult = fromThrowable(() =>
          readFileSync(`/proc/${escapedPid}/stat`, "utf8"),
        )();
        if (statResult.isOk()) {
          const stat = statResult.value;
          const close = stat.lastIndexOf(")");
          escapedProcessIsLive =
            close !== -1 && stat.slice(close + 2)[0] !== "Z";
        } else {
          escapedProcessIsLive = false;
        }
        if (!escapedProcessIsLive) break;
        await Bun.sleep(25);
      }

      expect(result).toMatchObject({ ok: true, exitCode: 0 });
      expect(escapedProcessIsLive).toBe(false);
      expect(readdirSync(stateDirectory)).toEqual(["escaped.pid"]);
    },
  );

  test.skipIf(NO_UTIL_LINUX)(
    "fails closed when systemd scope cleanup cannot be verified",
    () => {
      const stateDirectory = temporaryStateDirectory();
      expect(
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
    },
  );
});

// A machine that can never have cgroup enforcement (a rented container, 2026-10-05) may opt into
// sampled enforcement, once, with a reason; nothing else changes (agent-resource-run.ts, Host opt-in).
const optInFile = (text: string): string => {
  const path = join(mkdtempSync(join(tmpdir(), "arr-host-")), "host.toml");
  writeFileSync(path, text);
  return path;
};

describe("sampled enforcement (host opt-in)", () => {
  test("no file is no opt-in; a valid file carries its reason; an invalid one throws, never ignored", () => {
    expect(readHostOptIn(join(tmpdir(), "arr-absent", "host.toml"))).toBeNull();
    expect(
      readHostOptIn(
        optInFile(
          'schema = 1\nsampled_enforcement_reason = "Vast container: no user systemd"\n',
        ),
      ),
    ).toEqual({
      sampled_enforcement_reason: "Vast container: no user systemd",
    });
    expect(() =>
      readHostOptIn(
        optInFile('schema = 1\nsampled_enforcement_reason = "  "\n'),
      ),
    ).toThrow("is invalid");
    expect(() =>
      readHostOptIn(
        optInFile('schema = 1\nsampled_enforcement_reason = "x"\nextra = 1\n'),
      ),
    ).toThrow("is invalid");
    expect(() => readHostOptIn(optInFile("schema = ["))).toThrow(
      "not valid TOML",
    );
  });

  test("cgroups win where they work; without them, no opt-in still refuses; with it, sampled", () => {
    const optIn = { sampled_enforcement_reason: "rented container" };
    expect(resolveEnforcement({ available: true }, optIn)).toEqual({
      ok: true,
      enforcement: { kind: "cgroup" },
    });
    const refused = resolveEnforcement(
      { available: false, reason: "read-only cgroup" },
      null,
    );
    expect(refused.ok).toBe(false);
    expect(refused.ok ? "" : refused.reason).toContain(
      "kernel enforcement unavailable",
    );
    expect(refused.ok ? "" : refused.reason).toContain("host.toml");
    expect(
      resolveEnforcement(
        { available: false, reason: "read-only cgroup" },
        optIn,
      ),
    ).toEqual({
      ok: true,
      enforcement: {
        kind: "sampled",
        reason: "read-only cgroup; host opt-in: rented container",
      },
    });
  });

  test("the sampled launch keeps the session and the affinity, and starts no systemd scope", () => {
    const argv = buildSampledLaunch(reservation({ cpu_ids: [4, 5] }), [
      "sh",
      "-c",
      "true",
    ]);
    expect(argv).toEqual([
      "setsid",
      "--wait",
      "taskset",
      "-c",
      "4,5",
      "sh",
      "-c",
      "true",
    ]);
    expect(argv).not.toContain("systemd-run");
  });

  // checkJob refuses before admission without setsid/taskset (Linux util-linux): skipped, and
  // counted as skipped, on a machine that lacks them (macOS) rather than failing for that reason.
  test.skipIf(Bun.which("taskset") === null || Bun.which("setsid") === null)(
    "the ADMIT line says no cgroup bounds the job, and why",
    async () => {
      const reports: string[] = [];
      const result = await checkJob(cpuManifest(), {
        stateDirectory: temporaryStateDirectory(),
        snapshot: hostSnapshot(),
        kernelEnforcement: { available: false, reason: "read-only cgroup" },
        hostOptIn: { sampled_enforcement_reason: "rented container" },
        report: (line) => {
          reports.push(line);
        },
      });
      expect(result).toMatchObject({ ok: true, exitCode: 0 });
      const admit = reports.join("\n");
      expect(admit).toContain(
        "enforcement=affinity+sampled-process-group cgroup=none",
      );
      expect(admit).toContain(
        'cgroup_reason="read-only cgroup; host opt-in: rented container"',
      );
    },
  );
});
