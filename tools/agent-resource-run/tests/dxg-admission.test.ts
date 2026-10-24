import { expect, mock, spyOn, test } from "bun:test";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gpuAdmissionRefusal } from "../src/agent-resource-run.ts";
import { type GpuState, readGpuState } from "../../shared/src/gpu-samples.ts";
import { DecisionRecord, withDecision } from "../src/lib/decision-record.ts";
import { runGpuSampler } from "../../shared/src/gpu-sampler.ts";

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
// Intentionally stale, paused, and missing both holders and unresponsiveSince.
const state = {
  schema: 1 as const,
  attemptAt: 1,
  sampledAt: 1,
  paused: true as const,
  devices: [{ id: 0, totalMiB: 3072, usedMiB: 0, utilPct: 0 }],
  processes: [],
  samples: [],
};
// Same schema as the frozen producer; collector PID is deliberately unrelated.
function sampleIdentity(): NonNullable<GpuState["processIdentity"]> {
  const observation: NonNullable<
    GpuState["processIdentity"]
  >["processes"][number] = {
    rawDriverPid: 123,
    captureStartedAt: 2,
    captureFinishedAt: 3,
    status: "read",
    before: { status: "read", value: "PRIVATE stat blob" },
    after: { status: "read", value: "PRIVATE stat blob" },
    processStatus: { status: "read", value: "PRIVATE status blob" },
    namespace: { status: "read", value: "PRIVATE namespace" },
    local: { pid: 123, tgid: 123, nspid: [123], starttime: "100" },
  };
  return {
    version: 1,
    sampleAt: 1,
    captureStartedAt: 2,
    captureFinishedAt: 4,
    driverBinding: "unknown",
    bootId: { status: "read", value: "PRIVATE boot" },
    collector: { ...observation, rawDriverPid: 999 },
    processes: [observation],
    omittedProcesses: 0,
  };
}
function retainedState(): GpuState {
  return {
    ...state,
    processes: [{ pid: 123, usedMiB: 1 }],
    samples: [
      { ts: 1, nextTs: 60001, utilPct: 0, memUsedGiB: 0, memTotalGiB: 1 },
    ],
    processIdentity: sampleIdentity(),
  };
}
const stat = (
  value: string,
  { pid = "123", startTime = "100" }: { pid?: string; startTime?: string } = {},
) =>
  `${pid} (worker ) with spaces) ${value} ${Array.from(
    { length: 18 },
    (_, index) => String(index + 1),
  ).join(" ")} ${startTime} 23 24\n`;
const statWithoutStartTime = (value: string, pid = "123") =>
  `${pid} (worker) ${value} 1\n`;

async function fixture(scope = "unmanaged.scope") {
  const root = await fs.mkdtemp(join(tmpdir(), "arr-dxg-admission-"));
  const base = join(root, "123");
  await fs.mkdir(base);
  await fs.mkdir(join(base, "task", "123"), { recursive: true });
  await fs.writeFile(join(base, "stat"), stat("D"));
  await fs.writeFile(join(base, "wchan"), "dxgk_wait_for_completion\n");
  await fs.writeFile(join(base, "cgroup"), `0::/user.slice/${scope}\n`);
  await fs.writeFile(
    join(base, "environ"),
    `AGENT_RESOURCE_ADMISSION_RECEIPT=${JSON.stringify({
      reservation_id: "existing",
      device: { kind: "gpu", gpu_id: 0, vram_peak_bytes: 256 * 1024 ** 2 },
    })}\0`,
  );
  return {
    root,
    base,
    [Symbol.asyncDispose]: () => fs.rm(root, { recursive: true, force: true }),
  };
}
function confirmation(onSleep?: (milliseconds: number) => Promise<void>) {
  let now = 0;
  const sleeps: number[] = [];
  return {
    sleeps,
    options: {
      now: () => now,
      sleep: async (milliseconds: number) => {
        sleeps.push(milliseconds);
        await onSleep?.(milliseconds);
        now += milliseconds;
      },
    },
  };
}

async function addTask(
  f: { base: string },
  tid: string,
  {
    state: processState = "D",
    wchan = "dxgk_wait_for_completion\n",
    startTime = "200",
  }: { state?: string; wchan?: string; startTime?: string } = {},
) {
  const base = join(f.base, "task", tid);
  await fs.mkdir(base);
  await fs.writeFile(
    join(base, "stat"),
    stat(processState, { pid: tid, startTime }),
  );
  await fs.writeFile(join(base, "wchan"), wchan);
  return { base, statPath: join(base, "stat"), wchanPath: join(base, "wchan") };
}

for (const target of ["leader", "task"] as const)
  for (let observation = 2; observation <= 10; observation += 1)
    test(`${target} waking at observation ${observation} admits after prior stalls`, async () => {
      await using f = await fixture();
      let statPath = join(f.base, "stat");
      let pid = "123";
      let startTime = "100";
      if (target === "task") {
        await fs.writeFile(statPath, stat("Z"));
        statPath = (await addTask(f, "456")).statPath;
        pid = "456";
        startTime = "200";
      }
      let round = 1;
      const control = confirmation(async () => {
        round += 1;
        await fs.writeFile(
          statPath,
          stat(round === observation ? "S" : "D", { pid, startTime }),
        );
      });
      expect(
        await dxgAdvisory(request, 512, {
          procRoot: f.root,
          state,
          ...control.options,
        }),
      ).toBeUndefined();
      expect(control.sleeps).toEqual(
        Array.from({ length: observation - 1 }, () => 3000),
      );
    });

for (const elapsed of [2999, 3000, 4500])
  test(`dxg confirmation requires at least 3000 ms per interval: elapsed=${elapsed}`, async () => {
    await using f = await fixture();
    let now = 0;
    const sleeps: number[] = [];
    const refusal = await dxgAdvisory(request, 512, {
      procRoot: f.root,
      state,
      now: () => now,
      sleep: (milliseconds) => {
        sleeps.push(milliseconds);
        now += elapsed;
        return Promise.resolve();
      },
    });
    if (elapsed < 3000) {
      expect(refusal).toBeUndefined();
      expect(sleeps).toEqual([3000]);
    } else {
      expect(refusal).toContain("observations=10 interval_ms>=3000");
      expect(sleeps).toEqual(Array.from({ length: 9 }, () => 3000));
    }
  });

for (const scope of ["unmanaged.scope", "agent-resource-existing.scope"])
  test(`paused stale cache cannot mask a live dxg D-state in ${scope}`, async () => {
    await using f = await fixture(scope);
    const control = confirmation();
    const refusal = await dxgAdvisory(request, 512, {
      procRoot: f.root,
      state,
      currentReservationId: "existing",
      ...control.options,
    });
    expect(refusal).toContain("GPU persistent dxg stall pid=123 state=D");
    expect(refusal).toContain("observations=10 interval_ms>=3000");
    expect(control.sleeps).toEqual(Array.from({ length: 9 }, () => 3000));
    expect(refusal).toContain("dxgk_wait_for_completion");
    expect(refusal).toContain(join(f.base, "stat"));
    expect(refusal).toContain(join(f.base, "wchan"));
  });

test("Z leader with a distinct live dxg D-state task admits with advisory task evidence", async () => {
  await using f = await fixture();
  await fs.writeFile(join(f.base, "stat"), stat("Z"));
  const task = await addTask(f, "456");
  const control = confirmation();
  const refusal = await dxgAdvisory(request, 512, {
    procRoot: f.root,
    state,
    ...control.options,
  });
  expect(refusal).toContain(
    "GPU persistent dxg stall tgid=123 tid=456 leader_state=Z task_state=D",
  );
  expect(control.sleeps).toEqual(Array.from({ length: 9 }, () => 3000));
  for (const path of [join(f.base, "stat"), task.statPath, task.wchanPath])
    expect(refusal).toContain(path);
});

test("Z leader without a distinct D-state task does not refuse", async () => {
  await using f = await fixture();
  await fs.writeFile(join(f.base, "stat"), stat("Z"));
  expect(
    await dxgAdvisory(request, 512, { procRoot: f.root, state }),
  ).toBeUndefined();
});

for (const transition of ["exit", "wake", "reuse"])
  test(`leader ${transition} during confirmation invalidates its candidate`, async () => {
    await using f = await fixture();
    const control = confirmation(async () => {
      if (transition === "exit") await fs.rm(join(f.base, "stat"));
      else
        await fs.writeFile(
          join(f.base, "stat"),
          stat(transition === "wake" ? "S" : "D", {
            startTime: transition === "reuse" ? "101" : "100",
          }),
        );
    });
    expect(
      await dxgAdvisory(request, 512, {
        procRoot: f.root,
        state,
        ...control.options,
      }),
    ).toBeUndefined();
    expect(control.sleeps).toEqual([3000]);
  });

for (const transition of ["exit", "wake", "reuse"])
  test(`task ${transition} during confirmation invalidates its candidate`, async () => {
    await using f = await fixture();
    await fs.writeFile(join(f.base, "stat"), stat("Z"));
    const task = await addTask(f, "456");
    const control = confirmation(async () => {
      if (transition === "exit") await fs.rm(task.base, { recursive: true });
      else
        await fs.writeFile(
          task.statPath,
          stat(transition === "wake" ? "S" : "D", {
            pid: "456",
            startTime: transition === "reuse" ? "201" : "200",
          }),
        );
    });
    expect(
      await dxgAdvisory(request, 512, {
        procRoot: f.root,
        state,
        ...control.options,
      }),
    ).toBeUndefined();
    expect(control.sleeps).toEqual([3000]);
  });

test("confirmation evidence becoming inaccessible records advisory evidence", async () => {
  await using f = await fixture();
  const wchanPath = join(f.base, "wchan");
  const control = confirmation(async () => fs.rm(wchanPath, { force: true }));
  expect(
    await dxgAdvisory(request, 512, {
      procRoot: f.root,
      state,
      ...control.options,
    }),
  ).toContain(
    `GPU D-state wait channel unavailable pid=123; evidence=${wchanPath}`,
  );
  expect(control.sleeps).toEqual(Array.from({ length: 9 }, () => 3000));
});

test("leader confirmation with an extant stat missing its identity records advisory evidence", async () => {
  await using f = await fixture();
  const control = confirmation(async () =>
    fs.writeFile(join(f.base, "stat"), statWithoutStartTime("D")),
  );
  expect(
    await dxgAdvisory(request, 512, {
      procRoot: f.root,
      state,
      ...control.options,
    }),
  ).toContain(
    `GPU D-state confirmation identity unavailable pid=123; evidence=${join(f.base, "stat")}`,
  );
  expect(control.sleeps).toEqual(Array.from({ length: 9 }, () => 3000));
});

for (const target of ["task", "leader"] as const)
  test(`task confirmation with an extant ${target} stat missing its identity records advisory evidence`, async () => {
    await using f = await fixture();
    await fs.writeFile(join(f.base, "stat"), stat("Z"));
    const task = await addTask(f, "456");
    let confirmationPath = join(f.base, "stat");
    let confirmationState = "Z";
    let confirmationPid = "123";
    let expected = `GPU task leader confirmation identity unavailable tgid=123 tid=456; evidence=${confirmationPath}`;
    if (target === "task") {
      confirmationPath = task.statPath;
      confirmationState = "D";
      confirmationPid = "456";
      expected = `GPU task confirmation identity unavailable tgid=123 tid=456; evidence=${confirmationPath}`;
    }
    const control = confirmation(async () =>
      fs.writeFile(
        confirmationPath,
        statWithoutStartTime(confirmationState, confirmationPid),
      ),
    );
    expect(
      await dxgAdvisory(request, 512, {
        procRoot: f.root,
        state,
        ...control.options,
      }),
    ).toContain(expected);
    expect(control.sleeps).toEqual(Array.from({ length: 9 }, () => 3000));
  });

for (const target of ["leader", "task", "task leader"] as const)
  test(`post-wchan confirmation recheck with an extant malformed ${target} stat records advisory evidence`, async () => {
    await using f = await fixture();
    let wchanPath = join(f.base, "wchan");
    let malformedPath = join(f.base, "stat");
    let expected = `GPU D-state confirmation identity unavailable pid=123; evidence=${malformedPath}`;
    if (target !== "leader") {
      await fs.writeFile(join(f.base, "stat"), stat("Z"));
      const task = await addTask(f, "456");
      wchanPath = task.wchanPath;
      if (target === "task") {
        malformedPath = task.statPath;
        expected = `GPU task confirmation identity unavailable tgid=123 tid=456; evidence=${malformedPath}`;
      } else
        expected = `GPU task leader confirmation identity unavailable tgid=123 tid=456; evidence=${malformedPath}`;
    }
    const readFile = fs.readFile;
    let wchanReads = 0;
    type ReadPath = Parameters<typeof readFile>[0];
    type ReadOptions = Parameters<typeof readFile>[1];
    type ReadResult = Awaited<ReturnType<typeof readFile>>;
    function readAfterWchan(
      path: ReadPath,
      options?:
        | (Exclude<ReadOptions, string> & { encoding?: null | undefined })
        | null,
    ): Promise<Exclude<ReadResult, string>>;
    function readAfterWchan(
      path: ReadPath,
      options: BufferEncoding | (ReadOptions & { encoding: BufferEncoding }),
    ): Promise<string>;
    function readAfterWchan(
      path: ReadPath,
      options?: ReadOptions,
    ): Promise<ReadResult>;
    async function readAfterWchan(
      path: ReadPath,
      options?: ReadOptions,
    ): Promise<ReadResult> {
      if (path === wchanPath) {
        wchanReads += 1;
        if (wchanReads === 2) await fs.writeFile(malformedPath, "malformed\n");
      }
      return readFile(path, options);
    }
    const read = spyOn(fs, "readFile").mockImplementation(readAfterWchan);
    using _restore = {
      [Symbol.dispose]: () => {
        read.mockRestore();
      },
    };
    const control = confirmation();
    expect(
      await dxgAdvisory(request, 512, {
        procRoot: f.root,
        state,
        ...control.options,
      }),
    ).toContain(expected);
    expect(control.sleeps).toEqual(Array.from({ length: 9 }, () => 3000));
  });

test("no D/dxg candidate is the fast path", async () => {
  await using f = await fixture();
  await fs.writeFile(join(f.base, "stat"), stat("S"));
  const control = confirmation();
  expect(
    await dxgAdvisory(request, 512, {
      procRoot: f.root,
      state,
      ...control.options,
    }),
  ).toBeUndefined();
  expect(control.sleeps).toEqual([]);
});

test("leader and task candidates share nine bounded confirmation intervals", async () => {
  await using f = await fixture();
  const task = await addTask(f, "456");
  const control = confirmation(async () =>
    fs.writeFile(join(f.base, "stat"), stat("S")),
  );
  const refusal = await dxgAdvisory(request, 512, {
    procRoot: f.root,
    state,
    ...control.options,
  });
  expect(refusal).toContain(
    "GPU persistent dxg stall tgid=123 tid=456 leader_state=S task_state=D",
  );
  expect(refusal).toContain(task.wchanPath);
  expect(control.sleeps).toEqual(Array.from({ length: 9 }, () => 3000));
});

for (const transition of ["exit", "wake", "reuse"])
  test(`D-state task ${transition} during wchan read is not stale dxg evidence`, async () => {
    await using f = await fixture();
    await fs.writeFile(join(f.base, "stat"), stat("Z"));
    const task = await addTask(f, "456");
    const readFile = fs.readFile;
    type ReadPath = Parameters<typeof readFile>[0];
    type ReadOptions = Parameters<typeof readFile>[1];
    type ReadResult = Awaited<ReturnType<typeof readFile>>;
    function readDuringTransition(
      path: ReadPath,
      options?:
        | (Exclude<ReadOptions, string> & { encoding?: null | undefined })
        | null,
    ): Promise<Exclude<ReadResult, string>>;
    function readDuringTransition(
      path: ReadPath,
      options: BufferEncoding | (ReadOptions & { encoding: BufferEncoding }),
    ): Promise<string>;
    function readDuringTransition(
      path: ReadPath,
      options?: ReadOptions,
    ): Promise<ReadResult>;
    async function readDuringTransition(
      path: ReadPath,
      options?: ReadOptions,
    ): Promise<ReadResult> {
      if (path === task.wchanPath) {
        if (transition === "exit") await fs.rm(task.base, { recursive: true });
        else
          await fs.writeFile(
            task.statPath,
            stat(transition === "wake" ? "S" : "D", {
              pid: "456",
              startTime: transition === "reuse" ? "201" : "200",
            }),
          );
      }
      return readFile(path, options);
    }
    const read = spyOn(fs, "readFile").mockImplementation(readDuringTransition);
    using _restore = {
      [Symbol.dispose]: () => {
        read.mockRestore();
      },
    };
    expect(
      await dxgAdvisory(request, 512, { procRoot: f.root, state }),
    ).toBeUndefined();
  });

test("live leader with an inaccessible task inventory records advisory evidence", async () => {
  await using f = await fixture();
  await fs.writeFile(join(f.base, "stat"), stat("S"));
  const taskRoot = join(f.base, "task");
  await fs.rm(taskRoot, { recursive: true });
  await fs.writeFile(taskRoot, "not a directory");
  expect(
    await dxgAdvisory(request, 512, { procRoot: f.root, state }),
  ).toContain(
    `GPU task inventory unavailable tgid=123 leader_state=S; evidence=${taskRoot},${join(f.base, "stat")}`,
  );
});

for (const channel of ["", "0", "missing", "unreadable"])
  test(`GPU holder D-state task with ${channel === "" ? "empty" : channel} wchan confirms before advising`, async () => {
    await using f = await fixture();
    await fs.writeFile(join(f.base, "stat"), stat("Z"));
    const task = await addTask(f, "456");
    const path = task.wchanPath;
    await fs.rm(path);
    if (channel === "unreadable") await fs.mkdir(path); // EISDIR even as root.
    else if (channel !== "missing") await fs.writeFile(path, channel);
    const control = confirmation();
    const refusal = await dxgAdvisory(request, 512, {
      procRoot: f.root,
      state: retainedState(),
      ...control.options,
    });
    expect(refusal).toContain(
      `GPU persistent D-state wait channel unavailable tgid=123 tid=456 leader_state=Z task_state=D; observations=10 interval_ms>=3000; evidence=${join(f.base, "stat")},${task.statPath},${path}`,
    );
    expect(control.sleeps).toEqual(Array.from({ length: 9 }, () => 3000));
  });

const unavailableChannelCases = (["leader", "task"] as const).flatMap(
  (target) =>
    (["none", "sampled-holder", "dxg-fd"] as const).flatMap((tie) =>
      ["", "0", "missing", "unreadable"].map((channel) => ({
        target,
        tie,
        channel,
      })),
    ),
);
for (const { target, tie, channel } of unavailableChannelCases)
  test(`${target} with ${channel === "" ? "empty" : channel} wchan and GPU tie=${tie}`, async () => {
    await using f = await fixture();
    // Root ownership is fixture metadata; a directory reliably makes wchan
    // unreadable even when the test runner itself has root privileges.
    await fs.writeFile(join(f.base, "status"), "Uid:\t0\t0\t0\t0\n");
    await fs.writeFile(
      join(f.base, "cmdline"),
      "/usr/lib/systemd/systemd-journald\0",
    );
    let wchanPath = join(f.base, "wchan");
    if (target === "task") {
      await fs.writeFile(join(f.base, "stat"), stat("S"));
      wchanPath = (await addTask(f, "456")).wchanPath;
    }
    await fs.rm(wchanPath);
    if (channel === "unreadable") await fs.mkdir(wchanPath);
    else if (channel !== "missing") await fs.writeFile(wchanPath, channel);
    const fdRoot = join(f.base, "fd");
    await fs.mkdir(fdRoot);
    // An unrelated fd and a non-symlink entry are not ties.
    await fs.symlink("/dev/null", join(fdRoot, "0"));
    await fs.writeFile(join(fdRoot, "1"), "not a symlink");
    if (tie === "dxg-fd") await fs.symlink("/dev/dxg", join(fdRoot, "2"));
    const control = confirmation();
    const refusal = await dxgAdvisory(request, 512, {
      procRoot: f.root,
      state: {
        ...state,
        processes: tie === "sampled-holder" ? [{ pid: 123, usedMiB: 1 }] : [],
        samples: retainedState().samples,
        processIdentity:
          tie === "sampled-holder" ? sampleIdentity() : undefined,
      },
      ...control.options,
    });
    if (tie === "none") {
      expect(refusal).toBeUndefined();
      expect(control.sleeps).toEqual([]);
    } else {
      expect(refusal).toContain("wait channel unavailable");
      expect(refusal).toContain(wchanPath);
      expect(control.sleeps).toEqual(
        target === "task" ? Array.from({ length: 9 }, () => 3000) : [],
      );
    }
  });

for (const target of ["leader", "task"] as const)
  test(`unscoped unsampled ${target} with dxgvmb_send_sync_msg still records advisory evidence`, async () => {
    await using f = await fixture();
    let wchanPath = join(f.base, "wchan");
    if (target === "task") {
      await fs.writeFile(join(f.base, "stat"), stat("Z"));
      wchanPath = (await addTask(f, "456")).wchanPath;
    }
    await fs.writeFile(wchanPath, "dxgvmb_send_sync_msg\n");
    const control = confirmation();
    expect(
      await dxgAdvisory(request, 512, {
        procRoot: f.root,
        state,
        ...control.options,
      }),
    ).toContain("GPU persistent dxg stall");
    expect(control.sleeps).toEqual(Array.from({ length: 9 }, () => 3000));
  });

for (const processState of ["S", "R", "Z", "T", "t", "I", "X", "x"])
  test(`state=${processState} with a leftover dxg channel is not a D-state stall`, async () => {
    await using f = await fixture();
    await fs.writeFile(join(f.base, "stat"), stat(processState));
    expect(
      await dxgAdvisory(request, 512, { procRoot: f.root, state }),
    ).toBeUndefined();
  });

test("known non-dxg D-state does not refuse GPU admission", async () => {
  await using f = await fixture();
  await fs.writeFile(join(f.base, "wchan"), "io_schedule\n");
  expect(
    await dxgAdvisory(request, 512, { procRoot: f.root, state }),
  ).toBeUndefined();
});

test("process already exited after inventory is ignored", async () => {
  await using f = await fixture();
  await fs.rm(join(f.base, "stat"));
  expect(
    await dxgAdvisory(request, 512, { procRoot: f.root, state }),
  ).toBeUndefined();
});

for (const transition of ["exit", "wake"])
  test(`D-state ${transition} during wchan read is rechecked`, async () => {
    await using f = await fixture();
    const readFile = fs.readFile;
    type ReadPath = Parameters<typeof readFile>[0];
    type ReadOptions = Parameters<typeof readFile>[1];
    type ReadResult = Awaited<ReturnType<typeof readFile>>;
    // Preserve readFile's encoding/return correlation for every overload.
    function readDuringTransition(
      path: ReadPath,
      options?:
        | (Exclude<ReadOptions, string> & { encoding?: null | undefined })
        | null,
    ): Promise<Exclude<ReadResult, string>>;
    function readDuringTransition(
      path: ReadPath,
      options: BufferEncoding | (ReadOptions & { encoding: BufferEncoding }),
    ): Promise<string>;
    function readDuringTransition(
      path: ReadPath,
      options?: ReadOptions,
    ): Promise<ReadResult>;
    async function readDuringTransition(
      path: ReadPath,
      options?: ReadOptions,
    ): Promise<ReadResult> {
      if (path === join(f.base, "wchan")) {
        if (transition === "exit") await fs.rm(f.base, { recursive: true });
        else await fs.writeFile(join(f.base, "stat"), stat("S"));
      }
      return readFile(path, options);
    }
    const read = spyOn(fs, "readFile").mockImplementation(readDuringTransition);
    using _restore = {
      [Symbol.dispose]: () => {
        read.mockRestore();
      },
    };
    expect(
      await dxgAdvisory(request, 512, { procRoot: f.root, state }),
    ).toBeUndefined();
  });

test("live inspection preserves reservation deduplication and VRAM accounting", async () => {
  await using f = await fixture("agent-resource-existing.scope");
  await fs.writeFile(join(f.base, "stat"), stat("S"));
  const large = { gpu_id: 0, vram_peak_bytes: 300 * 1024 ** 2 };
  expect(
    await gpuAdmissionRefusal(large, 512, { procRoot: f.root, state }),
  ).toContain("admitted=268435456");
  expect(
    await gpuAdmissionRefusal(large, 512, {
      procRoot: f.root,
      state,
      currentReservationId: "existing",
    }),
  ).toBeUndefined();
});

test("admission inspection never spawns GPU tools or workload processes", async () => {
  await using f = await fixture();
  const control = confirmation();
  const spawn = spyOn(Bun, "spawn");
  using _restore = {
    [Symbol.dispose]: () => {
      spawn.mockRestore();
    },
  };
  expect(
    await dxgAdvisory(request, 512, {
      procRoot: f.root,
      state,
      ...control.options,
    }),
  ).toContain("GPU persistent dxg stall");
  expect(control.sleeps).toEqual(Array.from({ length: 9 }, () => 3000));
  await fs.writeFile(join(f.base, "stat"), stat("S"));
  expect(
    await dxgAdvisory(request, 512, { procRoot: f.root, state }),
  ).toBeUndefined();
  expect(spawn).not.toHaveBeenCalled();
});

test("unreadable process inventory or stat records advisory evidence", async () => {
  await using f = await fixture();
  expect(
    await gpuAdmissionRefusal(request, 512, {
      procRoot: join(f.root, "absent"),
      state,
    }),
  ).toContain("GPU reservation capacity unavailable");
  await fs.rm(join(f.base, "stat"));
  await fs.mkdir(join(f.base, "stat"));
  expect(
    await dxgAdvisory(request, 512, { procRoot: f.root, state }),
  ).toContain("GPU process state unreadable pid=123");
});

for (const scenario of [
  "absent",
  "gone",
  "reuse",
  "stat-unreadable",
  "cgroup-missing",
  "cgroup-unreadable",
  "namespace",
  "tgid",
  "status-unreadable",
  "esrch",
  "malformed",
  "live-unadmitted",
  "live-outside",
  "live-admitted",
] as const)
  test(`sampled holder ${scenario} warns without refusing or claiming proven ownership`, async () => {
    await using f = await fixture(
      !["absent", "gone", "live-outside"].includes(scenario)
        ? "agent-resource-existing.scope"
        : "unmanaged.scope",
    );
    await fs.writeFile(join(f.base, "stat"), stat("S"));
    await fs.writeFile(
      join(f.base, "status"),
      `State:\tS (sleeping)\nPid:\t123\nTgid:\t${scenario === "tgid" ? "99" : "123"}\nNSpid:\t${scenario === "namespace" ? "900 123" : "123"}\n`,
    );
    if (scenario === "absent") await fs.rm(f.base, { recursive: true });
    if (scenario === "live-unadmitted")
      await fs.writeFile(join(f.base, "environ"), "");
    const readFile = fs.readFile;
    let holderCheck = false;
    let holderStatReads = 0;
    const denied = mock<() => Promise<never>>().mockRejectedValue(
      Object.assign(new Error("permission denied"), { code: "EACCES" }),
    );
    const gone = mock<() => Promise<never>>().mockRejectedValue(
      Object.assign(new Error("gone"), { code: "ENOENT" }),
    );
    const noProcess = mock<() => Promise<never>>().mockRejectedValue(
      Object.assign(new Error("no process"), { code: "ESRCH" }),
    );
    type ReadPath = Parameters<typeof readFile>[0];
    type ReadOptions = Parameters<typeof readFile>[1];
    type ReadResult = Awaited<ReturnType<typeof readFile>>;
    function readHolder(
      path: ReadPath,
      options?:
        | (Exclude<ReadOptions, string> & { encoding?: null | undefined })
        | null,
    ): Promise<Exclude<ReadResult, string>>;
    function readHolder(
      path: ReadPath,
      options: BufferEncoding | (ReadOptions & { encoding: BufferEncoding }),
    ): Promise<string>;
    function readHolder(
      path: ReadPath,
      options?: ReadOptions,
    ): Promise<ReadResult>;
    // Bound the injected race to the sampled-holder pass, after live inventory.
    async function readHolder(
      path: ReadPath,
      options?: ReadOptions,
    ): Promise<ReadResult> {
      if (path === join(f.base, "status")) {
        holderCheck = true;
        if (scenario === "status-unreadable") return denied();
      }
      if (path === join(f.base, "stat") && holderCheck) {
        holderStatReads += 1;
        if (scenario === "gone") await fs.rm(f.base, { recursive: true });
        if (scenario === "reuse")
          await fs.writeFile(path, stat("S", { startTime: "101" }));
        if (scenario === "malformed") await fs.writeFile(path, "malformed\n");
        if (scenario === "stat-unreadable") return denied();
        if (scenario === "esrch") return noProcess();
      }
      if (path === join(f.base, "cgroup")) {
        // First cgroup read is reservation discovery; second is holder inspection.
        cgroupReads += 1;
        if (cgroupReads === 2 && scenario === "cgroup-missing") return gone();
        if (cgroupReads === 2 && scenario === "cgroup-unreadable")
          return denied();
      }
      return readFile(path, options);
    }
    const read = spyOn(fs, "readFile").mockImplementation(readHolder);
    let cgroupReads = 0;
    using _restore = {
      [Symbol.dispose]: () => {
        read.mockRestore();
      },
    };
    const warning = await advisoryAdmission(request, 512, {
      procRoot: f.root,
      state: { ...state, processes: [{ pid: 123, usedMiB: 1 }] },
    });
    if (scenario === "live-admitted") expect(warning).toBe("");
    else if (scenario === "live-unadmitted")
      expect(warning).toContain("GPU holder admission receipt unavailable");
    else {
      const reasons = {
        absent: "reason=absent-or-pid-namespace-mismatch",
        gone: "reason=gone-during-check",
        reuse: "reason=pid-reused-during-check",
        "stat-unreadable": "reason=stat-unreadable",
        "cgroup-missing": "reason=cgroup-unreadable-or-gone",
        "cgroup-unreadable": "reason=cgroup-unreadable-or-gone",
        namespace: "reason=pid-namespace-or-tgid-mismatch",
        tgid: "reason=pid-namespace-or-tgid-mismatch",
        "status-unreadable": "reason=status-unreadable-or-gone",
        esrch: "reason=stat-unreadable",
        malformed: "reason=stat-identity-invalid",
        "live-outside": "local_scope=outside-admitted-GPU-scope",
      };
      expect(warning).toContain(reasons[scenario]);
      expect(warning).not.toContain("GPU holder outside admitted GPU scope");
      expect(warning).toContain("unverified");
      expect(warning).toContain("sampled_namespace=unknown");
      expect(warning).toContain(join(f.base, "stat"));
    }
    if (scenario !== "absent") expect(holderStatReads).toBe(1);
  });

test("ordinary sampler publication correlates an unresolved holder without driver binding or extra queries", async () => {
  await using f = await fixture();
  await fs.writeFile(join(f.base, "stat"), stat("S"));
  const at = 1_000_000;
  const calls = join(f.root, "calls");
  const statePath = join(f.root, "state.json");
  const slotDirectory = join(f.root, "slots");
  await fs.mkdir(slotDirectory);
  const xml = `<nvidia_smi_log><gpu id="fake-device"><minor_number>0</minor_number>
<fb_memory_usage><total>3072 MiB</total><used>1 MiB</used></fb_memory_usage>
<utilization><gpu_util>0 %</gpu_util></utilization>
<processes><process_info><pid>123</pid><used_memory>1 MiB</used_memory></process_info>
<process_info><pid>456</pid><used_memory>0 MiB</used_memory></process_info></processes>
</gpu></nvidia_smi_log>`;
  await fs.writeFile(
    join(f.root, "nvidia-smi"),
    `#!${process.execPath}\nimport { appendFile } from "node:fs/promises";
await appendFile(${JSON.stringify(calls)}, JSON.stringify(process.argv.slice(2)) + "\\n");
process.stdout.write(${JSON.stringify(xml)});\n`,
    { mode: 0o755 },
  );
  const identityIo = {
    read: (path: string) => {
      if (path === join(f.root, "sys/kernel/random/boot_id"))
        return Promise.resolve("PRIVATE fictional boot");
      let pid = process.pid;
      if (path.includes("/123/")) pid = 123;
      else if (path.includes("/456/")) pid = 456;
      return Promise.resolve(
        path.endsWith("/stat")
          ? stat("S", { pid: String(pid), startTime: "700" }).replace(
              "worker",
              "PRIVATE",
            )
          : `Pid:\t${pid}\nTgid:\t${pid}\nNSpid:\t${pid}\t7\nName:\tPRIVATE\n`,
      );
    },
    readlink: () => Promise.resolve("pid:[987654]"),
  };
  const spawn = spyOn(Bun, "spawn");
  using _restore = {
    [Symbol.dispose]: () => {
      spawn.mockRestore();
    },
  };
  expect(
    await runGpuSampler({
      statePath,
      path: f.root,
      fallbacks: [],
      procRoot: f.root,
      slotDirectory,
      identityIo,
      now: () => at,
      timeoutMs: 5000,
    }),
  ).toBe("sampled");
  const loaded = await readGpuState(statePath);
  expect(loaded?.sampledAt).toBe(at);
  expect(loaded?.samples.map((sample) => sample.ts)).toEqual([at]);
  expect(loaded?.processes).toEqual([
    { pid: 123, usedMiB: 1 },
    { pid: 456, usedMiB: 0 },
  ]);
  expect(loaded?.processIdentity).toMatchObject({
    sampleAt: at,
    driverBinding: "unknown",
    omittedProcesses: 0,
    processes: [
      {
        rawDriverPid: 123,
        status: "read",
        local: { pid: 123, tgid: 123, nspid: [123, 7], starttime: "700" },
      },
      { rawDriverPid: 456, status: "read" },
    ],
  });
  // Only private fixture state changes: a retained driver holder has no local PID.
  await fs.rm(f.base, { recursive: true });
  const warnings = (
    await advisoryAdmission(request, 512, {
      procRoot: f.root,
      state: loaded,
    })
  ).split("\n");
  expect(warnings).toHaveLength(2);
  const warning = warnings[0];
  for (const text of [
    "unverified pid=123",
    `sampled_at=${at} identity_sample_at=${at}`,
    "driver_binding=unknown",
    "sampler_identity=sample-correlated",
    "local_observation=read",
    "local_nspid=123,7",
  ])
    expect(warning).toContain(text);
  for (const text of ["PRIVATE", "987654", "456"])
    expect(warning).not.toContain(text);
  expect(warnings[1]).toContain("unverified pid=456");
  expect(warnings[1]).toContain(
    "local_pid=456 local_tgid=456 local_nspid=456,7",
  );
  for (const text of ["PRIVATE", "987654", "local_pid=123", "local_nspid=123"])
    expect(warnings[1]).not.toContain(text);
  expect(await fs.readFile(calls, "utf8")).toBe('["-q","-x"]\n');
  expect(spawn).toHaveBeenCalledTimes(1);
});

for (const status of [
  "read",
  "missing-before",
  "missing-after",
  "reuse",
  "permission",
  "error",
  "limit",
  "unsupported",
] as const)
  test(`retained sampler ${status} provenance diagnoses absent holder without refusing or granting driver binding`, async () => {
    await using f = await fixture();
    await fs.rm(f.base, { recursive: true });
    const cached = retainedState();
    const identity = sampleIdentity();
    identity.processes[0]!.status = status;
    identity.processes.push({ ...identity.processes[0]!, rawDriverPid: 456 });
    cached.processIdentity = identity;
    const path = join(f.root, "gpu-owner.json");
    await fs.writeFile(path, JSON.stringify(cached));
    // Exercise the production state reader, including its schema boundary.
    const loaded = await readGpuState(path);
    expect(loaded).toBeDefined();
    const spawn = spyOn(Bun, "spawn");
    using _restore = {
      [Symbol.dispose]: () => {
        spawn.mockRestore();
      },
    };
    const warning = await advisoryAdmission(request, 512, {
      procRoot: f.root,
      state: loaded,
    });
    for (const text of [
      "unverified pid=123",
      "sampled_at=1 identity_sample_at=1",
      "driver_binding=unknown",
      "sampler_identity=sample-correlated",
      `local_observation=${status}`,
      "sampler_collector_pid=999",
      "capture_ms=2..4",
      "row_capture_ms=2..3",
    ])
      expect(warning).toContain(text);
    expect(warning).not.toContain("PRIVATE");
    expect(warning).not.toContain("456");
    expect(spawn).not.toHaveBeenCalled();
  });

for (const scenario of [
  "legacy",
  "old-sample",
  "no-retained-sample",
  "wrong-pid",
  "omitted",
  "duplicate",
  "invalid-window",
] as const)
  test(`sampler ${scenario} warns without refusing or supplying unrelated provenance`, async () => {
    await using f = await fixture();
    await fs.rm(f.base, { recursive: true });
    const cached = retainedState();
    const identity = sampleIdentity();
    if (scenario === "old-sample") identity.sampleAt = 0;
    if (scenario === "wrong-pid") identity.processes[0]!.rawDriverPid = 456;
    if (scenario === "omitted") {
      identity.processes = [];
      identity.omittedProcesses = 1;
    }
    if (scenario === "duplicate")
      identity.processes.push(identity.processes[0]!);
    if (scenario === "invalid-window")
      identity.processes[0]!.captureFinishedAt = 1;
    cached.processIdentity = scenario === "legacy" ? undefined : identity;
    if (scenario === "no-retained-sample") cached.samples = [];
    const warning = await advisoryAdmission(request, 512, {
      procRoot: f.root,
      state: cached,
    });
    expect(warning).toContain("unverified pid=123");
    expect(warning).not.toContain("local_observation=");
    const reasons = {
      legacy: "legacy-missing",
      "old-sample": "sample-mismatch",
      "no-retained-sample": "sample-not-retained",
      "wrong-pid": "row-unavailable",
      omitted: "row-unavailable omitted_processes=1",
      duplicate: "row-unavailable",
      "invalid-window": "invalid-capture-window",
    };
    expect(warning).toContain(`sampler_identity=${reasons[scenario]}`);
  });

for (const scenario of ["outside", "admitted", "nested", "empty"] as const)
  test(`sampler local match admits ${scenario} and preserves advisory provenance`, async () => {
    await using f = await fixture(
      scenario === "admitted"
        ? "agent-resource-existing.scope"
        : "unmanaged.scope",
    );
    await fs.writeFile(join(f.base, "stat"), stat("S"));
    await fs.writeFile(
      join(f.base, "status"),
      `State:\tS\nPid:\t123\nTgid:\t123\nNSpid:\t${scenario === "nested" ? "900 123" : "123"}\n`,
    );
    const cached = retainedState();
    if (scenario === "nested")
      cached.processIdentity!.processes[0]!.local!.nspid = [900, 123];
    if (scenario === "empty") cached.processes = [];
    const warning = await advisoryAdmission(request, 512, {
      procRoot: f.root,
      state: cached,
    });
    if (scenario === "admitted" || scenario === "empty")
      expect(warning).toBe("");
    else {
      expect(warning).toContain("unverified");
      expect(warning).toContain("driver_binding=unknown");
      expect(warning).toContain("sampler_identity=sample-correlated");
      if (scenario === "nested")
        expect(warning).toContain("local_nspid=900,123");
    }
  });

test("malformed metadata is rejected by the production reader and never grants admission", async () => {
  await using f = await fixture();
  await fs.rm(f.base, { recursive: true });
  const cached = retainedState();
  const path = join(f.root, "gpu-owner.json");
  for (const driverBinding of ["verified", null, 1]) {
    await fs.writeFile(
      path,
      JSON.stringify({
        ...cached,
        processIdentity: { ...sampleIdentity(), driverBinding },
      }),
    );
    expect(await readGpuState(path)).toBeUndefined();
  }
});

// Return the diagnostic only after proving the production gate admitted it.
async function dxgAdvisory(...args: Parameters<typeof gpuAdmissionRefusal>) {
  const record = new DecisionRecord();
  const warning = spyOn(console, "error").mockImplementation(() => {});
  using _restore = {
    [Symbol.dispose]: () => {
      warning.mockRestore();
    },
  };
  const refusal = await withDecision(record, () =>
    gpuAdmissionRefusal(...args),
  );
  expect(refusal).toBeUndefined();
  expect(record.outcome).toBe("admit");
  const lines = warning.mock.calls
    .map(([line]) => String(line))
    .filter((line) => line.startsWith("WARN dxg-suspected:"));
  let observation: string | undefined;
  if (record.reason_code !== "dxg-suspected") expect(lines).toHaveLength(0);
  else {
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(record.branch);
    observation = record.branch;
  }
  return observation;
}

for (const incident of ["set", "cleared", "unchanged"] as const)
  test(`owner latch ${incident} is read after all confirmation intervals`, async () => {
    await using f = await fixture();
    const control = confirmation();
    let reads = 0;
    const initial = {
      ...state,
      ...(incident === "cleared" ? { unresponsiveSince: 1 } : {}),
    };
    const fresh = {
      ...state,
      ...(incident === "set" ? { unresponsiveSince: 2 } : {}),
    };
    const record = new DecisionRecord();
    const refusal = await withDecision(record, () =>
      gpuAdmissionRefusal(request, 512, {
        procRoot: f.root,
        ...control.options,
        readState: () => {
          reads++;
          if (reads === 1) {
            expect(control.sleeps).toHaveLength(0);
            return Promise.resolve(initial);
          }
          expect(control.sleeps).toHaveLength(9);
          return Promise.resolve(fresh);
        },
      }),
    );
    expect(reads).toBe(2);
    if (incident === "set")
      expect(refusal).toContain("GPU stall recorded since 2");
    else expect(refusal).toBeUndefined();
    expect(
      record.observations.some((row) => row.branch === "gpu-sampler-decision"),
    ).toBe(true);
  });

for (const target of ["leader", "task"] as const)
  for (const identity of ["pid-only", "reused", "matched", "fd"] as const)
    test(`${target} GPU tie ${identity} requires live identity`, async () => {
      await using f = await fixture();
      let wchanPath = join(f.base, "wchan");
      if (target === "task") {
        await fs.writeFile(join(f.base, "stat"), stat("S"));
        wchanPath = (await addTask(f, "456")).wchanPath;
      }
      await fs.writeFile(wchanPath, "0");
      const cached = retainedState();
      if (identity === "pid-only") cached.processIdentity = undefined;
      if (identity === "reused")
        cached.processIdentity!.processes[0]!.local!.starttime = "99";
      if (identity === "fd") {
        cached.processIdentity = undefined;
        await fs.mkdir(join(f.base, "fd"));
        await fs.symlink("/dev/dxg", join(f.base, "fd", "1"));
      }
      const control = confirmation();
      const observation = await dxgAdvisory(request, 512, {
        procRoot: f.root,
        state: cached,
        ...control.options,
      });
      if (identity === "pid-only" || identity === "reused") {
        expect(observation).toBeUndefined();
        expect(control.sleeps).toHaveLength(0);
      } else expect(observation).toContain("wait channel unavailable");
    });

test("persistent dxg advisory never overrides the declared VRAM capacity refusal", async () => {
  await using f = await fixture();
  const control = confirmation();
  const refusal = await gpuAdmissionRefusal(
    { gpu_id: 0, vram_peak_bytes: 8192 * 1024 ** 2 },
    512,
    { procRoot: f.root, state, ...control.options },
  );
  expect(control.sleeps).toHaveLength(9);
  expect(refusal).toContain("GPU VRAM budget exceeded");
});
