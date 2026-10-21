import { expect, spyOn, test } from "bun:test";
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
const stat = (value: string) => `123 (worker ) with spaces) ${value} 1 2 3\n`;

async function fixture(scope = "unmanaged.scope") {
  const root = await fs.mkdtemp(join(tmpdir(), "arr-dxg-admission-"));
  const base = join(root, "123");
  await fs.mkdir(base);
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

for (const scope of ["unmanaged.scope", "agent-resource-existing.scope"])
  test(`paused stale cache cannot mask a live dxg D-state in ${scope}`, async () => {
    await using f = await fixture(scope);
    const refusal = await gpuAdmissionRefusal(request, 512, {
      procRoot: f.root,
      state,
      currentReservationId: "existing",
    });
    expect(refusal).toContain("GPU live dxg stall pid=123 state=D");
    expect(refusal).toContain("dxgk_wait_for_completion");
    expect(refusal).toContain(join(f.base, "stat"));
    expect(refusal).toContain(join(f.base, "wchan"));
  });

for (const channel of ["", "0", "missing", "unreadable"])
  test(`D-state with ${channel === "" ? "empty" : channel} wchan fails closed`, async () => {
    await using f = await fixture();
    const path = join(f.base, "wchan");
    await fs.rm(path);
    if (channel === "unreadable") await fs.mkdir(path); // EISDIR even as root.
    else if (channel !== "missing") await fs.writeFile(path, channel);
    expect(
      await gpuAdmissionRefusal(request, 512, { procRoot: f.root, state }),
    ).toContain(
      `GPU D-state wait channel unavailable pid=123; evidence=${path}`,
    );
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
  const spawn = spyOn(Bun, "spawn");
  using _restore = {
    [Symbol.dispose]: () => {
      spawn.mockRestore();
    },
  };
  expect(
    await gpuAdmissionRefusal(request, 512, { procRoot: f.root, state }),
  ).toContain("GPU live dxg stall");
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
