import { afterEach, expect, test, spyOn } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile, utimes } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ok } from "neverthrow";
import { readCoreRuns } from "../src/core-runs.ts";
import { render } from "../src/format.ts";
import { readHostLoadAsync } from "../src/host-load.ts";
import { sysRow } from "../src/host-display.ts";
import { fleetLine } from "../src/fleet-line.ts";

const roots: string[] = [];
const oldXdg = process.env.XDG_STATE_HOME;
const oldProc = process.env.STATUSLINE_PROC_ROOT;
afterEach(async () => {
  if (oldXdg === undefined) delete process.env.XDG_STATE_HOME;
  else process.env.XDG_STATE_HOME = oldXdg;
  if (oldProc === undefined) delete process.env.STATUSLINE_PROC_ROOT;
  else process.env.STATUSLINE_PROC_ROOT = oldProc;
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "statusline-step4-"));
  roots.push(root);
  return root;
}
const at = () => Temporal.Now.instant().epochMilliseconds;
const worker = {
  id: "running",
  ticket: "working",
  state: "running",
  row: "terra-high",
  dispatcher_session: "here",
  phase: "working",
};
const started = (id: string, session = "here") => ({
  kind: "started",
  id,
  dispatcher_session: session,
  workspace: `/ws/${id}`,
});
const ended = (id: string) => ({ kind: "ended", id });
async function seed(root: string, records: unknown[] = []) {
  await writeFile(
    join(root, "records.jsonl"),
    records.map((row) => JSON.stringify(row)).join("\n") + "\n",
  );
  await writeFile(
    join(root, "current-runs.json"),
    JSON.stringify({
      output: JSON.stringify({
        runs: [worker],
        summary: {
          running: 1,
          unattributed: 0,
          sessions: { here: { here: 1, other: 0 } },
          noSession: { here: 0, other: 1 },
        },
      }),
      capturedAt: at(),
      exit: 0,
    }),
  );
}
function output(scan: Awaited<ReturnType<typeof readCoreRuns>>) {
  return Bun.stripANSI(
    render({
      cwd: "/fixture",
      sid: "here",
      model: "fixture",
      wfOn: false,
      rc: "off",
      rlModel: [],
      jobs: [],
      orphans: 0,
      routes: ok(scan),
      vram: undefined,
      disks: ok([]),
      cpuPct: ok(0),
      ram: ok({ pct: 0, frac: "0/1G" }),
    }),
  );
}
test("only running workers: worker rows remain and the bottom row is absent", async () => {
  const root = await fixture();
  await seed(root);
  const scan = await readCoreRuns({ AGX_STATE_DIR: root }, "here");
  const text = output(scan);
  expect(text.split("\n").at(-1)).toContain("tkt_working │ working");
  expect(fleetLine(scan)).toBe("");
  for (const token of [
    "agx fresh",
    "dispatch warning:",
    "recover:",
    "workers 1 running",
    "ws 0 here",
    " all",
    "collectable",
    "unlanded",
    "lost",
    "stale(",
  ])
    expect(text).not.toContain(token);
});
test("completed session judgments, accepted unlanded runs and remedy findings share one action row", async () => {
  const root = await fixture();
  await seed(root, [
    started("judge"),
    ended("judge"),
    started("foreign", "elsewhere"),
    ended("foreign"),
    started("land"),
    ended("land"),
    { kind: "judged", id: "land", decision: "accept" },
    started("done"),
    ended("done"),
    { kind: "judged", id: "done", decision: "landed" },
  ]);
  await writeFile(
    join(root, "workspace-verdicts.json"),
    JSON.stringify({
      counts: { total: 2, unlanded: 1, collectable: 1, legacy: 0 },
      capturedAt: at(),
      complete: true,
      rows: [
        ["/ws/land", "ws", "unlanded"],
        ["/ws/done", "ws", "landed"],
      ],
    }),
  );
  await writeFile(
    join(root, "doctor.json"),
    JSON.stringify({
      kinds: { "accepted-landed-present": 14, unjudged: 200, orphaned: 31 },
      lost: 31,
      capturedAt: at(),
      complete: true,
    }),
  );
  const spawned = spyOn(Bun, "spawn");
  await Promise.resolve()
    .then(async () => {
      const scan = await readCoreRuns({ AGX_STATE_DIR: root }, "here");
      expect(scan.actions).toEqual({ judge: 1, land: 1 });
      expect(output(scan).split("\n").at(-1)).toBe(
        "judge 1 (agx judge) · land 1 (mise run land) · ⚠ tkt gc 14",
      );
      expect(spawned).not.toHaveBeenCalled();
    })
    .finally(() => {
      spawned.mockRestore();
    });
});
test("source ages name their source only alongside an action; elapsed idle time is silent", async () => {
  const root = await fixture();
  await seed(root);
  await utimes(join(root, "current-runs.json"), 1, 1);
  const scan = await readCoreRuns({ AGX_STATE_DIR: root }, "here");
  expect(fleetLine(scan)).toBe("");
  expect(
    fleetLine({
      ...scan,
      snapshotAgeSecs: 70,
      fleet: { running: 3, here: 1, other: 2, unattributed: 0 },
    }),
  ).toContain("+2 workers in other sessions · stale runs ");
  expect(
    fleetLine({
      ...scan,
      snapshotAgeSecs: 0,
      actions: { judge: 1, land: 0 },
      workspaces: {
        total: 1,
        unlanded: 0,
        collectable: 0,
        legacy: 0,
        capturedAt: at() - 70_000,
        stale: true,
      },
    }),
  ).toContain("stale ws 70s");
});
test("gpu-owner stall replaces the utilization average on Sys and names the holding process", async () => {
  const root = await fixture();
  process.env.XDG_STATE_HOME = root;
  process.env.STATUSLINE_PROC_ROOT = join(root, "proc");
  await mkdir(join(root, "proc/2461429"), { recursive: true });
  await writeFile(join(root, "proc/2461429/comm"), "julia\n");
  await writeFile(
    join(root, "gpu-owner.json"),
    JSON.stringify({
      schema: 1,
      attemptAt: at(),
      sampledAt: at(),
      unresponsiveSince: at() - 30 * 60_000,
      consecutiveProbeMisses: 10,
      devices: [],
      processes: [{ pid: 2461429, usedMiB: null }],
      samples: [0, 1, 2].map((n) => ({
        ts: at() - n * 60_000,
        nextTs: at() + (1 - n) * 60_000,
        utilPct: 1,
        memUsedGiB: 1,
        memTotalGiB: 12,
      })),
    }),
  );
  const host = await readHostLoadAsync();
  const text = Bun.stripANSI(sysRow({ ...host, disks: ok([]) }));
  expect(text).toContain("GPU stalled 30m00s (julia 2461429)");
  expect(text).not.toContain("GPU≈");
});

test("sampler publishes a GPU stall over a previously good utilization sample", async () => {
  const root = await fixture();
  const owner = join(root, "statusline/owner.json");
  await mkdir(join(root, "statusline"), { recursive: true });
  await writeFile(
    owner,
    JSON.stringify({
      schema: 1,
      fields: {
        vram: {
          at: at(),
          value: {
            value: { pct: 10, frac: "1/12G", gpuAvg15: 1, gpuSamples15: 15 },
          },
        },
      },
    }),
  );
  await writeFile(
    join(root, "gpu-owner.json"),
    JSON.stringify({
      schema: 1,
      attemptAt: at(),
      unresponsiveSince: at() - 60_000,
      devices: [],
      processes: [],
      samples: [],
    }),
  );
  const child = Bun.spawn(
    [process.execPath, join(import.meta.dir, "sample-fixture.ts")],
    {
      cwd: root,
      env: {
        ...process.env,
        HOME: root,
        XDG_STATE_HOME: root,
        XDG_CACHE_HOME: join(root, "cache"),
        STATUSLINE_OWNER_STATE: owner,
        STATUSLINE_CACHE_ROOT: join(root, "cache"),
        STATUSLINE_DISK_RATE_STATE: join(root, "disk-rate.json"),
        PATH: "",
      },
      stdin: new Blob([JSON.stringify({ cwd: root })]),
      stdout: "pipe",
      stderr: "pipe",
      timeout: 15_000,
    },
  );
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(exit, stdout + stderr).toBe(0);
  expect(await Bun.file(owner).text()).toContain("GPU stalled ");
  expect(await Bun.file(owner).text()).not.toContain('"gpuAvg15":1');
});
