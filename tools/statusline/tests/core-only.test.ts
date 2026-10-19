import { afterAll, afterEach, beforeEach, expect, test, spyOn } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { doctorFindings, workspaceCounts } from "../src/agx-snapshot.ts";
import { agxRouteRunsAsync, routeLines } from "../src/dispatch-runs.ts";
import { ok } from "neverthrow";
import { render } from "../src/format.ts";
import * as cp from "node:child_process";
import { fleetLine } from "../src/fleet-line.ts";

const root = await mkdtemp(join(tmpdir(), "statusline-core-only-"));
afterAll(() => rm(root, { recursive: true, force: true }));
const source = join(import.meta.dir, "../src");
const at = Temporal.Now.instant().epochMilliseconds;
const env = {
  HOME: root,
  PATH: "",
  AGX_NEXT_STATE_DIR: join(root, "state"),
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
await mkdir(env.AGX_NEXT_STATE_DIR, { recursive: true });
await writeFile(
  join(env.AGX_NEXT_STATE_DIR, "current-runs.json"),
  JSON.stringify({ output: JSON.stringify(listing), capturedAt: at, exit: 0 }),
);
await writeFile(
  join(env.AGX_NEXT_STATE_DIR, "workspace-verdicts.json"),
  JSON.stringify(workspace),
);
await writeFile(
  join(env.AGX_NEXT_STATE_DIR, "doctor.json"),
  JSON.stringify(doctor),
);
await writeFile(
  join(env.AGX_NEXT_STATE_DIR, "records.jsonl"),
  "poison: renderer must not read this",
);

test("fixed core outputs are rendered verbatim; bf3bb781 has no working row and lost is doctor's zero", async () => {
  expect(doctorFindings(JSON.stringify(doctor), at)?.lost).toBe(0);
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
  expect(out).toContain("+11 workers in other sessions");
  expect(out).not.toContain("outside-home 2");
  expect(out).toContain("tkt_live-ticket");
  expect(out).toContain("0m42s");
  expect(out).not.toContain("finished-ticket");
  expect(out).not.toContain("lost 8");
  expect(out).not.toContain("no event yet");
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
      expect(fleetLine(scan)).toContain("+11 workers in other sessions");
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
