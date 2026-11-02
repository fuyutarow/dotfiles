import { test, expect } from "bun:test";
import { ok, err } from "neverthrow";
import { render } from "../src/format.ts";
import type { Dataframe } from "../src/dataframe.ts";
import { readAgxJobRuns, Rows } from "../src/agx-job-runs.ts";
import { buildDataframe } from "../src/build-dataframe.ts";
import { mkdtemp, writeFile, chmod } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ownerSources } from "../src/owner-state.ts";
import { dur } from "../src/jobs.ts";

const base: Dataframe = {
  cwd: "/tmp",
  sid: "session",
  model: "test",
  wfOn: false,
  rc: "off",
  rlModel: [],
  jobs: [],
  orphans: 0,
  jobScanWhy: "ps timeout",
  cpuPct: ok(1),
  ram: err("unknown"),
  vram: undefined,
  disks: ok([]),
};
const liveRow = (
  ticket: string,
  dispatcher_session: string,
  started_at: string,
) => ({
  id: ticket,
  ticket,
  dispatcher_session,
  started_at,
  elapsed_seconds: 0,
  row: "sol-high",
  worker_name: `agt_${ticket}`,
  workspace_name: `ws_${ticket}`,
  phase: "working",
  progress: {
    last: "$ test",
    at: null,
    commands: 3,
    files: 2,
    cost_usd: 0.12,
    session: null,
  },
});
test("live rows render the session's workers with their complete activity", () => {
  const nowMs = Temporal.Instant.from(
    "2026-10-31T12:01:10.289Z",
  ).epochMilliseconds;
  const parsed = Rows.safeParse([
    liveRow("first", "session", "2026-10-31T12:00:00Z"),
    liveRow("second", "session", "2026-10-31T12:00:30Z"),
    liveRow("other", "other", "2026-10-31T12:00:00Z"),
  ]);
  expect(parsed.success).toBe(true);
  if (!parsed.success) return;
  const output = render({ ...base, liveAgxJobs: ok(parsed.data) }, { nowMs });
  const plain = output.replaceAll(
    new RegExp(`${String.fromCodePoint(27)}\\[[0-9;]*m`, "gu"),
    "",
  );
  const lines = plain.split("\n").filter((line) => line.startsWith("sol-high"));
  expect(lines).toHaveLength(2);
  expect(lines[0]).toMatch(
    /sol-high\s+1m10s\s+\$0\.12\s+agt_first@ws_first\s+tkt_first\s+│ working · \$ test · 3 cmd · 2 files/u,
  );
  expect(lines[1]).toMatch(
    /sol-high\s+0m40s\s+\$0\.12\s+agt_second@ws_second\s+tkt_second\s+│ working · \$ test · 3 cmd · 2 files/u,
  );
  expect(plain).not.toContain("tkt_other");
  expect(plain).toContain("+1 workers outside session");
  expect(plain.split("\n").find((line) => line.includes("Job:"))).not.toContain(
    "first",
  );
  expect(dur(70.289)).toBe("1m10s");
});
test("live agx jobs survive a process scan timeout and count other sessions", () => {
  const rows = ["one", "two", "three", "four", "five"].map((ticket, i) => ({
    id: ticket,
    ticket,
    dispatcher_session: i < 3 ? "session" : "other",
    elapsed_seconds: 42,
  }));
  const output = render({ ...base, liveAgxJobs: ok(rows) });
  for (const ticket of ["one", "two", "three"])
    expect(output).toContain(`tkt_${ticket}`);
  expect(output).toContain("+2 workers outside session");
});
test("unknown agx precedes unrelated process jobs", () => {
  const line =
    render({
      ...base,
      jobs: [{ name: "unrelated", secs: 5 }],
      jobScanWhy: undefined,
      liveAgxJobs: err("sampler unavailable"),
    })
      .split("\n")
      .find((value) => value.includes("agx ?")) ?? "";
  expect(line.indexOf("agx ? (sampler unavailable)")).toBeLessThan(
    line.indexOf("unrelated"),
  );
});

test("owner retains usable rows with their age and expires them after ten minutes", async () => {
  const rows = [
    {
      id: "one",
      ticket: "one",
      dispatcher_session: "session",
      elapsed_seconds: 42,
    },
  ];
  const now = Temporal.Now.instant().epochMilliseconds;
  for (const [age, expected] of [
    [1_000, "0m43s"],
    [42_000, "1 agx (42s old)"],
    [601_000, "agx ? (timeout 30000ms)"],
  ] as const) {
    const snapshot = {
      schema: 1 as const,
      fields: {
        liveAgxJobs: {
          at: now - age,
          value: { value: rows },
          error: "timeout 30000ms",
        },
      },
    };
    const result = await ownerSources(Promise.resolve(snapshot)).liveAgxJobs();
    const output = render({
      ...base,
      liveAgxJobs: result,
      ownerAges: { liveAgxJobs: age },
    });
    expect(output).toContain(expected);
  }
  expect(
    (await ownerSources(Promise.resolve(undefined)).liveAgxJobs())?.isErr(),
  ).toBe(true);
});

test("run age advances independently of cache age", () => {
  const nowMs = Temporal.Instant.from("2026-10-31T12:00:40Z").epochMilliseconds;
  const row = {
    id: "one",
    ticket: "one",
    dispatcher_session: "session",
    elapsed_seconds: 20,
    started_at: "2026-10-31T12:00:00Z",
  };
  const parsed = Rows.safeParse([row]);
  expect(parsed.success && parsed.data[0]?.started_at).toBe(row.started_at);
  const frame = {
    ...base,
    liveAgxJobs: ok([row]),
    ownerAges: { liveAgxJobs: 20_000 },
  };
  expect(render(frame, { nowMs })).toContain("0m40s");
  expect(
    render(
      { ...frame, liveAgxJobs: ok([{ ...row, started_at: undefined }]) },
      { nowMs },
    ),
  ).toContain("0m40s");
  expect(
    render({ ...frame, ownerAges: { liveAgxJobs: 42_000 } }, { nowMs }),
  ).toContain("1 agx (42s old)");
});

test("fake agx executable supplies live jobs independently of ps and times out", async () => {
  const dir = await mkdtemp(join(tmpdir(), "statusline-agx-"));
  const path = join(dir, "agx");
  const originalPath = process.env["PATH"];
  const rows = ["one", "two", "three", "four", "five"].map((ticket, i) => ({
    id: ticket,
    ticket,
    dispatcher_session: i < 3 ? "session" : "other",
    elapsed_seconds: 42,
  }));
  await (async () => {
    await writeFile(
      path,
      `#!/bin/sh\nprintf '%s\\n' '${JSON.stringify(rows)}'\n`,
    );
    await chmod(path, 0o755);
    process.env["PATH"] = `${dir}:${originalPath ?? ""}`;
    const frame = await buildDataframe(
      { cwd: "/tmp", sessionId: "session" },
      {
        sources: {
          liveAgxJobs: readAgxJobRuns,
          jobScan: () =>
            Promise.resolve({ jobs: [], orphans: 0, failed: "ps timeout" }),
        },
      },
    );
    const output = render(frame);
    expect(frame.liveAgxJobs?.isOk()).toBe(true);
    expect(frame.liveAgxJobs?.unwrapOr([])).toHaveLength(5);
    for (const ticket of ["one", "two", "three"])
      expect(output).toContain(`tkt_${ticket}`);
    expect(output).toContain("+2 workers outside session");
    await writeFile(path, "#!/bin/sh\nexec /bin/sleep 3\n");
    const timeout = await readAgxJobRuns(50);
    expect(render({ ...base, liveAgxJobs: timeout })).toContain(
      "agx ? (timeout 50ms)",
    );
  })().finally(() => {
    if (originalPath === undefined) delete process.env["PATH"];
    else process.env["PATH"] = originalPath;
    rmSync(dir, { recursive: true, force: true });
  });
}, 10000);
