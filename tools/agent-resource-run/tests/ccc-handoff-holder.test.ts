import { expect, spyOn, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gpuAdmissionRefusal } from "../src/agent-resource-run.ts";
import type { GpuState } from "@dotfiles/shared/src/gpu-samples.ts";

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

const request = { gpu_id: 0, vram_peak_bytes: 128 * 1024 ** 2 };
const stat = (startTime: string, parent = 456) =>
  `123 (ccc worker) S ${parent} ${Array.from({ length: 17 }, () => "0").join(" ")} ${startTime} 0\n`;

async function fixture({ parent = 456, startedAt = 900 } = {}) {
  const root = await mkdtemp(join(tmpdir(), "arr-ccc-handoff-"));
  await mkdir(join(root, "sys/kernel/random"), { recursive: true });
  await Bun.write(join(root, "sys/kernel/random/boot_id"), "fixture-boot\n");
  const observation = {
    rawDriverPid: 123,
    captureStartedAt: 1001,
    captureFinishedAt: 1002,
    status: "read" as const,
    before: { status: "read" as const, value: stat("100", parent) },
    after: { status: "read" as const, value: stat("100", parent) },
    processStatus: {
      status: "read" as const,
      value: `Pid:\t123\nTgid:\t123\nNSpid:\t123\nPPid:\t${parent}\n`,
    },
    namespace: { status: "read" as const, value: "pid:[1]" },
    local: { pid: 123, tgid: 123, nspid: [123], starttime: "100" },
  };
  const state: GpuState = {
    schema: 1,
    attemptAt: 1000,
    sampledAt: 1000,
    paused: true,
    devices: [{ id: 0, totalMiB: 12288, usedMiB: 100, utilPct: 0 }],
    processes: [{ pid: 123, usedMiB: 100 }],
    samples: [
      { ts: 1000, nextTs: 61000, utilPct: 0, memUsedGiB: 0.1, memTotalGiB: 1 },
    ],
    processIdentity: {
      version: 1,
      sampleAt: 1000,
      captureStartedAt: 1001,
      captureFinishedAt: 1003,
      driverBinding: "unknown",
      bootId: { status: "read", value: "fixture-boot" },
      collector: { ...observation, rawDriverPid: 999 },
      processes: [observation],
      omittedProcesses: 0,
    },
  };
  await mkdir(join(root, "123/task/123"), { recursive: true });
  await Bun.write(join(root, "123/stat"), stat("100", parent));
  await Bun.write(
    join(root, "123/status"),
    `State:\tS\nPid:\t123\nTgid:\t123\nNSpid:\t123\n`,
  );
  await Bun.write(
    join(root, "123/cgroup"),
    "0::/user.slice/ccc-daemon.service\n",
  );
  return {
    root,
    state,
    options: {
      procRoot: root,
      state,
      cccHandoffHeld: true,
      cccSupervisor: () => Promise.resolve({ pid: 456, startedAt }),
    },
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
}

test("resident ccc admission recognizes the live partitioned ccc worker and retains the VRAM budget", async () => {
  await using f = await fixture();
  expect(await gpuAdmissionRefusal(request, 512, f.options)).toBeUndefined();
  expect(
    await gpuAdmissionRefusal(
      { ...request, vram_peak_bytes: 10000 * 1024 ** 2 },
      512,
      f.options,
    ),
  ).toContain("GPU VRAM budget exceeded");
});

test("resident ccc admission warns without refusing about a sampled parent mismatch", async () => {
  await using f = await fixture({ parent: 789 });
  expect(await advisoryAdmission(request, 512, f.options)).toContain(
    "ownership unverified pid=123",
  );
});

test("resident ccc admission warns without refusing about a supervisor restarted after the sample", async () => {
  await using f = await fixture({ startedAt: 1001 });
  expect(await advisoryAdmission(request, 512, f.options)).toContain(
    "ownership unverified pid=123",
  );
});

test("live ccc recognition does not depend on the legacy handoff flag", async () => {
  await using f = await fixture();
  expect(
    await advisoryAdmission(request, 512, {
      ...f.options,
      cccHandoffHeld: false,
    }),
  ).toBe("");
});

test("resident ccc admission warns without refusing about a reused PID and a live worker with unreadable status", async () => {
  await using f = await fixture();
  await mkdir(join(f.root, "123/task/123"), { recursive: true });
  await Bun.write(join(f.root, "123/stat"), stat("200"));
  expect(await advisoryAdmission(request, 512, f.options)).toContain(
    "ownership unverified pid=123",
  );
  await Bun.write(join(f.root, "123/stat"), stat("100"));
  await rm(join(f.root, "123/status"));
  expect(await advisoryAdmission(request, 512, f.options)).toContain(
    "status-unreadable-or-gone",
  );
});

test("resident ccc admission warns without refusing about an unrelated absent holder", async () => {
  await using f = await fixture();
  f.state.processes.push({ pid: 789, usedMiB: 1 });
  expect(await advisoryAdmission(request, 512, f.options)).toContain(
    "identity unverified pid=789",
  );
});

test("ccc supervisor lookup parses precise systemd UTC timestamps and warns without refusing", async () => {
  await using f = await fixture();
  const bin = join(f.root, "bin");
  await mkdir(bin);
  const reply = join(f.root, "supervisor-reply");
  await Bun.write(
    join(bin, "systemctl"),
    `#!${process.execPath}
const expected = ["--user", "--timestamp=us+utc", "show", "ccc-daemon.service", "--property=MainPID,ExecMainStartTimestamp"];
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(expected)) process.exit(1);
process.stdout.write(await Bun.file(${JSON.stringify(reply)}).text());
`,
    { mode: 0o755 },
  );
  const { cccSupervisor: _injected, ...options } = f.options;
  await chmod(join(bin, "systemctl"), 0o755);
  async function inspect() {
    const child = Bun.spawn(
      [
        process.execPath,
        "--eval",
        `
import { gpuAdmissionRefusal } from ${JSON.stringify(join(import.meta.dir, "../src/agent-resource-run.ts"))};
process.stdout.write(await gpuAdmissionRefusal(${JSON.stringify(request)}, 512, ${JSON.stringify(options)}) ?? "admit");
`,
      ],
      {
        env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 5000,
      },
    );
    const [stdout, stderr, code] = await Promise.all([
      child.stdout.text(),
      child.stderr.text(),
      child.exited,
    ]);
    expect(code).toBe(0);
    expect(stdout).toBe("admit");
    return stderr;
  }
  await Bun.write(
    reply,
    "MainPID=456\nExecMainStartTimestamp=Thu 1970-01-01 00:00:00.900000 UTC\n",
  );
  expect(await inspect()).toBe("");
  for (const timestamp of ["Thu 1970-01-01 00:00:01.001000 UTC", "n/a"]) {
    await Bun.write(
      reply,
      `MainPID=456\nExecMainStartTimestamp=${timestamp}\n`,
    );
    const warning = await inspect();
    expect(warning).toStartWith(
      "WARN GPU holder check is advisory, not refusing: ",
    );
    expect(warning).toContain("ownership unverified pid=123");
  }
});

for (const invalid of [
  "missing-identity",
  "different-boot",
  "sample-mismatch",
  "supervisor-unavailable",
])
  test(`resident ccc admission warns without refusing for ${invalid}`, async () => {
    await using f = await fixture();
    if (invalid === "missing-identity") f.state.processIdentity = undefined;
    if (invalid === "different-boot")
      await Bun.write(
        join(f.root, "sys/kernel/random/boot_id"),
        "another-boot",
      );
    if (invalid === "sample-mismatch") f.state.sampledAt = 999;
    const options =
      invalid === "supervisor-unavailable"
        ? { ...f.options, cccSupervisor: () => Promise.resolve(undefined) }
        : f.options;
    expect(await advisoryAdmission(request, 512, options)).toContain(
      "ownership unverified pid=123",
    );
  });

// Research receives at most total VRAM minus the safety margin and fixed ccc reservation.
test("maximum research grant cannot overlap the standing ccc partition", async () => {
  await using f = await fixture();
  f.state.processes = [];
  expect(
    await gpuAdmissionRefusal(
      { gpu_id: 0, vram_peak_bytes: 9728 * 1024 ** 2 },
      512,
      f.options,
    ),
  ).toBeUndefined();
  const overlap = await gpuAdmissionRefusal(
    { gpu_id: 0, vram_peak_bytes: 9728 * 1024 ** 2 + 1 },
    512,
    f.options,
  );
  expect(overlap).toContain("ccc_partition=2147483648");
  expect(overlap).toContain("total=12884901888");
  expect(overlap).toContain("safety_margin=512MiB");
});
