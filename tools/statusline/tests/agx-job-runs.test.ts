import { test, expect } from "bun:test";
import { ok, err } from "neverthrow";
import { render } from "../src/format.ts";
import type { Dataframe } from "../src/dataframe.ts";
import { readAgxJobRuns } from "../src/agx-job-runs.ts";
import { buildDataframe } from "../src/build-dataframe.ts";
import { mkdtemp, writeFile, chmod } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ownerSources } from "../src/owner-state.ts";

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
test("live agx jobs survive a process scan timeout and count other sessions", () => {
  const rows = ["one", "two", "three", "four", "five"].map((ticket, i) => ({
    id: ticket,
    ticket,
    dispatcher_session: i < 3 ? "session" : "other",
    elapsed_seconds: 42,
  }));
  const output = render({ ...base, liveAgxJobs: ok(rows) });
  for (const ticket of ["one", "two", "three"])
    expect(output).toContain(`${ticket} 0m42s`);
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
    [1_000, "one 0m42s"],
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
      expect(output).toContain(`${ticket} 0m42s`);
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
