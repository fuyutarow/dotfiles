import { expect, test } from "bun:test";
import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../shared/src/zod.ts";
import { publishCurrentRuns } from "../../agx-worker/src/next/store.ts";

// agx-status reads only what agx-worker publishes; the pre-publication full-replay status
// (tests/oracle/status-full-replay.ts) must answer the same JSON for the same state.
const cliPath = join(import.meta.dir, "../src/status.ts");
const oraclePath = join(import.meta.dir, "oracle/status-full-replay.ts");
const minute = 60_000;
const hour = 60 * minute;
const now = Temporal.Now.instant().epochMilliseconds;
const at = (ago: number): string =>
  Temporal.Instant.fromEpochMilliseconds(now - ago).toString();
const deadPid = 999_999_999;

let seed = 20261023;
const random = (): number => {
  seed = Math.trunc((seed + 0x6d2b79f5) % 0x1_0000_0000);
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(items: readonly [T, ...T[]]): T =>
  items[Math.trunc(random() * items.length)] ?? items[0];

type Line = Record<string, unknown>;
const started = (
  id: string,
  ago: number,
  workspace: string,
  session: string | null,
  pid = deadPid,
): Line => ({
  kind: "started",
  id,
  at: at(ago),
  ticket: `t-${id}`,
  writes: [],
  cwd: workspace,
  workspace,
  row: "luna-high",
  dispatcher_session: session,
  vendor_session: null,
  pid,
});
const ended = (id: string, ago: number, time = at(ago)): Line => ({
  kind: "ended",
  id,
  at: time,
  exit: 0,
  report_path: null,
  vendor_session: null,
  verify: [],
});
const judged = (id: string, ago: number, decision: string): Line => ({
  kind: "judged",
  id,
  at: at(ago),
  decision,
  note: "",
});

const output = z.looseObject({
  runs: z.looseObject({ source: z.string() }),
  judgments: z.object({
    by_session: z.record(z.string(), z.number()),
    repository: z.number(),
    land: z.number(),
    why: z.string().nullable(),
  }),
});

const verdict = (path: string, state: string) => `${path}\tready\t${state}`;

async function status(
  cli: string,
  dir: string,
  cwd: string,
): Promise<{ stdout: string; exitCode: number }> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    AGX_STATE_DIR: dir,
  };
  delete env.AGX_NEXT_STATE_DIR;
  const child = Bun.spawn(["bun", cli, "--json", "--cwd", cwd], {
    cwd,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, exitCode] = await Promise.all([
    child.stdout.text(),
    child.exited,
  ]);
  return { stdout, exitCode };
}

async function generated() {
  const root = await mkdtemp(join(tmpdir(), "agx-status-equality-"));
  const dir = join(root, "state");
  const repo = join(root, "repo");
  const sibling = join(`${repo}.ws`);
  const dirs = {
    here: join(sibling, "ws_here"),
    second: join(sibling, "ws_second"),
    landed: join(sibling, "ws_landed"),
    outside: join(root, "elsewhere", "ws_member"),
    foreign: join(root, "foreign", "ws_other"),
  };
  await Promise.all(
    [dir, repo, ...Object.values(dirs)].map((path) =>
      mkdir(path, { recursive: true }),
    ),
  );
  const sessions = ["sA", "sB", "sC", "__proto__", null] as const;
  const workspaces: [string, ...string[]] = [
    repo,
    ...Object.values(dirs),
    repo,
    join(sibling, "ws_gone_a"),
    join(sibling, "ws_gone_b"),
  ];
  const lines: Line[] = [];
  const small = (): number => 1 + Math.floor(random() * 3 * hour);
  for (let index = 0; index < 3200; index++) {
    const id = `run-${index}`;
    let endedAgo = Math.floor(random() * 72 * hour);
    // Stay clear of the 24 h edge: status and oracle read at slightly different instants.
    if (Math.abs(endedAgo - 24 * hour) < 3 * minute) endedAgo += 10 * minute;
    const workspace = pick(workspaces);
    lines.push(
      started(id, endedAgo + small(), workspace, pick(sessions)),
      ended(id, endedAgo),
    );
    const roll = random();
    if (roll < 0.35)
      lines.push(judged(id, Math.max(0, endedAgo - 5 * minute), "accept"));
    else if (roll < 0.5)
      lines.push(judged(id, Math.max(0, endedAgo - 5 * minute), "reject"));
    else if (roll < 0.55) {
      lines.push(
        judged(id, Math.max(0, endedAgo - 2 * minute), "reject"),
        judged(id, Math.max(0, endedAgo - 1 * minute), "accept"),
      );
    }
  }
  // Boundary cases from the profile.
  const edge = [
    // Started long before the window, ended inside it.
    [started("cross-in", 30 * hour, dirs.here, "sA"), ended("cross-in", hour)],
    // Started and ended before the window, accepted: still a land candidate.
    [
      started("cross-out", 30 * hour, dirs.second, "sB"),
      ended("cross-out", 25 * hour),
      judged("cross-out", 24 * hour, "accept"),
    ],
    [
      started("in-edge", 23 * hour + 50 * minute, dirs.here, "sA"),
      ended("in-edge", 23 * hour + 58 * minute),
    ],
    [
      started("out-edge", 25 * hour, dirs.here, "sA"),
      ended("out-edge", 24 * hour + 2 * minute),
    ],
    // Not yet happened: outside `<= now`, but still a land candidate once accepted.
    [
      started("future", 2 * minute, dirs.here, "sB"),
      ended("future", -hour),
      judged("future", 0, "accept"),
    ],
    [
      started("future-open", 2 * minute, dirs.second, "sC"),
      ended("future-open", -hour),
    ],
    [
      started("bad-time", hour, dirs.here, "sA"),
      ended("bad-time", 0, "not-a-time"),
    ],
    // Judgment before the run exists, or for a run that never existed.
    [
      judged("early", 0, "accept"),
      started("early", hour, dirs.here, "sA"),
      ended("early", 30 * minute),
    ],
    [ended("ghost", minute), judged("ghost", 0, "accept")],
    // Restart resets the judgment; a later ended overwrites the end time.
    [
      started("restart", 5 * hour, dirs.here, "sA"),
      ended("restart", 4 * hour),
      judged("restart", 3 * hour, "accept"),
      started("restart", 2 * hour, dirs.second, "sB", process.pid),
    ],
    [
      started("twice", 5 * hour, dirs.here, "sA"),
      ended("twice", 4 * hour),
      ended("twice", 2 * hour),
    ],
    // Judged while running, ended afterwards; latest valid decision wins; unknown decision.
    [
      started("judged-open", 3 * hour, dirs.here, "sC"),
      judged("judged-open", 2 * hour, "reject"),
      ended("judged-open", hour),
      judged("judged-open", 30 * minute, "accept"),
    ],
    [
      started("accept-then-reject", 6 * hour, dirs.second, "sA"),
      ended("accept-then-reject", 5 * hour),
      judged("accept-then-reject", 4 * hour, "accept"),
      judged("accept-then-reject", 3 * hour, "reject"),
    ],
    // Landed workspace (verdict says landed) and a workspace that no longer exists.
    [
      started("landed-ws", 5 * hour, dirs.landed, "sB"),
      ended("landed-ws", 4 * hour),
      judged("landed-ws", 3 * hour, "accept"),
    ],
    [
      started("gone-ws", 5 * hour, join(sibling, "ws_gone_c"), "sB"),
      ended("gone-ws", 4 * hour),
      judged("gone-ws", 3 * hour, "accept"),
    ],
    // Running and lost runs carry no ended_at.
    [started("running", hour, dirs.here, "sA", process.pid)],
    [started("lost", hour, dirs.here, "sA")],
    [
      started("member", 2 * hour, dirs.outside, "sC"),
      ended("member", hour),
      started("member-accepted", 2 * hour, dirs.outside, null),
      ended("member-accepted", hour),
      judged("member-accepted", 30 * minute, "accept"),
    ],
  ];
  for (const group of edge) lines.push(...group);
  await writeFile(
    join(dir, "records.jsonl"),
    `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`,
  );
  const counts = { total: 5, unlanded: 3, collectable: 0, legacy: 0 };
  await writeFile(
    join(dir, "workspace-verdicts.json"),
    JSON.stringify({
      counts,
      capturedAt: now,
      complete: true,
      fleetComplete: true,
      repos: {
        [repo]: {
          counts,
          capturedAt: now,
          lines: [
            verdict(dirs.here, "unlanded"),
            verdict(dirs.second, "unlanded"),
            verdict(dirs.landed, "landed"),
            verdict(dirs.outside, "unlanded"),
          ],
        },
      },
    }),
  );
  return { root, dir, repo, lines: lines.length };
}

test("published facts answer the same JSON as the full-replay oracle", async () => {
  const { dir, repo, lines } = await generated();
  expect(lines).toBeGreaterThan(8000);
  await publishCurrentRuns(dir);
  const old = Temporal.Now.instant().epochMilliseconds - 5000;
  await utimes(join(dir, "records.jsonl"), old / 1000, old / 1000);

  const oracle = await status(oraclePath, dir, repo);
  const published = await status(cliPath, dir, repo);
  expect(oracle.exitCode).toBe(0);
  expect(published.exitCode).toBe(0);
  const expected = jsonOf(output).safeParse(oracle.stdout);
  const actual = jsonOf(output).safeParse(published.stdout);
  expect(expected.success && actual.success).toBe(true);
  if (!expected.success || !actual.success) return;
  expect(actual.data).toEqual(expected.data);
  expect(actual.data.runs.source).toBe("current");
  expect(actual.data.judgments.why).toBeNull();
  // The history must exercise every judgment path, not agree on zeros.
  expect(actual.data.judgments.repository).toBeGreaterThan(20);
  expect(actual.data.judgments.land).toBeGreaterThan(20);
  expect(
    Object.keys(actual.data.judgments.by_session).length,
  ).toBeGreaterThanOrEqual(3);
  expect(published.stdout).toContain('"__proto__"');
  // A second answer after the log becomes unreadable proves records.jsonl is never opened.
  await writeFile(join(dir, "records.jsonl"), "not json\n");
  await utimes(join(dir, "records.jsonl"), old / 1000, old / 1000);
  const blind = await status(cliPath, dir, repo);
  expect(jsonOf(output).safeParse(blind.stdout)).toEqual({
    success: true,
    data: expected.data,
  });
}, 120_000);

test("a snapshot without ended-run facts reports them unpublished", async () => {
  const { dir, repo } = await generated();
  await writeFile(
    join(dir, "current-runs.json"),
    JSON.stringify({
      output: JSON.stringify({
        runs: [],
        summary: {
          running: 0,
          unattributed: 0,
          sessions: {},
          noSession: { here: 0, other: 0 },
        },
      }),
      capturedAt: now,
      exit: 0,
    }),
  );
  const result = await status(cliPath, dir, repo);
  const parsed = jsonOf(output).safeParse(result.stdout);
  expect(parsed.success).toBe(true);
  if (!parsed.success) return;
  expect(parsed.data.judgments).toEqual({
    by_session: {},
    repository: 0,
    land: 0,
    why: "judgment facts unpublished; agx worker doctor",
  });
});
