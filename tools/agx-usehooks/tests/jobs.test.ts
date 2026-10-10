import { afterEach, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runningJobs, unattributedJobs } from "../src/index.ts";

const originalPath = process.env.PATH;
const dirs: string[] = [];
afterEach(() => {
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function world(rows: object[]) {
  const root = mkdtempSync(join(tmpdir(), "agx-usehooks-jobs-"));
  dirs.push(root);
  const bin = join(root, "bin");
  mkdirSync(bin);
  const systemctl = join(bin, "systemctl");
  writeFileSync(
    systemctl,
    `#!${process.execPath}\nconst rows = ${JSON.stringify(rows)};
if (process.argv.includes("list-units")) {
  process.stdout.write(rows.map(row => row.Id + " loaded active running fixture").join("\\n"));
} else {
  process.stdout.write(rows.map(row => Object.entries(row).map(([key,value]) => key + "=" + value).join("\\n")).join("\\n\\n"));
}\n`,
  );
  chmodSync(systemctl, 0o755);
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
  writeFileSync(
    join(root, "bin", "systemctl"),
    `#!${process.execPath}\nconst rows = ${JSON.stringify(rows)};
process.stdout.write(process.argv.includes("list-units") ? rows.map(row => row.Id + " loaded active running fixture").join("\\n") : rows.map(row => Object.entries(row).map(([key,value]) => key + "=" + value).join("\\n")).join("\\n\\n"));\n`,
  );
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
  writeFileSync(systemctl, `#!${process.execPath}\nprocess.exit(1);\n`);
  expect(await runningJobs(ctx)).toEqual([]);
  writeFileSync(
    systemctl,
    `#!${process.execPath}\nprocess.stdout.write("garbage");\n`,
  );
  expect(await runningJobs(ctx)).toEqual([]);
  writeFileSync(systemctl, `#!${process.execPath}\nawait Bun.sleep(10_000);\n`);
  const started = performance.now();
  expect(await runningJobs(ctx)).toEqual([]);
  expect(performance.now() - started).toBeLessThan(1_500);
});

test("list and show share one deadline, including failure of the property read", async () => {
  const { systemctl, ctx } = world([]);
  writeFileSync(
    systemctl,
    `#!${process.execPath}\nif (process.argv.includes("list-units")) process.stdout.write("fixture.service loaded active running fixture\\n"); else process.exit(1);\n`,
  );
  expect(await runningJobs(ctx)).toEqual([]);
  writeFileSync(
    systemctl,
    `#!${process.execPath}\nawait Bun.sleep(650);\nprocess.stdout.write(process.argv.includes("list-units") ? "fixture.service loaded active running fixture\\n" : "Id=fixture.service\\nActiveState=active\\nSubState=running\\n");\n`,
  );
  const started = performance.now();
  expect(await runningJobs(ctx)).toEqual([]);
  expect(performance.now() - started).toBeLessThan(1_500);
});
