import { afterAll, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workspaceCounts, doctorFindings } from "../src/agx-snapshot.ts";
import { fleetLine } from "../src/fleet-line.ts";

const root = await mkdtemp(join(tmpdir(), "fleet-line-"));
afterAll(() => rm(root, { recursive: true, force: true }));
const fixtureBin = join(root, "bin");
await mkdir(fixtureBin);
await writeFile(
  join(fixtureBin, "ps"),
  "#!/bin/sh\nprintf 'fixture-start\\n'\n",
);
await chmod(join(fixtureBin, "ps"), 0o755);
const at = Temporal.Instant.from("2026-10-17T00:00:00Z").epochMilliseconds;
const source = join(import.meta.dir, "../src");
const env = {
  HOME: root,
  PATH: fixtureBin,
  AGX_STATE_DIR: join(root, "agx"),
  XDG_RUNTIME_DIR: "",
  XDG_STATE_HOME: join(root, "state"),
  AGX_DISPATCHER_SESSION: "",
  CLAUDE_CODE_SESSION_ID: "",
  TZ: "UTC",
};
async function run(script: string, extra: NodeJS.ProcessEnv = {}) {
  const child = Bun.spawn(
    [
      process.execPath,
      "--eval",
      `Temporal.Now.instant=()=>Temporal.Instant.fromEpochMilliseconds(${at});\n${script}`,
    ],
    {
      cwd: join(import.meta.dir, "../../.."),
      env: { ...env, ...extra },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 15_000,
    },
  );
  const [out, err, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(exit, err).toBe(0);
  return out.trim();
}

const tsv = JSON.stringify({
  counts: { total: 6, unlanded: 2, collectable: 3, legacy: 3 },
  complete: true,
});

test("doctor findings retain every source kind, omit zero counts, and require a good observation for ok", () => {
  const findings = doctorFindings(
    JSON.stringify({
      kinds: { orphaned: 1, stale: 1 },
      lost: 1,
      total: 2,
      complete: true,
    }),
    at,
  );
  expect(findings).toEqual({
    kinds: { orphaned: 1, stale: 1 },
    lost: 1,
    capturedAt: at,
  });
  expect(doctorFindings("bad", at)).toBeUndefined();
  expect(fleetLine({ runs: [], unreadable: 0, findings }, at)).toContain(
    "ws refresh 1",
  );
  expect(fleetLine({ runs: [], unreadable: 0, findings }, at)).toEndWith(
    "⚠ ws refresh 1",
  );
  expect(
    fleetLine(
      {
        runs: [],
        unreadable: 0,
        findings: doctorFindings(
          JSON.stringify({ kinds: {}, lost: 0, total: 0, complete: true }),
          at,
        ),
      },
      at,
    ),
  ).toBe("");
  expect(fleetLine(undefined, at)).toBe("");
});

test("fleet counts gc verdicts, including legacy and abandoned, without implying deletion permission", () => {
  expect(workspaceCounts(tsv, at)).toEqual({
    total: 6,
    unlanded: 2,
    collectable: 3,
    legacy: 3,
    capturedAt: at,
  });
  expect(
    workspaceCounts("repo\trepo\tFAILED\t?\t?\tfailure", at),
  ).toBeUndefined();
  expect(workspaceCounts("not tsv", at)).toBeUndefined();
  expect(
    workspaceCounts(
      JSON.stringify({
        counts: { total: 0, unlanded: 0, collectable: 0, legacy: 0 },
        complete: true,
      }),
      at,
    )?.total,
  ).toBe(0);
});

test("snapshot renders one fleet row in order from the actual agx fold; fresh, stale and missing never invoke jj", async () => {
  await mkdir(env.AGX_STATE_DIR, { recursive: true });
  // Live leases use this test process; missing leases become doctor-classified orphans.
  const events = ["here", "here", "elsewhere", null, "here"].map(
    (session, i) => ({
      kind: "started",
      id: `fixture-${i}`,
      at: "2026-10-16T00:00:00Z",
      ticket: i === 0 ? "model-layer" : `ticket-${i}`,
      worker_name: i === 0 ? "agt_model-layer" : `agt_ticket-${i}`,
      workspace_name: i === 0 ? "ws_model-layer" : `ws_ticket-${i}`,
      writes: [],
      cwd: root,
      workspace: root,
      row: "terra-high",
      dispatcher_session: session,
      vendor_session: null,
      pid: i === 4 ? 0 : process.pid,
      lease: { pid: i === 4 ? 0 : process.pid, start: null, unit: null },
    }),
  );
  await writeFile(
    join(env.AGX_STATE_DIR, "records.jsonl"),
    [
      ...events,
      { ...events[0], id: "unjudged", at: "2026-10-01T00:00:00Z" },
      {
        kind: "ended",
        id: "unjudged",
        at: "2026-10-01T01:00:00Z",
        exit: 0,
        outcome: "ok",
        returned: true,
        report_path: null,
        vendor_session: null,
        verify: [],
      },
    ]
      .map((row) => JSON.stringify(row))
      .join("\n") + "\n",
  );
  const folded = await run(
    `import {list} from ${JSON.stringify(join(import.meta.dir, "../../agx-run/src/next/run.ts"))}; await list({json:true, summary:true});`,
  );
  const doctorOutput = JSON.stringify({
    kinds: { orphaned: 1, unjudged: 1 },
    lost: 1,
    total: 2,
    complete: true,
  });
  for (const [name, age] of [
    ["fresh", 0],
    ["old", 180],
    ["missing", -1],
  ] as const) {
    const home = join(root, name);
    const state = join(home, "state");
    const snapshotDir = state;
    await mkdir(snapshotDir, { recursive: true });
    const snapshot = join(snapshotDir, "current-runs.json");
    if (age >= 0)
      await writeFile(
        snapshot,
        JSON.stringify({
          output: folded,
          capturedAt: at - age * 1000,
          exit: 0,
          workspaces: workspaceCounts(tsv, at - age * 1000),
          findings: doctorFindings(doctorOutput, at - age * 1000),
        }),
      );
    // A concurrent/background refresher is already responsible for this minute.
    await writeFile(snapshot + ".attempt", String(at));
    const output = await run(
      `
      import {spyOn, expect} from "bun:test";
      import * as cp from "node:child_process";
      import {ok} from "neverthrow";
      import {agxRouteRunsAsync} from ${JSON.stringify(join(source, "dispatch-runs.ts"))};
      import {render} from ${JSON.stringify(join(source, "format.ts"))};
      Temporal.Now.instant = () => Temporal.Instant.fromEpochMilliseconds(${at});
      const spawned = spyOn(Bun, "spawn");
      const childSpies = [spyOn(cp, "spawn"), spyOn(cp, "execFile"), spyOn(cp, "exec")];
      const scan = await agxRouteRunsAsync(process.env, "here", false);
      const df = {cwd:${JSON.stringify(home)},sid:"here",model:"fixture",wfOn:false,rc:"off",rlModel:[],jobs:[],orphans:0,
        routes:ok(scan),vram:undefined,disks:ok([]),cpuPct:ok(0),ram:ok({pct:0,frac:"0/1G"})};
      const lines = render(df).split("\\n").filter(line => line.includes("workers in other sessions"));
      if (${age} >= 0) expect(render(df)).toContain("agt_model-layer@ws_model-layer tkt_model-layer");
      expect(lines).toHaveLength(${age >= 0 ? 1 : 0});
      expect(spawned).not.toHaveBeenCalled();
      for (const spy of childSpies) expect(spy).not.toHaveBeenCalled();
      console.log(lines[0] ?? "");
    `,
      { HOME: home, AGX_STATE_DIR: state, XDG_STATE_HOME: state },
    );
    expect(output).toMatchSnapshot(name);
    if (name === "fresh")
      expect(output).toBe("judge 2 (agx judge) · +2 workers in other sessions");
  }
});

test.each([
  [2, 2, "+2 workers in other sessions"],
  [2, 0, ""],
  [0, 3, "+3 workers in other sessions"],
] as const)(
  "worker phrase snapshot: here %d, others %d",
  async (here, others, expected) => {
    const home = join(root, `phrase-${here}-${others}`);
    const state = join(home, "state");
    const dir = state;
    await mkdir(dir, { recursive: true });
    const rows = Array.from({ length: here + others }, (_, i) => ({
      id: `worker-${i}`,
      ticket: `ticket-${i}`,
      state: "running",
      row: "terra-high",
      dispatcher_session: i < here ? "here" : "elsewhere",
    }));
    await writeFile(
      join(dir, "current-runs.json"),
      JSON.stringify({
        output: JSON.stringify({
          runs: rows,
          summary: {
            running: here + others,
            unattributed: 0,
            sessions: { here: { here, other: others } },
            noSession: { here: 0, other: here + others },
          },
        }),
        capturedAt: at,
        exit: 0,
      }),
    );
    await writeFile(join(dir, "agx-runs.json.attempt"), String(at));
    const output = await run(
      `
    import {expect} from "bun:test";
    import {ok} from "neverthrow";
    import {agxRouteRunsAsync} from ${JSON.stringify(join(source, "dispatch-runs.ts"))};
    import {render} from ${JSON.stringify(join(source, "format.ts"))};
    const scan = await agxRouteRunsAsync(process.env, "here", false);
    const text = render({cwd:${JSON.stringify(home)},sid:"here",model:"fixture",wfOn:false,rc:"off",rlModel:[],jobs:[],orphans:0,
      routes:ok(scan),vram:undefined,disks:ok([]),cpuPct:ok(0),ram:ok({pct:0,frac:"0/1G"})});
    const lines = text.split("\\n");
    const agx = lines.find(line => line.startsWith("agx "));
    expect(agx).toBeUndefined();
    expect(text.split("other sessions").length - 1).toBe(${others > 0 ? 1 : 0});
    console.log(lines.find(line => line.includes("workers in other sessions"))?.split(" · ")[0] ?? "");
  `,
      { HOME: home, XDG_STATE_HOME: state, AGX_STATE_DIR: state },
    );
    expect(output).toBe(expected);
    expect(output).toMatchSnapshot();
  },
);

test("unchanged workspace counts do not become stale with elapsed time", () => {
  const scan = {
    runs: [],
    unreadable: 0,
    fleet: { running: 0, here: 0, other: 0, lost: 0, unattributed: 0 },
    snapshotAgeSecs: 0,
    workspaces: workspaceCounts(tsv, at - 120_000),
  };
  expect(fleetLine(scan, at)).toBe("");
});

test("a cold per-repository observation never masquerades as a fleet total", () => {
  const line = fleetLine(
    {
      runs: [],
      unreadable: 0,
      workspaces: {
        total: 13,
        here: 13,
        unlanded: 2,
        collectable: 7,
        legacy: 1,
        capturedAt: at,
        fleetKnown: false,
      },
    },
    at,
  );
  expect(line).toBe("");
});
