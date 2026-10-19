import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkGpuSampler } from "../src/gpu-sampler.ts";
import { ownerState } from "./gpu-owner-fixture.ts";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "gpu-sampler-check-"));
  dirs.push(dir);
  const procRoot = join(dir, "proc");
  await mkdir(procRoot);
  const statePath = join(dir, "gpu-owner.json");
  const at = Temporal.Now.instant().epochMilliseconds;
  await Bun.write(statePath, `${JSON.stringify(ownerState(at))}\n`);
  return { dir, procRoot, statePath, at };
}

async function procTask(
  procRoot: string,
  pid: number,
  state: string,
  wchan = "0",
) {
  const path = join(procRoot, String(pid));
  await mkdir(path);
  await writeFile(
    join(path, "stat"),
    `${pid} (fixture process) ${state} 1 0 0\n`,
  );
  await writeFile(join(path, "wchan"), `${wchan}\n`);
}

function expectFailuresToContain(failures: string[], fragments: string[]) {
  for (const fragment of fragments)
    expect(failures.some((failure) => failure.includes(fragment))).toBe(true);
}

test("passes when the proc inventory is clear and the latest GPU probe succeeded", async () => {
  const f = await fixture();
  expect(await checkGpuSampler(f)).toEqual({ ok: true, failures: [] });
});

test("reports dxg D-state, GPU-holding zombie, failed probe, and unresponsive state", async () => {
  const f = await fixture();
  await procTask(f.procRoot, 42, "Z");
  await procTask(f.procRoot, 99, "D", "dxgvmb_send_sync_msg");
  await Bun.write(
    f.statePath,
    `${JSON.stringify({
      ...ownerState(f.at - 10),
      attemptAt: f.at,
      unresponsiveSince: f.at - 5,
    })}\n`,
  );

  const result = await checkGpuSampler(f);
  expect(result.ok).toBe(false);
  expectFailuresToContain(result.failures, [
    "D-state process(es) in dxg: 99",
    "GPU-holding zombie process(es): 42",
    "last GPU probe did not succeed",
    "unresponsiveSince is set",
  ]);
});

test("fails closed when state or process inventory cannot be verified", async () => {
  const f = await fixture();
  await rm(f.statePath);
  const result = await checkGpuSampler({
    ...f,
    procRoot: join(f.dir, "missing-proc"),
  });
  expect(result.ok).toBe(false);
  expectFailuresToContain(result.failures, [
    "process inventory incomplete",
    "GPU sampler state unavailable or invalid",
    "cannot verify GPU-holding zombies",
    "last GPU probe did not succeed",
    "cannot verify unresponsiveSince",
  ]);
});

test("fails closed for a D-state task whose wait channel cannot be identified", async () => {
  const f = await fixture();
  await procTask(f.procRoot, 100, "D", "0");
  const result = await checkGpuSampler(f);
  expect(result.ok).toBe(false);
  expectFailuresToContain(result.failures, [
    "cannot identify wait channel for D-state process 100",
  ]);
});
