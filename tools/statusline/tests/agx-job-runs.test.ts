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
test("agx timeout is explicit", () => {
  expect(render({ ...base, liveAgxJobs: err("timeout 2000ms") })).toContain(
    "agx n/a (timeout 2000ms)",
  );
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
    const timeout = await readAgxJobRuns();
    expect(render({ ...base, liveAgxJobs: timeout })).toContain(
      "agx n/a (timeout 2000ms)",
    );
  })().finally(() => {
    if (originalPath === undefined) delete process.env["PATH"];
    else process.env["PATH"] = originalPath;
    rmSync(dir, { recursive: true, force: true });
  });
}, 10000);
