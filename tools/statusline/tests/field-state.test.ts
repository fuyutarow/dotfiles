import { afterAll, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { err, ok } from "neverthrow";
import {
  buildDataframe,
  type BuildDataframeOptions,
} from "../src/build-dataframe.ts";
import { observed, renderField, retainField } from "../src/field-state.ts";
import { render } from "../src/format.ts";
import { seedAgxSnapshot } from "./helpers.ts";
import { jsonOf, z } from "../src/zod.ts";
import type { SessionStatus } from "../src/session-status.ts";
import { ROW_KINDS, renderRows, type DisplayRows } from "../src/row-state.ts";

const root = await mkdtemp(join(tmpdir(), "statusline-fields-"));
afterAll(() => rm(root, { recursive: true, force: true }));
const ANSI = new RegExp(`${String.fromCodePoint(27)}\\[[0-9;]*m`, "gu");
const plain = (text: string) => text.replaceAll(ANSI, "");
const now = () => Temporal.Now.instant().epochMilliseconds;
const sources = {
  identity: () =>
    Promise.resolve({
      email: "owner@example.test",
      accountWhy: undefined,
      rlModel: [{ name: "Fable", pct: 42, resetEpoch: undefined }],
      modelCapsWhy: undefined,
      wfOn: true,
    }),
  agentName: () => Promise.resolve(ok("worker-name")),
  rcState: () => Promise.resolve("on" as const),
  repoState: () =>
    Promise.resolve({ branch: "sticky-branch", branchWhy: undefined }),
  jobScan: () =>
    Promise.resolve({ jobs: [{ name: "sticky-job", secs: 100 }], orphans: 1 }),
  hostLoad: () =>
    Promise.resolve({
      cpuPct: ok(85),
      ram: ok({ pct: 55, frac: "5.5/10G" }),
      vram: ok({ pct: 65, frac: "6.5/10G", gpuAvg15: 75, gpuSamples15: 3 }),
      tmpfs: ok({ availableBytes: 1073741824, freeInodes: 1000 }),
      tmp: [
        {
          kind: "reading",
          label: "tmp",
          freeG: 9,
          totalG: 10,
          inodeUsedPct: 10,
        },
      ],
    }),
  routes: () => Promise.resolve(err("fixture dispatch unavailable")),
  dispatchWarning: () => Promise.resolve("dispatch-warning-value"),
  recoverHealth: () =>
    Promise.resolve({
      at: now(),
      unit: "tmpfs-capacity-recover.service",
      reason: "recovery failed",
      line: "fixture",
    }),
  storage: () =>
    Promise.resolve(
      ok(
        ["Disk C:", "Disk WSL", "tmpfs"].map((label) => ({
          kind: "reading" as const,
          label,
          usedG: 1,
          totalG: 10,
          freeG: 9,
        })),
      ),
    ),
  codexRate: () =>
    Promise.resolve(
      ok({ windows: [{ minutes: 10080, percent: 37 }], mtimeMs: now() }),
    ),
  jevUsage: () => Promise.resolve(ok({ costUsd: 1.25 })),
  herdrReport: async () => {},
} satisfies NonNullable<BuildDataframeOptions["sources"]>;
const payload: SessionStatus = {
  cwd: root,
  sessionId: "sticky-session",
  model: { name: "Opus 4.8" },
  effort: "xhigh",
  context: { inputTokens: 12000, usedPercent: 32 },
  rateLimits: { fiveHour: { usedPercent: 21 }, sevenDay: { usedPercent: 43 } },
  changes: { linesAdded: 5, linesRemoved: 2 },
  worktree: { name: "sticky-worktree" },
};

test("R3: every row kind renders when every reader times out before any good observation", async () => {
  const home = join(root, "all-readers-timeout");
  const child = Bun.spawn(
    [
      process.execPath,
      "--eval",
      `import {buildDataframe} from ${JSON.stringify(join(import.meta.dir, "../src/build-dataframe.ts"))};
     import {render} from ${JSON.stringify(join(import.meta.dir, "../src/format.ts"))};
     const names = ${JSON.stringify(Object.keys(sources))};
     const frame = await buildDataframe({}, {
       sources: Object.fromEntries(names.map(key => [key, () => new Promise(() => {})])),
       budgets: Object.fromEntries(names.map(key => [key, 5])),
     });
     console.log(render(frame));`,
    ],
    {
      env: {
        ...process.env,
        HOME: home,
        PATH: "",
        AGX_STATE_DIR: join(home, "agx"),
        XDG_RUNTIME_DIR: "",
        XDG_STATE_HOME: join(home, "state"),
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 15000,
    },
  );
  const output = plain(await new Response(child.stdout).text());
  const errors = await new Response(child.stderr).text();
  expect(await child.exited, errors).toBe(0);
  const lines = output.trim().split("\n");
  expect(lines).toHaveLength(6);
  const labels = [
    "|",
    "account n/a",
    "Model n/a",
    "Rate:",
    "Sys:",
    "Job: scan n/a",
  ];
  for (const [index, label] of labels.entries())
    expect(lines[index]).toContain(label);
  expect(output).not.toContain("agx fresh");
  expect(output).not.toContain("workers unknown running");
});

test("R3: the closed row record cannot silently omit or empty any row", () => {
  const rows = {
    prompt: observed("prompt"),
    identity: observed("identity"),
    agent: observed("agent"),
    rate: observed("rate"),
    sys: observed("sys"),
    job: observed("job"),
    agx: observed("agx"),
    fleet: observed("workers unknown running"),
    "dispatch-warning": observed("dispatch warning"),
    recover: observed("recover"),
  } satisfies DisplayRows;
  expect(renderRows(rows).split("\n")).toHaveLength(ROW_KINDS.length - 2);
  expect(plain(renderRows({ ...rows, job: observed("") }))).toContain(
    "Job: n/a",
  );
  Reflect.deleteProperty(rows, "job");
  expect(() => renderRows(rows)).toThrow("missing statusline row");
});

test("unknown only before a good value; stale values survive restarts and never expire", async () => {
  const store = join(root, "state-machine");
  expect(
    await retainField("field", observed(undefined, "timeout"), store, 1000),
  ).toEqual({ kind: "unknown", reason: "timeout" });
  await retainField("field", observed("value"), store, 1000);
  const state = await retainField(
    "field",
    observed(undefined, "timeout"),
    store,
    61000,
  );
  expect(plain(renderField("field", state))).toBe("value · 1m old");
  const child = Bun.spawn(
    [
      process.execPath,
      "--eval",
      `import {retainField,observed} from ${JSON.stringify(join(import.meta.dir, "../src/field-state.ts"))}; console.log(JSON.stringify(await retainField("field",observed(undefined,"failed"),${JSON.stringify(store)},86401000)));`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const text = await new Response(child.stdout).text();
  expect(await child.exited).toBe(0);
  expect(text).toContain('"value":"value"');
  expect(text).toContain('"kind":"stale"');
  expect(plain(renderField("field", { kind: "fresh", value: "zero 0" }))).toBe(
    "zero 0",
  );
});

test("every previously good display field survives failed reads independently with its age", async () => {
  const store = join(root, "all-fields");
  const first = await buildDataframe(payload, {
    sources,
    fieldStoreRoot: store,
  });
  const before = first.fields ?? {};
  const schema = jsonOf(z.object({ at: z.number(), value: z.string() }));
  for (const name of await readdir(store)) {
    const path = join(store, name);
    const saved = schema.safeParse(await readFile(path, "utf8"));
    expect(saved.success).toBe(true);
    if (saved.success)
      await writeFile(
        path,
        JSON.stringify({ ...saved.data, at: now() - 65000 }),
      );
  }
  const failed = await buildDataframe(
    { cwd: root, sessionId: payload.sessionId },
    {
      fieldStoreRoot: store,
      sources: {
        ...sources,
        identity: () =>
          Promise.resolve({
            email: undefined,
            accountWhy: "failed",
            rlModel: [],
            modelCapsWhy: "failed",
            wfOn: false,
          }),
        agentName: () => Promise.resolve(err("failed")),
        rcState: () => Promise.resolve("unknown"),
        repoState: () =>
          Promise.resolve({ branch: undefined, branchWhy: "failed" }),
        jobScan: () =>
          Promise.resolve({ jobs: [], orphans: 0, failed: "failed" }),
        hostLoad: () =>
          Promise.resolve({
            cpuPct: err("failed"),
            ram: err("failed"),
            vram: err("failed"),
            tmpfs: err("failed"),
          }),
        storage: () => Promise.resolve(err("failed")),
        codexRate: () => Promise.resolve(err("failed")),
        jevUsage: () => Promise.resolve(err("failed")),
        dispatchWarning: () => new Promise(() => {}),
        recoverHealth: () => new Promise(() => {}),
      },
      budgets: { dispatchWarning: 10, recoverHealth: 10 },
    },
  );
  for (const key of [
    "account",
    "name",
    "model",
    "effort",
    "workflow",
    "rc",
    "context-tokens",
    "context-percent",
    "claude-5h",
    "claude-7d",
    "model-caps",
    "codex:10080",
    "jev",
    "branch",
    "diff",
    "jobs",
    "cpu",
    "ram",
    "vram",
    "gpu",
    "tmpfs",
    "tmp:tmp",
    "disk:Disk C:",
    "disk:Disk WSL",
    "disk:tmpfs",
  ]) {
    const previous = before[key];
    expect(previous?.kind, key).toBe("fresh");
    const state = failed.fields?.[key];
    expect(state?.kind, key).toBe("stale");
    if (previous?.kind === "fresh" && state?.kind === "stale") {
      expect(state.value, key).toBe(previous.value);
      expect(state.age, key).toBeGreaterThanOrEqual(60000);
      expect(plain(render(failed)), key).toContain(plain(state.value));
    }
  }
});

test("a Codex read completing after its budget updates only the next frame", async () => {
  const store = join(root, "late");
  await buildDataframe(payload, { sources, fieldStoreRoot: store });
  const delayed =
    Promise.withResolvers<Awaited<ReturnType<typeof sources.codexRate>>>();
  const start = performance.now();
  const frame = await buildDataframe(payload, {
    sources: { ...sources, codexRate: () => delayed.promise },
    budgets: { codexRate: 15 },
    fieldStoreRoot: store,
  });
  expect(performance.now() - start).toBeLessThan(500);
  expect(frame.fields?.["codex:10080"]?.kind).toBe("stale");
  expect(plain(render(frame))).toContain("37%");
  delayed.resolve(
    ok({ windows: [{ minutes: 10080, percent: 71 }], mtimeMs: now() }),
  );
  let next = frame;
  for (let attempt = 0; attempt < 30; attempt++) {
    await Bun.sleep(10);
    next = await buildDataframe(payload, {
      sources: { ...sources, codexRate: () => Promise.resolve(err("failed")) },
      fieldStoreRoot: store,
    });
    if (plain(render(next)).includes("71%")) break;
  }
  expect(plain(render(next))).toContain("71%");
  expect(plain(render(frame))).toContain("37%");
});

test("three disk-snapshot workers survive an outer dispatch timeout, including snapshots older than ten minutes", async () => {
  const home = join(root, "agx-home");
  const env = {
    ...process.env,
    HOME: home,
    AGX_STATE_DIR: join(home, "agx"),
    XDG_RUNTIME_DIR: "",
    XDG_STATE_HOME: join(home, "xdg-state"),
    AGX_DISPATCHER_SESSION: "",
    CLAUDE_CODE_SESSION_ID: "",
  };
  seedAgxSnapshot(
    env,
    {
      output: JSON.stringify(
        [1, 2, 3].map((n) => ({
          id: `worker-${n}`,
          ticket: `ticket-${n}`,
          state: "running",
          row: `terra-${n}`,
          dispatcher_session: payload.sessionId,
          started_at: Temporal.Now.instant()
            .subtract({ minutes: 20 })
            .toString(),
        })),
      ),
      capturedAt: now() - 650000,
    },
    root,
  );
  const entry = join(import.meta.dir, "../src/statusline.ts");
  const input = JSON.stringify({
    session_id: payload.sessionId,
    cwd: root,
    model: { display_name: "Opus 4.8" },
  });
  const child = Bun.spawn([process.execPath, entry], {
    env: { ...env, STATUSLINE_AGX_FORCE_TIMEOUT: "1", PATH: "" },
    stdin: new Blob([input]),
    stdout: "pipe",
    stderr: "pipe",
    timeout: 15000,
  });
  const text = plain(await new Response(child.stdout).text());
  expect(await child.exited).toBe(0);
  for (const n of [1, 2, 3]) expect(text).toContain(`terra-${n}`);
  expect(text).not.toContain("agx fresh");
  expect(text).not.toMatch(/agx \d+m old/u);
  expect(text).not.toContain("agx n/a");
  // A reader that reports its failure as a Result must use the same disk fallback,
  // even before this session has populated the individual field store.
  const reportedFailure = Bun.spawn(
    [
      process.execPath,
      "--eval",
      `import {buildDataframe} from ${JSON.stringify(join(import.meta.dir, "../src/build-dataframe.ts"))}; import {render} from ${JSON.stringify(join(import.meta.dir, "../src/format.ts"))}; import {err} from "neverthrow"; console.log(render(await buildDataframe(${JSON.stringify({ cwd: root, sessionId: payload.sessionId })}, {fieldStoreRoot: ${JSON.stringify(join(home, "reported-failure-fields"))}, sources: {routes: async () => err("dispatch read failed")}})));`,
    ],
    {
      cwd: join(import.meta.dir, ".."),
      env: { ...env, PATH: "", STATUSLINE_AGX_FORCE_TIMEOUT: "0" },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 15000,
    },
  );
  const reportedText = plain(await new Response(reportedFailure.stdout).text());
  expect(await reportedFailure.exited).toBe(0);
  for (const n of [1, 2, 3]) expect(reportedText).toContain(`terra-${n}`);
  expect(reportedText).not.toContain("agx n/a");
  const emptyHome = join(root, "agx-never-written");
  const empty = Bun.spawn([process.execPath, entry], {
    env: {
      ...env,
      HOME: emptyHome,
      AGX_STATE_DIR: join(emptyHome, "agx"),
      XDG_STATE_HOME: join(emptyHome, "xdg-state"),
      STATUSLINE_AGX_FORCE_TIMEOUT: "1",
      PATH: "",
    },
    stdin: new Blob([input]),
    stdout: "pipe",
    stderr: "pipe",
    timeout: 15000,
  });
  expect(plain(await new Response(empty.stdout).text())).not.toContain(
    "agx n/a",
  );
  expect(await empty.exited).toBe(0);
}, 15000);
