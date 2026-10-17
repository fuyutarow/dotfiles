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
const fold = join(import.meta.dir, "../../agx-run/src/next/store.ts");
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

const tsv = [
  ["ws_a", "ws", "unlanded"],
  ["ws_b", "ws", "empty"],
  ["old_a", "legacy", "landed"],
  ["old_b", "legacy", "abandoned"],
  ["ws_c", "ws", "keep"],
  ["old_c", "legacy", "unlanded"],
]
  .map(([path, kind, verdict]) =>
    [path, kind, verdict, "abc", "1d", "fixture"].join("\t"),
  )
  .join("\n");
const doctorTsv = "agx-run\trepo\tid\torphaned\tfix\n";

test("doctor findings retain every source kind, omit zero counts, and require a good observation for ok", () => {
  const findings = doctorFindings(
    doctorTsv + "agx-ws\trepo\tws_x\tstale\tfix\n",
    at,
  );
  expect(findings).toEqual({
    kinds: { orphaned: 1, stale: 1 },
    capturedAt: at,
  });
  expect(doctorFindings("bad", at)).toBeUndefined();
  expect(fleetLine({ runs: [], unreadable: 0, findings }, at)).toEndWith(
    "⚠ orphaned 1 · stale 1",
  );
  expect(
    fleetLine(
      { runs: [], unreadable: 0, findings: doctorFindings("", at) },
      at,
    ),
  ).toEndWith(" · ok");
  expect(fleetLine(undefined, at)).toEndWith("anomalies unknown");
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
  expect(workspaceCounts("", at)?.total).toBe(0);
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
    `import {fullFoldedRuns} from ${JSON.stringify(fold)}; console.log(JSON.stringify(await fullFoldedRuns()));`,
  );
  const doctorOutput = await run(
    `import {doctor} from ${JSON.stringify(join(import.meta.dir, "../../agx-run/src/next/doctor.ts"))}; await doctor();`,
  );
  for (const [name, age] of [
    ["fresh", 0],
    ["old", 180],
    ["missing", -1],
  ] as const) {
    const home = join(root, name);
    const state = join(home, "state");
    const snapshotDir = join(state, "statusline");
    await mkdir(snapshotDir, { recursive: true });
    const snapshot = join(snapshotDir, "agx-runs.json");
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
      const lines = render(df).split("\\n").filter(line => line.startsWith("workers "));
      if (${age} >= 0) expect(render(df)).toContain("agt_model-layer@ws_model-layer tkt_model-layer");
      expect(lines).toHaveLength(1);
      expect(spawned).not.toHaveBeenCalled();
      for (const spy of childSpies) expect(spy).not.toHaveBeenCalled();
      console.log(lines[0]);
    `,
      { HOME: home, AGX_STATE_DIR: state, XDG_STATE_HOME: state },
    );
    expect(output).toMatchSnapshot(name);
    if (name === "fresh")
      expect(output).toBe(
        "workers 2 running (+2 in other sessions) · lost 1 · ws 6 · unlanded 2 · collectable 3 · legacy 3 fresh · ⚠ orphaned 1 · unjudged 1",
      );
  }
});

test.each([
  [2, 2, "workers 2 running (+2 in other sessions)"],
  [2, 0, "workers 2 running"],
  [0, 3, "workers 0 running (+3 in other sessions)"],
] as const)(
  "worker phrase snapshot: here %d, others %d",
  async (here, others, expected) => {
    const home = join(root, `phrase-${here}-${others}`);
    const state = join(home, "state");
    const dir = join(state, "statusline");
    await mkdir(dir, { recursive: true });
    const rows = Array.from({ length: here + others }, (_, i) => ({
      id: `worker-${i}`,
      ticket: `ticket-${i}`,
      state: "running",
      row: "terra-high",
      dispatcher_session: i < here ? "here" : "elsewhere",
    }));
    await writeFile(
      join(dir, "agx-runs.json"),
      JSON.stringify({
        output: JSON.stringify(rows),
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
    expect(agx).toBeDefined();
    expect(agx).not.toContain("other sessions");
    expect(text.split("other sessions").length - 1).toBe(${others > 0 ? 1 : 0});
    console.log(lines.find(line => line.startsWith("workers "))?.split(" · ")[0]);
  `,
      { HOME: home, XDG_STATE_HOME: state, AGX_STATE_DIR: state },
    );
    expect(output).toBe(expected);
    expect(output).toMatchSnapshot();
  },
);

test("workspace failure keeps last good workspace counts and their original age", () => {
  const scan = {
    runs: [],
    unreadable: 0,
    fleet: { running: 0, here: 0, lost: 0 },
    snapshotAgeSecs: 0,
    workspaces: workspaceCounts(tsv, at - 120_000),
  };
  expect(fleetLine(scan, at)).toContain("legacy 3 stale(120s) unknown");
});

test("background refresh publishes ws classifier output and throttles failed refresh attempts for a minute", async () => {
  const home = join(root, "refresh");
  const bin = join(home, "bin");
  const state = join(home, "state");
  const dir = join(state, "statusline");
  await mkdir(bin, { recursive: true });
  await mkdir(dir, { recursive: true });
  const command = join(bin, "agx");
  await writeFile(
    command,
    `#!/bin/sh\nif [ "$1" = doctor ]; then\nprintf '${doctorTsv}'\nprintf 'agx doctor: 1 finding(s)\\n' >&2\nexit 1\nfi\nif [ "$1" = ws ]; then\ncat <<'DATA'\n${tsv}\nDATA\nelse\nprintf '[]'\nfi\n`,
  );
  // Use an absolute cat path because the fixture PATH contains only this command.
  await writeFile(
    command,
    (await Bun.file(command).text()).replace("cat <<", "/bin/cat <<"),
  );
  await chmod(command, 0o755);
  const path = join(dir, "agx-runs.json");
  await writeFile(path + ".lock", JSON.stringify({ token: "fixture", at }));
  await run(
    `import {refreshAgxSnapshot} from ${JSON.stringify(join(source, "agx-snapshot.ts"))};
    performance.now=()=>100000000;
    Temporal.Now.instant=()=>Temporal.Instant.fromEpochMilliseconds(${at}); await refreshAgxSnapshot();`,
    {
      HOME: home,
      AGX_STATE_DIR: state,
      PATH: bin,
      STATUSLINE_AGX_REFRESH_TOKEN: "fixture",
    },
  );
  const beforeFailure = await Bun.file(path).text();
  expect(beforeFailure).toBe(
    JSON.stringify({
      output: "[]",
      capturedAt: at,
      exit: 0,
      workspaces: workspaceCounts(tsv, at),
      findings: doctorFindings(doctorTsv, at),
    }),
  );
  await writeFile(
    command,
    `#!/bin/sh\nif [ "$1" = doctor ]; then\nprintf '${doctorTsv}'\nprintf 'source unavailable\\nagx doctor: 1 finding(s)\\n' >&2\nexit 1\nfi\nif [ "$1" = ws ]; then exit 1; fi\nprintf "[]"\n`,
  );
  await writeFile(path + ".lock", JSON.stringify({ token: "fixture", at }));
  await run(
    `import {refreshAgxSnapshot} from ${JSON.stringify(join(source, "agx-snapshot.ts"))};
     Temporal.Now.instant=()=>Temporal.Instant.fromEpochMilliseconds(${at + 120_000}); await refreshAgxSnapshot();`,
    {
      HOME: home,
      AGX_STATE_DIR: state,
      PATH: bin,
      STATUSLINE_AGX_REFRESH_TOKEN: "fixture",
    },
  );
  expect(await Bun.file(path).text()).toBe(
    JSON.stringify({
      output: "[]",
      capturedAt: at + 120_000,
      exit: 0,
      workspaces: workspaceCounts(tsv, at),
      findings: doctorFindings(doctorTsv, at),
    }),
  );
  const beforeAgxFailure = await Bun.file(path).text();
  await writeFile(command, "#!/bin/sh\nexit 1\n");
  await writeFile(path + ".lock", JSON.stringify({ token: "fixture", at }));
  await run(
    `import {refreshAgxSnapshot} from ${JSON.stringify(join(source, "agx-snapshot.ts"))}; await refreshAgxSnapshot();`,
    {
      HOME: home,
      AGX_STATE_DIR: state,
      PATH: bin,
      STATUSLINE_AGX_REFRESH_TOKEN: "fixture",
    },
  );
  expect(await Bun.file(path).text()).toBe(beforeAgxFailure);
  await writeFile(path + ".attempt", String(at + 120_000));
  await run(
    `import {spyOn,expect} from "bun:test";
    import {readAgxSnapshotAsync} from ${JSON.stringify(join(source, "agx-snapshot.ts"))};
    Temporal.Now.instant=()=>Temporal.Instant.fromEpochMilliseconds(${at + 121_000});
    const spawned=spyOn(Bun,"spawn"); await readAgxSnapshotAsync(); expect(spawned).not.toHaveBeenCalled();`,
    { HOME: home, AGX_STATE_DIR: state, PATH: bin },
  );
});
