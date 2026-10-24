import { seedAgxSnapshot } from "./helpers.ts";
import { afterAll, afterEach, beforeEach, expect, test, spyOn } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workspaceCounts } from "../src/agx-snapshot.ts";
import { agxRouteRunsAsync, routeLines } from "../src/dispatch-runs.ts";
import { ok } from "neverthrow";
import { render } from "../src/format.ts";
import * as cp from "node:child_process";
import { fleetLine } from "../src/fleet-line.ts";
import { readCoreRuns } from "../src/core-runs.ts";

const root = await mkdtemp(join(tmpdir(), "statusline-core-only-"));
afterAll(() => rm(root, { recursive: true, force: true }));
const source = join(import.meta.dir, "../src");
const at = Temporal.Now.instant().epochMilliseconds;
const env = {
  HOME: root,
  PATH: "",
  AGX_STATE_DIR: join(root, "state"),
  XDG_STATE_HOME: root,
  AGX_DISPATCHER_SESSION: "",
  CLAUDE_CODE_SESSION_ID: "",
};
// Dispatcher selection reads process.env even when the state reader receives an env object.
const sessionKeys = ["AGX_DISPATCHER_SESSION", "CLAUDE_CODE_SESSION_ID"];
const inheritedSessions = new Map<string, string | undefined>();
beforeEach(() => {
  for (const key of sessionKeys) {
    inheritedSessions.set(key, process.env[key]);
    delete process.env[key];
  }
});
afterEach(() => {
  for (const [key, value] of inheritedSessions) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  inheritedSessions.clear();
});
const cwd = join(root, "project.ws/ws_example");
const repo = join(root, "project");
const listing = {
  runs: [
    {
      id: "live",
      ticket: "live-ticket",
      row: "terra-high",
      state: "running",
      dispatcher_session: "here",
      phase: "working",
      elapsed_seconds: 42,
      started_at: "2000-01-01T00:00:00Z",
    },
    {
      id: "bf3bb781",
      ticket: "finished-ticket",
      row: "terra-high",
      state: "ended",
      health: null,
      dispatcher_session: "here",
    },
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `history-${i}`,
      ticket: `history-${i}`,
      row: "terra-high",
      state: "ended",
      health: "orphaned",
      dispatcher_session: "elsewhere",
    })),
  ],
  summary: {
    running: 48,
    unattributed: 5,
    sessions: { here: { here: 37, other: 11 } },
    noSession: { here: 0, other: 48 },
  },
};
const workspace = {
  counts: { total: 89, unlanded: 23, collectable: 17, legacy: 9 },
  complete: true,
  capturedAt: at,
  repos: {
    [repo]: {
      counts: { total: 13, unlanded: 2, collectable: 7, legacy: 1 },
      capturedAt: at,
    },
  },
};
const doctor = {
  findings: [],
  kinds: { "outside-home": 2 },
  lost: 0,
  total: 2,
  complete: true,
  capturedAt: at,
};
await mkdir(env.AGX_STATE_DIR, { recursive: true });
await writeFile(
  join(env.AGX_STATE_DIR, "current-runs.json"),
  JSON.stringify({ output: JSON.stringify(listing), capturedAt: at, exit: 0 }),
);
await writeFile(
  join(env.AGX_STATE_DIR, "workspace-verdicts.json"),
  JSON.stringify(workspace),
);
seedAgxSnapshot(
  env,
  {
    output: JSON.stringify(listing),
    capturedAt: at,
    findings: { kinds: doctor.kinds, lost: doctor.lost, capturedAt: at },
    workspaces: { ...workspace.counts, capturedAt: at },
  },
  cwd,
);
await writeFile(
  join(env.AGX_STATE_DIR, "records.jsonl"),
  "poison: renderer must not read this",
);

test("fixed core outputs are rendered verbatim; bf3bb781 has no working row and lost is doctor's zero", async () => {
  expect(doctor.lost).toBe(0);
  expect(workspaceCounts(JSON.stringify(workspace), at)?.total).toBe(89);
  const scan = await agxRouteRunsAsync(env, "here", false, cwd);
  const out = render({
    cwd,
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
  });
  expect(out).toContain("+11 workers outside session here");
  expect(out).not.toContain("outside-home 2");
  expect(out).toContain("tkt_live-ticket");
  expect(out).toContain("0m42s");
  expect(out).not.toContain("finished-ticket");
  expect(out).not.toContain("lost 8");
  expect(out).not.toContain("no event yet");
});

test("Codex watch scope keeps both dispatcher workers visible beside a Claude session", async () => {
  const state = join(root, "two-provider-state");
  await mkdir(state, { recursive: true });
  const isolatedEnv = {
    ...env,
    AGX_STATE_DIR: state,
    XDG_STATE_HOME: state,
    STATUSLINE_OWNER_STATE: join(state, "owner.json"),
  };
  const codexSession = "01a15424-5f6d-7ce0-9244-eb632a37f579";
  const claudeSession = "47cecd33-9bd9-42b8-be16-8f17bb0bae76";
  const workers = [
    {
      id: "c9d536ba-cdc8-4e67-9d44-c3cf52fae384",
      ticket: "herdr-display-regression-oct21",
      state: "running",
      row: "sol-medium",
      dispatcher_session: codexSession,
      worker_name: "agt_herdr-display-regression-oct21",
      workspace_name: "ws_herdr-display-regression-oct21",
      elapsed_seconds: 137,
      vendor_session: null,
    },
    {
      id: "73091fb9-7f1a-4c25-b7e5-7336b37a37f5",
      ticket: "gpu-self-clear-window",
      state: "running",
      row: "terra-high",
      dispatcher_session: codexSession,
      worker_name: "agt_gpu-self-clear-window",
      workspace_name: "ws_gpu-self-clear-window",
      elapsed_seconds: 288,
      vendor_session: null,
    },
    {
      id: "outside-inventory-worker",
      ticket: "outside-inventory-worker",
      state: "running",
      row: "terra-high",
      dispatcher_session: "unlisted-session",
      worker_name: "agt_outside-inventory-worker",
      workspace_name: "ws_outside-inventory-worker",
      elapsed_seconds: 60,
      vendor_session: null,
    },
  ];
  seedAgxSnapshot(
    isolatedEnv,
    {
      output: JSON.stringify({
        runs: workers.map((row) =>
          Object.assign({}, row, { phase: "working" }),
        ),
        summary: {
          running: 3,
          unattributed: 0,
          sessions: {
            [codexSession]: { here: 2, other: 1 },
            [claudeSession]: { here: 0, other: 3 },
          },
          noSession: { here: 0, other: 3 },
        },
      }),
      capturedAt: at,
    },
    cwd,
  );

  const scan = await readCoreRuns(isolatedEnv, codexSession, cwd);
  expect(scan.sessionScope).toBe(codexSession);
  expect(scan.fleet).toMatchObject({ here: 2, other: 1, running: 3 });
  expect(scan.runs.filter((run) => run.alive)).toHaveLength(3);
  const rows = routeLines(scan.runs, codexSession);
  expect(rows).toHaveLength(2);
  expect(rows.join("\n")).toContain("agt_herdr-display-regression-oct21");
  expect(rows.join("\n")).toContain("agt_gpu-self-clear-window");
  expect(rows.join("\n")).not.toContain("claude-session-worker");
  expect(fleetLine(scan)).toContain(
    `+1 workers outside session ${codexSession}`,
  );

  const inventory = await readCoreRuns(isolatedEnv, null, cwd, [
    codexSession,
    claudeSession,
  ]);
  expect(inventory.inventorySessions).toEqual([codexSession, claudeSession]);
  expect(inventory.fleet).toMatchObject({ here: 2, other: 1, running: 3 });
  const inventoryRows = routeLines(inventory.runs, inventory.inventorySessions);
  expect(inventoryRows).toHaveLength(2);
  expect(inventoryRows.join("\n")).not.toContain("outside-inventory-worker");
  expect(fleetLine(inventory)).toContain(
    "+1 workers outside 2 displayed sessions",
  );
  const shared = render(
    {
      cwd,
      sid: claudeSession,
      model: "fixture",
      wfOn: false,
      rc: "off",
      rlModel: [],
      jobs: [],
      orphans: 0,
      routes: ok(inventory),
      vram: undefined,
      disks: ok([]),
      cpuPct: ok(0),
      ram: ok({ pct: 0, frac: "0/1G" }),
    },
    { layout: "shared" },
  );
  expect(shared).toContain("agt_herdr-display-regression-oct21");
  expect(shared).toContain("agt_gpu-self-clear-window");
  expect(shared).not.toContain("agt_claude-session-worker");
  expect(shared).not.toContain("agt_outside-inventory-worker");
  expect(shared).toContain("+1 workers outside 2 displayed sessions");

  const ambient = await readCoreRuns(
    { ...isolatedEnv, AGX_DISPATCHER_SESSION: codexSession },
    undefined,
    cwd,
  );
  expect(ambient.sessionScope).toBe(codexSession);
  const ambientShared = render(
    {
      cwd,
      sid: undefined,
      model: "fixture",
      wfOn: false,
      rc: "off",
      rlModel: [],
      jobs: [],
      orphans: 0,
      routes: ok(ambient),
      vram: undefined,
      disks: ok([]),
      cpuPct: ok(0),
      ram: ok({ pct: 0, frac: "0/1G" }),
    },
    { layout: "shared" },
  );
  expect(ambientShared).toContain("agt_herdr-display-regression-oct21");
  expect(ambientShared).toContain(`+1 workers outside session ${codexSession}`);

  const explicit = await readCoreRuns(
    { ...isolatedEnv, AGX_DISPATCHER_SESSION: codexSession },
    claudeSession,
    cwd,
  );
  expect(explicit.sessionScope).toBe(claudeSession);

  const emptyInventory = await readCoreRuns(isolatedEnv, null, cwd, []);
  expect(emptyInventory.inventorySessions).toEqual([]);
  const emptyShared = render(
    {
      cwd,
      sid: codexSession,
      model: "fixture",
      wfOn: false,
      rc: "off",
      rlModel: [],
      jobs: [],
      orphans: 0,
      routes: ok(emptyInventory),
      vram: undefined,
      disks: ok([]),
      cpuPct: ok(0),
      ram: ok({ pct: 0, frac: "0/1G" }),
    },
    { layout: "shared" },
  );
  expect(emptyShared).not.toContain("tkt_");
  expect(emptyShared).toContain("+3 workers outside 0 displayed sessions");
});

test("source guard: no run ledger, workspace enumeration, core count folding, or gc refresher", async () => {
  for (const path of (await readdir(source, { recursive: true })).filter(
    (entry) => entry.endsWith(".ts"),
  )) {
    const text = await Bun.file(join(source, path)).text();
    expect(text, path).not.toMatch(
      /fullFoldedRuns|foldedRuns|\["workspace",\s*"list"\]|\["ws",\s*"gc"/u,
    );
  }
  const snapshot = await Bun.file(join(source, "agx-snapshot.ts")).text();
  expect(snapshot).not.toMatch(/counts\.\w+\s*\+=|kinds\.set|\.reduce\(/u);
  expect(await Bun.file(join(source, "agx-refresh.ts")).exists()).toBe(false);
});

test("agx/ws/doctor row path spawns nothing", async () => {
  const children = [
    spyOn(cp, "spawn"),
    spyOn(cp, "exec"),
    spyOn(cp, "execFile"),
  ];
  const spawned = spyOn(Bun, "spawn");
  const sync = spyOn(Bun, "spawnSync");
  await Promise.resolve()
    .then(async () => {
      const started = performance.now();
      const scan = await agxRouteRunsAsync(env, "here", false, cwd);
      expect(fleetLine(scan)).toContain("+11 workers outside session here");
      expect(
        routeLines(scan.runs, "here", 0, scan.fleet).join("\n"),
      ).not.toContain("lost");
      for (const child of children) expect(child).not.toHaveBeenCalled();
      expect(spawned).not.toHaveBeenCalled();
      expect(sync).not.toHaveBeenCalled();
      expect(performance.now() - started).toBeLessThan(100);
    })
    .finally(() => {
      spawned.mockRestore();
      sync.mockRestore();
      for (const child of children) child.mockRestore();
    });
});
