import { afterEach, expect, test } from "bun:test";
import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
  readFile,
  readdir,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  gpuReadFromState,
  readGpuState,
  sampleGpu,
} from "../src/gpu-samples.ts";
import {
  hostHasNvidiaSmi,
  parseGpuXml,
  runGpuSampler,
  gpuSlotHeld,
} from "../src/gpu-sampler.ts";
import { GPU_XML, ownerState } from "./gpu-owner-fixture.ts";
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
async function fixture(hang = false) {
  const dir = await mkdtemp(join(tmpdir(), "gpu-owner-"));
  dirs.push(dir);
  const calls = join(dir, "calls");
  const procRoot = join(dir, "proc");
  await mkdir(procRoot);
  const slotDirectory = join(dir, "slots");
  await mkdir(slotDirectory);
  const lslocksPath = join(dir, "lslocks");
  await writeFile(
    lslocksPath,
    `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(JSON.stringify({ locks: [] }))});\n`,
    { mode: 0o755 },
  );
  const binary = join(dir, "nvidia-smi");
  // A real executable with a bounded native timeout; never falls back to the host binary.
  await writeFile(
    binary,
    `#!${process.execPath}\nimport { appendFile } from "node:fs/promises"; await appendFile(${JSON.stringify(calls)}, "x");\n${hang ? "await Bun.sleep(30000);" : `process.stdout.write(${JSON.stringify(GPU_XML)});`}\n`,
    { mode: 0o755 },
  );
  return {
    dir,
    calls,
    binary,
    slotDirectory,
    options: {
      statePath: join(dir, "state.json"),
      path: dir,
      fallbacks: [],
      procRoot,
      slotDirectory,
      lslocksPath,
      timeoutMs: hang ? 250 : 5000,
    },
  };
}

test.skipIf(process.platform !== "linux")(
  "slot reader uses explicit unit environment and handles empty and unlocked slot directories",
  async () => {
    const { dir, options, calls } = await fixture();
    const runtime = join(dir, "runtime");
    const slots = join(runtime, "agent-resource", "slots");
    await mkdir(slots, { recursive: true });
    const module = join(import.meta.dir, "../src/gpu-sampler.ts");
    const childOptions = {
      ...options,
      slotDirectory: undefined,
      lslocksPath: undefined,
    };
    const script = `import { gpuSlotHeld, runGpuSampler } from ${JSON.stringify(module)};
      const options = ${JSON.stringify(childOptions)};
      if (await gpuSlotHeld(options) !== false) throw new Error("expected no slot holder");
      process.stdout.write(await runGpuSampler(options));`;
    for (const populated of [false, true]) {
      if (populated) await writeFile(join(slots, "gpu.0.0"), "");
      const child = Bun.spawn([process.execPath, "-e", script], {
        // No inherited shell variables: systemd supplies the runtime root and unit PATH.
        env: { HOME: dir, XDG_RUNTIME_DIR: runtime, PATH: "/usr/bin:/bin" },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 10_000,
      });
      const [stdout, stderr, exit] = await Promise.all([
        child.stdout.text(),
        child.stderr.text(),
        child.exited,
      ]);
      expect(exit, stderr).toBe(0);
      expect(stdout).toBe(populated ? "refused: 60s interval" : "sampled");
    }
    expect(await Bun.file(calls).text()).toBe("x");
  },
);

test("unreadable slot inventory writes a fresh reasoned pause and resumes immediately", async () => {
  const { options, calls, dir } = await fixture();
  const at = 1_000_000;
  expect(await runGpuSampler({ ...options, now: () => at })).toBe("sampled");
  const previous = await readGpuState(options.statePath);
  const invalid = join(dir, "not-a-directory");
  await writeFile(invalid, "");
  const result = await runGpuSampler({
    ...options,
    slotDirectory: invalid,
    now: () => at + 1,
  });
  expect(result).toContain("ENOTDIR");
  expect(await readGpuState(options.statePath)).toMatchObject({
    attemptAt: at + 1,
    sampledAt: at + 1,
    lastProbeAt: at,
    paused: true,
    na: true,
    why: result,
    samples: previous?.samples,
  });
  expect(await Bun.file(calls).text()).toBe("x");
  expect(await runGpuSampler({ ...options, now: () => at + 2 })).toBe(
    "sampled",
  );
});

test("slot reader reports command and parse failures with their underlying errors", async () => {
  const { options, slotDirectory } = await fixture();
  await writeFile(join(slotDirectory, "gpu.0.0"), "");
  await writeFile(
    options.lslocksPath,
    `#!${process.execPath}\nprocess.stderr.write("inventory denied"); process.exit(3);\n`,
  );
  expect(await gpuSlotHeld(options)).toEqual({
    error: `${options.lslocksPath} exited 3: inventory denied`,
  });
  await writeFile(
    options.lslocksPath,
    `#!${process.execPath}\nprocess.stdout.write('invalid');\n`,
  );
  expect(JSON.stringify(await gpuSlotHeld(options))).toContain("invalid");
  expect(
    JSON.stringify(
      await gpuSlotHeld({ ...options, lslocksPath: "/nonexistent/lslocks" }),
    ),
  ).toContain("cannot start");
});

test("pauses during a held GPU slot without probing or counting a miss, then resumes immediately", async () => {
  const { options, calls, slotDirectory } = await fixture();
  const at = 1_000_000;
  expect(await runGpuSampler({ ...options, now: () => at })).toBe("sampled");
  const good = await readGpuState(options.statePath);
  expect(good?.sampledAt).toBe(at);

  const slot = join(slotDirectory, "gpu.0.0");
  await writeFile(slot, "");
  await writeFile(
    options.lslocksPath,
    `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(JSON.stringify({ locks: [{ path: slot, pid: 2468 }] }))});\n`,
    { mode: 0o755 },
  );
  await Bun.write(
    options.statePath,
    `${JSON.stringify({
      ...good,
      unresponsiveSince: at - 1,
      stallEvidence: "prior probe stall",
    })}\n`,
  );
  expect(await runGpuSampler({ ...options, now: () => at + 60_000 })).toBe(
    "probe paused: GPU job admitted",
  );
  const paused = await readGpuState(options.statePath);
  expect(paused).toMatchObject({
    na: true,
    paused: true,
    holder: { slot: "gpu.0.0", pid: 2468 },
    lastProbeAt: at,
    sampledAt: at + 60_000,
    attemptAt: at + 60_000,
    consecutiveProbeMisses: 0,
    samples: good?.samples,
  });
  expect(gpuReadFromState(paused, at + 60_000).ok).toBe(true);
  expect(paused?.unresponsiveSince).toBeUndefined();
  expect(await Bun.file(calls).text()).toBe("x");

  await writeFile(
    options.lslocksPath,
    `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(JSON.stringify({ locks: [] }))});\n`,
    { mode: 0o755 },
  );
  expect(await runGpuSampler({ ...options, now: () => at + 60_001 })).toBe(
    "sampled",
  );
  expect(await Bun.file(calls).text()).toBe("xx");
  expect((await readGpuState(options.statePath))?.sampledAt).toBe(at + 60_001);
  expect((await readGpuState(options.statePath))?.lastProbeAt).toBe(
    at + 60_001,
  );
});
test("one XML snapshot includes GPU memory, power, utilization and per-process memory", () => {
  expect(parseGpuXml(GPU_XML)).toEqual({
    devices: ownerState(0).devices,
    processes: ownerState(0).processes,
  });
  expect(parseGpuXml(GPU_XML.replace("3584 MiB", "invalid"))).toBeUndefined();
  expect(parseGpuXml("garbage")).toBeUndefined();
  expect(
    parseGpuXml(GPU_XML.replace("512 MiB", "N/A"))?.processes[0]?.usedMiB,
  ).toBeNull();
});
test("success and failure both persist the sixty-second cooldown across sampler restarts", async () => {
  const { calls, options, dir } = await fixture();
  let now = 1_000_000;
  expect(await runGpuSampler({ ...options, now: () => now })).toBe("sampled");
  now += 59_999;
  expect(await runGpuSampler({ ...options, now: () => now })).toContain("60s");
  now += 1;
  expect(await runGpuSampler({ ...options, now: () => now })).toBe("sampled");
  expect(await readFile(calls, "utf8")).toBe("xx");
  expect((await readGpuState(options.statePath))?.samples).toHaveLength(2);
  expect(
    (await readdir(dir)).some((p) => p.endsWith(".tmp") || p.endsWith(".lock")),
  ).toBe(false);
  const failed = await fixture(true);
  now = 2_000_000;
  expect(await runGpuSampler({ ...failed.options, now: () => now })).toBe(
    "slow sample",
  );
  expect(
    (await readGpuState(failed.options.statePath))?.unresponsiveSince,
  ).toBeUndefined();
  expect(
    await runGpuSampler({ ...failed.options, now: () => now + 59_999 }),
  ).toContain("60s");
  expect(await readFile(failed.calls, "utf8")).toBe("x");
  now += 60_000;
  expect(await runGpuSampler({ ...failed.options, now: () => now })).toBe(
    "unresponsive",
  );
  expect(
    (await readGpuState(failed.options.statePath))?.stallEvidence,
  ).toContain("2 consecutive probe deadlines missed");
  await writeFile(
    failed.binary,
    `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(GPU_XML)});\n`,
    { mode: 0o755 },
  );
  now += 60_000;
  expect(await runGpuSampler({ ...failed.options, now: () => now })).toBe(
    "sampled",
  );
  const recovered = await readGpuState(failed.options.statePath);
  expect(recovered?.unresponsiveSince).toBeUndefined();
  expect(recovered?.consecutiveProbeMisses).toBe(0);
});
test("concurrent owner requests and many consumers never multiply a hanging driver process", async () => {
  const { options, calls } = await fixture(true);
  const module = join(import.meta.dir, "../src/gpu-sampler.ts");
  const script = `import { runGpuSampler } from ${JSON.stringify(module)}; process.stdout.write(await runGpuSampler(${JSON.stringify({ ...options, timeoutMs: 1500 })}));`;
  const owners = Array.from({ length: 10 }, async () => {
    const child = Bun.spawn([process.execPath, "-e", script], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 8000,
    });
    const [out, stderr, exit] = await Promise.all([
      child.stdout.text(),
      child.stderr.text(),
      child.exited,
    ]);
    expect(stderr).toBe("");
    expect(exit).toBe(0);
    return out;
  });
  const deadline = performance.now() + 5000;
  while (!(await Bun.file(calls).exists()) && performance.now() < deadline)
    await Bun.sleep(10);
  const readers = await Promise.all(
    Array.from({ length: 40 }, () => sampleGpu(options)),
  );
  expect(readers.every((r) => !r.ok)).toBe(true);
  expect(
    (await Promise.all(owners)).filter((out) => out === "slow sample"),
  ).toHaveLength(1);
  expect(
    (await readGpuState(options.statePath))?.unresponsiveSince,
  ).toBeUndefined();
  expect(await readFile(calls, "utf8")).toBe("x");
  expect(await runGpuSampler(options)).toContain("60s");
  expect(await readFile(calls, "utf8")).toBe("x");
}, 15000);
test("an existing process in any state refuses a start even after the interval and preserves since", async () => {
  const { options, calls } = await fixture();
  const pid = join(options.procRoot, "123");
  await mkdir(pid);
  await writeFile(join(pid, "comm"), "nvidia-smi\n");
  await writeFile(join(pid, "cmdline"), "");
  let now = 1_000_000;
  for (const state of ["D", "Z", "S", "R"]) {
    await writeFile(join(pid, "stat"), `123 (nvidia-smi) ${state}`);
    const at = now;
    expect(await runGpuSampler({ ...options, now: () => at })).toContain(
      state === "D" ? "slow sample" : "unresponsive",
    );
    expect(await Bun.file(calls).exists()).toBe(false);
    now += 60_001;
  }
  expect((await readGpuState(options.statePath))?.unresponsiveSince).toBe(
    1_060_001,
  );
});
test.skipIf(process.platform !== "linux")(
  "host inventory detects a real hanging fake executable",
  async () => {
    const { binary, options, calls } = await fixture(true);
    const child = Bun.spawn([binary], {
      stdout: "ignore",
      stderr: "ignore",
      timeout: 5000,
    });
    await using _child = {
      [Symbol.asyncDispose]: async () => {
        child.kill("SIGKILL");
        await child.exited;
      },
    };
    {
      const deadline = performance.now() + 2000;
      while (!(await Bun.file(calls).exists()) && performance.now() < deadline)
        await Bun.sleep(10);
      expect(await hostHasNvidiaSmi()).toBe(true);
      expect(await runGpuSampler({ ...options, procRoot: "/proc" })).toContain(
        "nvidia-smi exists",
      );
      expect(await readFile(calls, "utf8")).toBe("x");
    }
  },
);
test("readers serve only fresh state and preserve an explicit unresponsive verdict", async () => {
  const { options } = await fixture();
  const now = 1_000_000;
  await Bun.write(options.statePath, JSON.stringify(ownerState(now)));
  expect(await sampleGpu({ ...options, now })).toMatchObject({
    ok: true,
    value: { memTotalGiB: 12 },
  });
  expect(await sampleGpu({ ...options, now: now + 120_001 })).toMatchObject({
    ok: false,
    why: "stale (GPU sample expired)",
  });
  expect(gpuReadFromState(ownerState(now), now - 1)).toMatchObject({
    ok: false,
  });
  expect(
    gpuReadFromState({ ...ownerState(now), unresponsiveSince: now }, now),
  ).toMatchObject({
    ok: false,
    why: "GPU stall recorded since 1970-01-01T00:16:40Z (evidence unavailable)",
  });
  await Bun.write(options.statePath, "corrupt");
  expect(await readGpuState(options.statePath)).toBeUndefined();
});
test("an abandoned owner lock is never expired by age", async () => {
  const { options, calls } = await fixture();
  await mkdir(`${options.statePath}.lock`);
  expect(await runGpuSampler(options)).toContain("sampler lock exists");
  expect(await Bun.file(calls).exists()).toBe(false);
});

async function crashedLock(statePath: string, pid: number) {
  const lock = `${statePath}.lock`;
  await mkdir(lock);
  await Bun.write(
    join(lock, "owner.json"),
    JSON.stringify({ pid, token: randomUUID() }),
  );
}
test("a recorded live owner is never reclaimed even without a driver process", async () => {
  const { options, calls } = await fixture();
  await crashedLock(options.statePath, process.pid);
  expect(await runGpuSampler(options)).toContain("sampler lock exists");
  expect(await Bun.file(calls).exists()).toBe(false);
});
test("dead-owner recovery still refuses any surviving nvidia-smi process", async () => {
  const { options, calls } = await fixture();
  await crashedLock(options.statePath, 2147483647);
  const pid = join(options.procRoot, "123");
  await mkdir(pid);
  await Bun.write(join(pid, "comm"), "nvidia-smi\n");
  await Bun.write(join(pid, "cmdline"), "");
  expect(await runGpuSampler(options)).toContain("sampler lock exists");
  expect(await Bun.file(calls).exists()).toBe(false);
});
test("concurrent reclaimers of a dead owner still start only one hanging driver", async () => {
  const { options, calls, dir } = await fixture(true);
  await crashedLock(options.statePath, 2147483647);
  const module = join(import.meta.dir, "../src/gpu-sampler.ts");
  const script = `import { runGpuSampler } from ${JSON.stringify(module)}; process.stdout.write(await runGpuSampler(${JSON.stringify({ ...options, timeoutMs: 1000 })}));`;
  const results = await Promise.all(
    Array.from({ length: 12 }, async () => {
      const child = Bun.spawn([process.execPath, "-e", script], {
        stdout: "pipe",
        stderr: "pipe",
        timeout: 8000,
      });
      const [out, stderr, exit] = await Promise.all([
        child.stdout.text(),
        child.stderr.text(),
        child.exited,
      ]);
      expect(exit, stderr).toBe(0);
      return out;
    }),
  );
  expect(results.filter((value) => value === "slow sample")).toHaveLength(1);
  expect(await Bun.file(calls).text()).toBe("x");
  expect(
    (await readdir(dir)).filter((name) => name.includes(".dead-")),
  ).toHaveLength(1);
  expect(await runGpuSampler(options)).toContain("60s");
}, 15000);
test("dead owner and absent driver allow recovery without discarding cooldown", async () => {
  const { options, calls } = await fixture();
  const now = 1_000_000;
  await Bun.write(options.statePath, JSON.stringify(ownerState(now)));
  await crashedLock(options.statePath, 2147483647);
  expect(await runGpuSampler({ ...options, now: () => now + 1 })).toContain(
    "60s",
  );
  expect(await Bun.file(calls).exists()).toBe(false);
  expect(await runGpuSampler({ ...options, now: () => now + 60_001 })).toBe(
    "sampled",
  );
  expect(await Bun.file(calls).text()).toBe("x");
});
