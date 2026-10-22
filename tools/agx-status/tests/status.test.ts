import { expect, test } from "bun:test";
import { mkdir, readdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { jsonOf, z } from "../../shared/src/zod.ts";

const fixtureRoot = join(
  import.meta.dir,
  "../../../.agent-state/sep-agx-status-core-1023/fixtures",
);
const repo = join(fixtureRoot, "repo");
const cliPath = join(import.meta.dir, "../src/status.ts");
const counts = { total: 3, unlanded: 1, collectable: 0, legacy: 0 };
const summary = {
  running: 1,
  unattributed: 0,
  sessions: { sessionA: { here: 1, other: 0 } },
  noSession: { here: 0, other: 0 },
};
const now = Temporal.Now.instant().epochMilliseconds;
const snapshotAt = now - 60_000;
const oldEnd = Temporal.Instant.fromEpochMilliseconds(now - 30_000).toString();
const outputSchema = z.object({
  schema: z.literal(1),
  runs: z.object({
    source: z.enum(["current", "stale", "unknown"]),
    captured_at: z.number().nullable(),
    age_s: z.number().nullable(),
    reason: z.string().nullable(),
    rows: z.array(z.unknown()).nullable(),
    summary: z.unknown().nullable(),
  }),
  workspaces: z
    .object({
      total: z.number(),
      unlanded: z.number(),
      collectable: z.number(),
      legacy: z.number(),
      here: z.number().optional(),
      fleet_known: z.boolean().optional(),
      captured_at: z.number(),
      stale: z.boolean().optional(),
    })
    .nullable(),
  findings: z
    .object({
      kinds: z.record(z.string(), z.number()),
      lost: z.number(),
      captured_at: z.number(),
      stale: z.boolean().optional(),
    })
    .nullable(),
  judgments: z.object({
    by_session: z.record(z.string(), z.number()),
    repository: z.number(),
    land: z.number(),
    why: z.string().nullable(),
  }),
});

async function put(dir: string, name: string, value: unknown): Promise<void> {
  await writeFile(
    join(dir, name),
    typeof value === "string" ? value : JSON.stringify(value),
  );
}

async function fixture(name: string, stale: boolean): Promise<string> {
  const dir = join(fixtureRoot, name);
  await mkdir(dir, { recursive: true });
  await mkdir(repo, { recursive: true });
  const pending = {
    id: "pending",
    dispatcher_session: "sessionA",
    workspace: repo,
    ended_at: oldEnd,
    judgment: null,
  };
  const accepted = {
    ...pending,
    id: "accepted",
    dispatcher_session: "sessionB",
    judgment: { decision: "accept" },
  };
  await put(dir, "current-runs.json", {
    output: JSON.stringify({ runs: [], summary }),
    capturedAt: snapshotAt,
    exit: 0,
    endedRuns: [pending, accepted],
    acceptedRuns: [accepted],
  });
  await put(dir, "workspace-verdicts.json", {
    counts: { ...counts, capturedAt: snapshotAt },
    capturedAt: snapshotAt,
    complete: true,
    fleetComplete: true,
    repos: {
      [repo]: {
        counts: { ...counts, total: 2 },
        capturedAt: snapshotAt,
        lines: [`${repo}\tready\tunlanded`],
      },
    },
  });
  await put(dir, "doctor.json", {
    kinds: { blocked: 2 },
    lost: 1,
    capturedAt: snapshotAt,
    complete: true,
  });
  await put(
    dir,
    "records.jsonl",
    [
      JSON.stringify({
        kind: "started",
        id: "pending",
        dispatcher_session: "sessionA",
        workspace: repo,
      }),
      JSON.stringify({ kind: "ended", id: "pending", at: oldEnd }),
      JSON.stringify({
        kind: "started",
        id: "accepted",
        dispatcher_session: "sessionB",
        workspace: repo,
      }),
      JSON.stringify({ kind: "ended", id: "accepted", at: oldEnd }),
      JSON.stringify({ kind: "judged", id: "accepted", decision: "accept" }),
      "",
    ].join("\n"),
  );
  if (!stale) {
    const old = (Temporal.Now.instant().epochMilliseconds - 120_000) / 1000;
    await utimes(join(dir, "records.jsonl"), old, old);
    await utimes(join(dir, "workspace-verdicts.json"), old, old);
    await utimes(join(dir, "doctor.json"), old, old);
  }
  const currentTime = (stale ? now - 120_000 : now) / 1000;
  await utimes(join(dir, "current-runs.json"), currentTime, currentTime);
  return dir;
}

async function run(
  dir: string,
  cwd = repo,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const child = Bun.spawn(["bun", cliPath, "--json", "--cwd", cwd], {
    cwd: repo,
    env: { ...process.env, AGX_NEXT_STATE_DIR: dir },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);
  return { exitCode, stdout, stderr };
}

function parseOutput(text: string) {
  const parsed = jsonOf(outputSchema).safeParse(text);
  expect(parsed.success).toBe(true);
  return parsed.success ? parsed.data : null;
}

test("current fixture folds workspace, findings and judgment state into JSON", async () => {
  const dir = await fixture("current", false);
  const result = await run(dir);
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe("");
  const output = parseOutput(result.stdout);
  expect(output).not.toBeNull();
  if (output === null) return;
  expect(output).toEqual({
    schema: 1,
    runs: {
      source: "current",
      captured_at: snapshotAt,
      age_s: 0,
      reason: null,
      rows: [],
      summary,
    },
    workspaces: {
      total: 3,
      unlanded: 1,
      collectable: 0,
      legacy: 0,
      here: 2,
      fleet_known: true,
      captured_at: snapshotAt,
      stale: false,
    },
    findings: {
      kinds: { blocked: 2 },
      lost: 1,
      captured_at: snapshotAt,
      stale: false,
    },
    judgments: {
      by_session: { sessionA: 1 },
      repository: 1,
      land: 1,
      why: null,
    },
  });
});

test("records newer than current runs mark the run snapshot stale", async () => {
  const result = await run(await fixture("stale", true));
  expect(result.exitCode).toBe(0);
  const output = parseOutput(result.stdout);
  expect(output).not.toBeNull();
  if (output === null) return;
  expect(output.runs.source).toBe("stale");
});

test("missing current snapshot is unknown and reports unavailable repository scope", async () => {
  const result = await run(join(fixtureRoot, "unknown"));
  expect(result.exitCode).toBe(0);
  const output = parseOutput(result.stdout);
  expect(output).not.toBeNull();
  if (output === null) return;
  expect(output).toMatchObject({
    runs: {
      source: "unknown",
      captured_at: null,
      age_s: null,
      reason: "snapshot unavailable",
      rows: null,
      summary: null,
    },
    judgments: { why: "repository scope unavailable; agx worker doctor" },
  });
});

test("CLI leaves the state directory unchanged", async () => {
  const dir = await fixture("readonly", false);
  const before = (await readdir(dir)).toSorted();
  const result = await run(dir);
  const after = (await readdir(dir)).toSorted();
  expect(result.exitCode).toBe(0);
  expect(after).toEqual(before);
});
