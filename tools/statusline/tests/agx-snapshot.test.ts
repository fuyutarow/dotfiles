import { afterAll, expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  adaptAgxStatus,
  agxStatusKey,
  AgxStatusSchema,
  readAgxSnapshotAsync,
} from "../src/agx-snapshot.ts";
import { collectAgxStatus } from "../src/agx-collector.ts";
import { ownerStatePath } from "../src/owner-state.ts";
import { z } from "../src/zod.ts";
import { decoded, decodedJson } from "./decode.ts";

const root = await mkdtemp(join(tmpdir(), "statusline-status-cli-"));
afterAll(() => rm(root, { recursive: true, force: true }));
const at = Temporal.Now.instant().epochMilliseconds - 75_000;
const status = {
  schema: 1,
  runs: {
    source: "stale",
    captured_at: at,
    age_s: 75,
    reason: null,
    rows: [
      {
        id: "live",
        ticket: "work",
        row: "luna-high",
        state: "running",
        dispatcher_session: "session",
      },
    ],
    summary: {
      running: 3,
      unattributed: 1,
      sessions: { session: { here: 1, other: 2 } },
      noSession: { here: 0, other: 3 },
    },
  },
  workspaces: {
    total: 7,
    unlanded: 2,
    collectable: 3,
    legacy: 1,
    here: 2,
    fleet_known: true,
    captured_at: at,
    stale: false,
  },
  findings: {
    kinds: { orphaned: 2, unjudged: 4 },
    lost: 2,
    captured_at: at,
    stale: true,
  },
  judgments: { by_session: { session: 4 }, repository: 5, land: 2, why: null },
};
async function fixture(name: string) {
  const home = join(root, name);
  const bin = join(home, "bin");
  await mkdir(bin, { recursive: true });
  const env = {
    HOME: home,
    PATH: bin,
    STATUSLINE_OWNER_STATE: join(home, "owner.json"),
    STATUSLINE_CACHE_ROOT: join(home, "cache"),
    XDG_STATE_HOME: join(home, "state"),
    AGX_STATUS_FILE: join(home, "status.json"),
    AGX_CALLS: join(home, "calls.jsonl"),
  };
  await writeFile(env.AGX_STATUS_FILE, JSON.stringify(status));
  await writeFile(
    join(bin, "agx"),
    `#!${process.execPath}
import { appendFileSync } from "node:fs";
appendFileSync(process.env.AGX_CALLS, JSON.stringify(process.argv.slice(2)) + "\\n");
process.stdout.write(await Bun.file(process.env.AGX_STATUS_FILE).text());
process.exit(Number(process.env.AGX_STATUS_EXIT ?? 0));
`,
  );
  await chmod(join(bin, "agx"), 0o755);
  return env;
}
async function cache(
  env: NodeJS.ProcessEnv,
  cwd: string,
  value: unknown,
  error?: string,
) {
  await writeFile(
    ownerStatePath(env),
    JSON.stringify({
      schema: 1,
      fields: {
        [agxStatusKey(cwd)]: {
          at,
          value,
          ...(error === undefined ? {} : { error }),
        },
      },
    }),
  );
}

test("missing owner cache stays unknown without invoking agx or creating files", async () => {
  const env = await fixture("missing");
  expect(await readAgxSnapshotAsync(env)).toMatchObject({
    rows: undefined,
    reason: "snapshot unavailable",
  });
  expect(await Bun.file(env.AGX_CALLS).exists()).toBe(false);
  expect(await Bun.file(ownerStatePath(env)).exists()).toBe(false);
});

test("collector invokes exactly agx status --json --cwd and adapts all supplied counts", async () => {
  const env = await fixture("adapter");
  const cwd = join(root, "repository with spaces");
  const result = await collectAgxStatus(cwd, env);
  expect(result.isOk()).toBe(true);
  if (result.isErr()) return;
  const wire = result.value;
  expect(await readFile(env.AGX_CALLS, "utf8")).toBe(
    JSON.stringify(["status", "--json", "--cwd", cwd]) + "\n",
  );
  expect(adaptAgxStatus(wire)).toEqual({
    rows: status.runs.rows,
    summary: status.runs.summary,
    runSource: { kind: "stale", capturedAt: at },
    ageSeconds: 75,
    reason: undefined,
    workspaces: {
      total: 7,
      unlanded: 2,
      collectable: 3,
      legacy: 1,
      here: 2,
      fleetKnown: true,
      capturedAt: at,
      stale: false,
    },
    findings: {
      kinds: status.findings.kinds,
      lost: 2,
      capturedAt: at,
      stale: true,
    },
    judgments: { session: 4 },
    repositoryJudgments: 5,
    land: 2,
    judgeWhy: undefined,
  });
  await cache(env, cwd, wire);
  expect((await readAgxSnapshotAsync(env, cwd)).rows).toEqual(status.runs.rows);
  expect((await readAgxSnapshotAsync(env, cwd)).summary).toEqual(
    status.runs.summary,
  );
  expect(
    (await readFile(env.AGX_CALLS, "utf8")).trim().split("\n"),
  ).toHaveLength(1);
});

test("schema-1 unknown and null optional facts remain unavailable", () => {
  const wire = decoded(AgxStatusSchema, {
    ...status,
    runs: {
      source: "unknown",
      captured_at: null,
      age_s: null,
      reason: "snapshot unavailable",
      rows: null,
      summary: null,
    },
    workspaces: null,
    findings: null,
    judgments: {
      by_session: {},
      repository: 0,
      land: 0,
      why: "repository scope unavailable",
    },
  });
  expect(adaptAgxStatus(wire)).toMatchObject({
    rows: undefined,
    workspaces: undefined,
    findings: undefined,
    runSource: { kind: "unknown", why: "snapshot unavailable" },
    judgeWhy: "repository scope unavailable",
  });
});

const failure = (result: Awaited<ReturnType<typeof collectAgxStatus>>) =>
  result.match(
    () => null,
    (error) => error,
  );

test("failed commands, malformed JSON, and unsupported schemas never become observations", async () => {
  const env = await fixture("invalid");
  expect(
    failure(await collectAgxStatus(root, { ...env, AGX_STATUS_EXIT: "7" })),
  ).toContain("exit 7");
  for (const text of [
    "broken",
    JSON.stringify({ ...status, schema: 2 }),
    JSON.stringify({ ...status, judgments: { ...status.judgments, land: -1 } }),
  ]) {
    await writeFile(env.AGX_STATUS_FILE, text);
    expect(failure(await collectAgxStatus(root, env))).toContain(
      "invalid schema-1 JSON",
    );
  }
  expect(failure(await collectAgxStatus(root, { ...env, PATH: "" }))).toContain(
    "no agx on PATH",
  );
});

test("cache replacement, scoped counts, and failed collection retain the owner's facts", async () => {
  const env = await fixture("cache");
  const cwd = join(root, "repo");
  const wire = {
    ...status,
    runs: { ...status.runs, source: "current", age_s: 0 },
  };
  await cache(env, cwd, wire);
  expect((await readAgxSnapshotAsync(env, join(cwd, "src"))).ageSeconds).toBe(
    0,
  );
  const outside = await readAgxSnapshotAsync(env, join(root, "other"));
  expect(outside.workspaces?.here).toBeUndefined();
  expect(outside.repositoryJudgments).toBeUndefined();
  expect(outside.judgments).toEqual({ session: 4 });
  expect(outside.land).toBeUndefined();
  await cache(env, cwd, wire, "agx status exit 7");
  const stale = await readAgxSnapshotAsync(env, cwd);
  expect(stale.rows).toEqual(status.runs.rows);
  expect(stale.runSource.kind).toBe("stale");
  expect(stale.ageSeconds).toBeGreaterThanOrEqual(75);
  expect(stale.findings?.stale).toBe(true);
  expect(stale.workspaces?.stale).toBe(true);
  await cache(env, cwd, { ...wire, runs: { ...wire.runs, rows: [] } });
  expect((await readAgxSnapshotAsync(env, cwd)).rows).toEqual([]);
  await writeFile(
    ownerStatePath(env) + ".last-good",
    await readFile(ownerStatePath(env)),
  );
  await writeFile(ownerStatePath(env), "partial");
  expect((await readAgxSnapshotAsync(env, cwd)).rows).toEqual([]);
  expect((await readAgxSnapshotAsync(env, cwd)).runSource.kind).toBe("stale");
});

test("sampler publishes CLI state once per directory and retains failed collections", async () => {
  const env = await fixture("sampler");
  const sample = async (extra: NodeJS.ProcessEnv = {}) => {
    const child = Bun.spawn(
      [process.execPath, join(import.meta.dir, "sample-fixture.ts")],
      {
        cwd: env.HOME,
        env: { ...env, ...extra },
        stdin: new Blob([JSON.stringify({ cwd: env.HOME })]),
        stdout: "pipe",
        stderr: "pipe",
        timeout: 15_000,
      },
    );
    const [out, err, exit] = await Promise.all([
      child.stdout.text(),
      child.stderr.text(),
      child.exited,
    ]);
    expect(exit, out + err).toBe(0);
  };
  await sample();
  const calls = (await readFile(env.AGX_CALLS, "utf8")).trim().split("\n");
  expect(new Set(calls).size, calls.join("\n")).toBe(calls.length);
  expect(calls).toContain(
    JSON.stringify(["status", "--json", "--cwd", env.HOME]),
  );
  expect((await readAgxSnapshotAsync(env, env.HOME)).repositoryJudgments).toBe(
    5,
  );
  await sample({ AGX_STATUS_EXIT: "7" });
  const retained = await readAgxSnapshotAsync(env, env.HOME);
  expect(retained.rows).toEqual(status.runs.rows);
  expect(retained.runSource.kind).toBe("stale");
  expect(retained.reason).toContain("exit 7");
}, 30_000);

test("render route reader uses cache with process, network and writes forbidden", async () => {
  const env = await fixture("render");
  await cache(env, env.HOME, status);
  const child = Bun.spawn(
    [
      process.execPath,
      "--preload",
      join(import.meta.dir, "no-process-preload.ts"),
      "--eval",
      `import { readCoreRuns } from ${JSON.stringify(join(import.meta.dir, "../src/core-runs.ts"))};
process.stdout.write(JSON.stringify(await readCoreRuns(process.env, "session", process.env.HOME)));`,
    ],
    {
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5000,
    },
  );
  const [out, err, exit] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);
  expect(exit, err).toBe(0);
  const scan = decodedJson(
    z.object({
      actions: z.object({ judge: z.number(), land: z.number() }),
      fleet: z.object({ here: z.number(), other: z.number() }),
    }),
    out,
  );
  expect(scan.actions).toEqual({ judge: 4, land: 2 });
  expect(scan.fleet).toEqual({ here: 1, other: 2 });
  expect(await Bun.file(env.AGX_CALLS).exists()).toBe(false);
});
