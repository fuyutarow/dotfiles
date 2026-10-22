import { expect, mock, spyOn, test } from "bun:test";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gpuAdmissionRefusal } from "../src/agent-resource-run.ts";

const request = { gpu_id: 0, vram_peak_bytes: 128 * 1024 ** 2 };
// Intentionally stale, paused, and missing both holders and unresponsiveSince.
const state = {
  schema: 1 as const,
  attemptAt: 1,
  sampledAt: 1,
  paused: true as const,
  devices: [{ id: 0, totalMiB: 1024, usedMiB: 0, utilPct: 0 }],
  processes: [],
  samples: [],
};
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

for (const scope of ["unmanaged.scope", "agent-resource-existing.scope"])
  test(`paused stale cache cannot mask a live dxg D-state in ${scope}`, async () => {
    await using f = await fixture(scope);
    const control = confirmation();
    const refusal = await gpuAdmissionRefusal(request, 512, {
      procRoot: f.root,
      state,
      currentReservationId: "existing",
      ...control.options,
    });
    expect(refusal).toContain("GPU persistent dxg stall pid=123 state=D");
    expect(refusal).toContain("observations=2 interval_ms>=3000");
    expect(control.sleeps).toEqual([3000]);
    expect(refusal).toContain("dxgk_wait_for_completion");
    expect(refusal).toContain(join(f.base, "stat"));
    expect(refusal).toContain(join(f.base, "wchan"));
  });

test("Z leader with a distinct live dxg D-state task refuses with task evidence", async () => {
  await using f = await fixture();
  await fs.writeFile(join(f.base, "stat"), stat("Z"));
  const task = await addTask(f, "456");
  const control = confirmation();
  const refusal = await gpuAdmissionRefusal(request, 512, {
    procRoot: f.root,
    state,
    ...control.options,
  });
  expect(refusal).toContain(
    "GPU persistent dxg stall tgid=123 tid=456 leader_state=Z task_state=D",
  );
  expect(control.sleeps).toEqual([3000]);
  for (const path of [join(f.base, "stat"), task.statPath, task.wchanPath])
    expect(refusal).toContain(path);
});

test("Z leader without a distinct D-state task does not refuse", async () => {
  await using f = await fixture();
  await fs.writeFile(join(f.base, "stat"), stat("Z"));
  expect(
    await gpuAdmissionRefusal(request, 512, { procRoot: f.root, state }),
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
      await gpuAdmissionRefusal(request, 512, {
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
      await gpuAdmissionRefusal(request, 512, {
        procRoot: f.root,
        state,
        ...control.options,
      }),
    ).toBeUndefined();
    expect(control.sleeps).toEqual([3000]);
  });

test("confirmation evidence becoming inaccessible fails closed", async () => {
  await using f = await fixture();
  const wchanPath = join(f.base, "wchan");
  const control = confirmation(async () => fs.rm(wchanPath));
  expect(
    await gpuAdmissionRefusal(request, 512, {
      procRoot: f.root,
      state,
      ...control.options,
    }),
  ).toContain(
    `GPU D-state wait channel unavailable pid=123; evidence=${wchanPath}`,
  );
  expect(control.sleeps).toEqual([3000]);
});

test("leader confirmation with an extant stat missing its identity fails closed", async () => {
  await using f = await fixture();
  const control = confirmation(async () =>
    fs.writeFile(join(f.base, "stat"), statWithoutStartTime("D")),
  );
  expect(
    await gpuAdmissionRefusal(request, 512, {
      procRoot: f.root,
      state,
      ...control.options,
    }),
  ).toContain(
    `GPU D-state confirmation identity unavailable pid=123; evidence=${join(f.base, "stat")}`,
  );
  expect(control.sleeps).toEqual([3000]);
});

for (const target of ["task", "leader"] as const)
  test(`task confirmation with an extant ${target} stat missing its identity fails closed`, async () => {
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
      await gpuAdmissionRefusal(request, 512, {
        procRoot: f.root,
        state,
        ...control.options,
      }),
    ).toContain(expected);
    expect(control.sleeps).toEqual([3000]);
  });

for (const target of ["leader", "task", "task leader"] as const)
  test(`post-wchan confirmation recheck with an extant malformed ${target} stat fails closed`, async () => {
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
      await gpuAdmissionRefusal(request, 512, {
        procRoot: f.root,
        state,
        ...control.options,
      }),
    ).toContain(expected);
    expect(control.sleeps).toEqual([3000]);
  });

test("no D/dxg candidate is the fast path", async () => {
  await using f = await fixture();
  await fs.writeFile(join(f.base, "stat"), stat("S"));
  const control = confirmation();
  expect(
    await gpuAdmissionRefusal(request, 512, {
      procRoot: f.root,
      state,
      ...control.options,
    }),
  ).toBeUndefined();
  expect(control.sleeps).toEqual([]);
});

test("leader and task candidates share one bounded confirmation interval", async () => {
  await using f = await fixture();
  const task = await addTask(f, "456");
  const control = confirmation(async () =>
    fs.writeFile(join(f.base, "stat"), stat("S")),
  );
  const refusal = await gpuAdmissionRefusal(request, 512, {
    procRoot: f.root,
    state,
    ...control.options,
  });
  expect(refusal).toContain(
    "GPU persistent dxg stall tgid=123 tid=456 leader_state=S task_state=D",
  );
  expect(refusal).toContain(task.wchanPath);
  expect(control.sleeps).toEqual([3000]);
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
      await gpuAdmissionRefusal(request, 512, { procRoot: f.root, state }),
    ).toBeUndefined();
  });

test("live leader with an inaccessible task inventory fails closed", async () => {
  await using f = await fixture();
  await fs.writeFile(join(f.base, "stat"), stat("S"));
  const taskRoot = join(f.base, "task");
  await fs.rm(taskRoot, { recursive: true });
  await fs.writeFile(taskRoot, "not a directory");
  expect(
    await gpuAdmissionRefusal(request, 512, { procRoot: f.root, state }),
  ).toContain(
    `GPU task inventory unavailable tgid=123 leader_state=S; evidence=${taskRoot},${join(f.base, "stat")}`,
  );
});

for (const channel of ["", "0", "missing", "unreadable"])
  test(`D-state task with ${channel === "" ? "empty" : channel} wchan confirms before refusing`, async () => {
    await using f = await fixture();
    await fs.writeFile(join(f.base, "stat"), stat("Z"));
    const task = await addTask(f, "456");
    const path = task.wchanPath;
    await fs.rm(path);
    if (channel === "unreadable") await fs.mkdir(path); // EISDIR even as root.
    else if (channel !== "missing") await fs.writeFile(path, channel);
    const control = confirmation();
    const refusal = await gpuAdmissionRefusal(request, 512, {
      procRoot: f.root,
      state,
      ...control.options,
    });
    expect(refusal).toContain(
      `GPU persistent D-state wait channel unavailable tgid=123 tid=456 leader_state=Z task_state=D; observations=2 interval_ms>=3000; evidence=${join(f.base, "stat")},${task.statPath},${path}`,
    );
    expect(control.sleeps).toEqual([3000]);
  });

for (const processState of ["S", "R", "Z", "T", "t", "I", "X", "x"])
  test(`state=${processState} with a leftover dxg channel is not a D-state stall`, async () => {
    await using f = await fixture();
    await fs.writeFile(join(f.base, "stat"), stat(processState));
    expect(
      await gpuAdmissionRefusal(request, 512, { procRoot: f.root, state }),
    ).toBeUndefined();
  });

test("known non-dxg D-state does not refuse GPU admission", async () => {
  await using f = await fixture();
  await fs.writeFile(join(f.base, "wchan"), "io_schedule\n");
  expect(
    await gpuAdmissionRefusal(request, 512, { procRoot: f.root, state }),
  ).toBeUndefined();
});

test("process already exited after inventory is ignored", async () => {
  await using f = await fixture();
  await fs.rm(join(f.base, "stat"));
  expect(
    await gpuAdmissionRefusal(request, 512, { procRoot: f.root, state }),
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
      await gpuAdmissionRefusal(request, 512, { procRoot: f.root, state }),
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
    await gpuAdmissionRefusal(request, 512, {
      procRoot: f.root,
      state,
      ...control.options,
    }),
  ).toContain("GPU persistent dxg stall");
  expect(control.sleeps).toEqual([3000]);
  await fs.writeFile(join(f.base, "stat"), stat("S"));
  expect(
    await gpuAdmissionRefusal(request, 512, { procRoot: f.root, state }),
  ).toBeUndefined();
  expect(spawn).not.toHaveBeenCalled();
});

test("unreadable process inventory or stat fails closed", async () => {
  await using f = await fixture();
  expect(
    await gpuAdmissionRefusal(request, 512, {
      procRoot: join(f.root, "absent"),
      state,
    }),
  ).toContain("GPU process inventory unavailable");
  await fs.rm(join(f.base, "stat"));
  await fs.mkdir(join(f.base, "stat"));
  expect(
    await gpuAdmissionRefusal(request, 512, { procRoot: f.root, state }),
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
  test(`sampled holder ${scenario} never becomes false proven ownership or unsafe admission`, async () => {
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
    const refusal = await gpuAdmissionRefusal(request, 512, {
      procRoot: f.root,
      state: { ...state, processes: [{ pid: 123, usedMiB: 1 }] },
    });
    if (scenario === "live-admitted") expect(refusal).toBeUndefined();
    else if (scenario === "live-unadmitted")
      expect(refusal).toContain("GPU holder admission receipt unavailable");
    else {
      expect(refusal).toBeDefined();
      expect(refusal).not.toContain("GPU holder outside admitted GPU scope");
      expect(refusal).toContain("unverified");
      expect(refusal).toContain("sampled_namespace=unknown");
      expect(refusal).toContain(join(f.base, "stat"));
    }
    if (scenario !== "absent") expect(holderStatReads).toBe(1);
  });
