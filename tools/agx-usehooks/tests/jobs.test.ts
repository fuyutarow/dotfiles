import { afterEach, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runningJobs, unattributedJobs } from "../src/index.ts";
import { commandFixture } from "./command-fixture.ts";

const originalPath = process.env.PATH;
const dirs: string[] = [];
afterEach(() => {
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function systemctlFixture(path: string, rows: Record<string, unknown>[]): void {
  const records = rows.map((row) => Object.entries(row));
  const units = records
    .map(
      (row) =>
        `${String(row.find(([key]) => key === "Id")?.[1])} loaded active running fixture`,
    )
    .join("\n");
  const properties = records
    .map((row) =>
      row.map(([key, value]) => `${key}=${String(value)}`).join("\n"),
    )
    .join("\n\n");
  commandFixture(path, {
    stdout: properties,
    match: { arg: "list-units", stdout: units },
  });
}

function world(rows: Record<string, unknown>[]) {
  const root = mkdtempSync(join(tmpdir(), "agx-usehooks-jobs-"));
  dirs.push(root);
  const bin = join(root, "bin");
  mkdirSync(bin);
  const systemctl = join(bin, "systemctl");
  systemctlFixture(systemctl, rows);
  process.env.PATH = bin;
  return {
    root,
    systemctl,
    ctx: { cwd: root, repoRoot: root, payload: { session_id: "own" } },
  };
}

test("jobs prefer unit session, then project cwd, and keep foreign jobs separate", async () => {
  const { root, ctx } = world([]);
  const rows = [
    {
      Id: "own.service",
      Environment: 'OTHER=1 "CLAUDE_CODE_SESSION_ID=own"',
      WorkingDirectory: "/foreign",
    },
    {
      Id: "other-session.service",
      Environment: "CLAUDE_CODE_SESSION_ID=other",
      WorkingDirectory: root,
    },
    {
      Id: "project.service",
      Environment: "",
      WorkingDirectory: join(root, "nested"),
    },
    {
      Id: "blank-session.service",
      Environment: 'CLAUDE_CODE_SESSION_ID=""',
      WorkingDirectory: root,
    },
    { Id: "foreign.service", WorkingDirectory: `${root}-sibling` },
    { Id: "escaped.service", WorkingDirectory: join(root, "..", "foreign") },
    { Id: "missing.service", WorkingDirectory: "" },
    {
      Id: "inactive.service",
      WorkingDirectory: root,
      ActiveState: "inactive",
      SubState: "dead",
    },
    { Id: "finished.service", WorkingDirectory: root, SubState: "exited" },
  ].map((row) =>
    Object.assign(
      { ActiveState: "active", SubState: "running", MainPID: "0" },
      row,
    ),
  );
  systemctlFixture(join(root, "bin", "systemctl"), rows);
  const jobs = await runningJobs(ctx);
  expect(jobs.map((job) => [job.id, job.attribution])).toEqual([
    ["own.service", "session"],
    ["other-session.service", "session"],
    ["project.service", "projectUnattributed"],
    ["blank-session.service", "projectUnattributed"],
    ["foreign.service", "foreign"],
    ["escaped.service", "foreign"],
    ["missing.service", "foreign"],
  ]);
  expect(
    (await runningJobs(ctx, { session: "own" })).map((job) => job.id),
  ).toEqual(["own.service"]);
  expect((await unattributedJobs(ctx)).map((job) => job.id)).toEqual([
    "project.service",
    "blank-session.service",
  ]);
  expect(await runningJobs(ctx, { session: "" })).toEqual([]);
});

test("job fallback reads process cwd and retains explicit kind and labels", async () => {
  const { root, ctx } = world([
    {
      Id: "process.service",
      ActiveState: "active",
      SubState: "running",
      MainPID: "42",
      WorkingDirectory: "",
      Environment: 'AGX_JOB_KIND=compute AGX_JOB_LABELS="benchmark,gpu"',
    },
  ]);
  const procRoot = join(root, "proc");
  mkdirSync(join(procRoot, "42"), { recursive: true });
  symlinkSync(root, join(procRoot, "42", "cwd"));
  const [job] = await runningJobs(ctx, { procRoot });
  expect(job).toMatchObject({
    id: "process.service",
    attribution: "projectUnattributed",
    cwd: root,
    kind: "compute",
    labels: ["benchmark", "gpu"],
  });
});

test("missing, failed, malformed and slow systemctl fail open within the budget", async () => {
  const { root, systemctl, ctx } = world([]);
  process.env.PATH = root;
  expect(await runningJobs(ctx)).toEqual([]);
  process.env.PATH = join(root, "bin");
  commandFixture(systemctl, { exit: 1 });
  expect(await runningJobs(ctx)).toEqual([]);
  commandFixture(systemctl, { stdout: "garbage" });
  expect(await runningJobs(ctx)).toEqual([]);
  commandFixture(systemctl, { sleepMs: 10_000 });
  const started = performance.now();
  expect(await runningJobs(ctx)).toEqual([]);
  expect(performance.now() - started).toBeLessThan(1_500);
});

test("list and show share one deadline, including failure of the property read", async () => {
  const { root, systemctl, ctx } = world([]);
  commandFixture(systemctl, {
    exit: 1,
    match: {
      arg: "list-units",
      stdout: "fixture.service loaded active running fixture\n",
    },
  });
  expect(await runningJobs(ctx)).toEqual([]);
  const calls = join(root, "deadline-calls");
  commandFixture(systemctl, {
    appendPath: calls,
    sleepMs: 650,
    stdout: "Id=fixture.service\nActiveState=active\nSubState=running\n",
    match: {
      arg: "list-units",
      stdout: "fixture.service loaded active running fixture\n",
    },
  });
  const started = performance.now();
  expect(await runningJobs(ctx)).toEqual([]);
  expect(performance.now() - started).toBeLessThan(1_500);
  expect(readFileSync(calls, "utf8")).toBe("xx");
});
