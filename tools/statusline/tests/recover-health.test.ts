import { ok } from "neverthrow";
import { describe, expect, test } from "bun:test";
import type { Dataframe } from "../src/dataframe.ts";
import { render } from "../src/format.ts";
import { recoverJournalFailure } from "../src/recover-health.ts";

const unit = "wsl-capacity-recover.service";
const line = (time: string, message: string) =>
  `${time} R99 bun[17]: ${message}`;
const fatal = line(
  "2026-10-15T15:57:15+09:00",
  "FATAL: Error: TMPFS_RECLAIM_PERCENT must be an integer from 1 to 84",
);
const timedOut = line(
  "2026-10-15T20:30:10+09:00",
  'TMPFS_RECLAIM exit=143 timeout=true before_inodes=1039505/1048576 after_inodes=1039505/1048576 before_bytes=16.4GiB/27.5GiB after_bytes=16.4GiB/27.5GiB reclaimed_inodes=0 reclaimed_bytes=0.0GiB detail=""',
);
const zeroAtWarn = (time: string) =>
  line(
    time,
    'TMPFS_RECLAIM exit=0 timeout=false before_inodes=900/1000 after_inodes=900/1000 before_bytes=9.0GiB/20.0GiB after_bytes=9.0GiB/20.0GiB reclaimed_inodes=0 reclaimed_bytes=0.0GiB detail=""',
  );

const frame: Dataframe = {
  cwd: "/repo",
  model: "Sonnet",
  wfOn: false,
  rc: "off",
  rlModel: [],
  jobs: [],
  orphans: 0,
  vram: undefined,
  disks: ok([]),
  cpuPct: ok(10),
  ram: ok({ frac: "1/8G", pct: 12.5 }),
};

describe("recover health", () => {
  test("reports a fatal or reclaim timeout from the latest run", () => {
    expect(
      recoverJournalFailure(
        unit,
        `${line("t", `Starting ${unit}...`)}\n${fatal}`,
      ),
    ).toMatchObject({
      unit,
      reason: "FATAL",
      line: fatal,
    });
    expect(
      recoverJournalFailure(
        unit,
        `${line("t", `Starting ${unit}...`)}\n${timedOut}`,
      ),
    ).toMatchObject({
      unit,
      reason: "reclaim timed out",
      line: timedOut,
    });
  });

  test("reports a non-zero unit exit from the latest run", () => {
    const failed = line(
      "2026-10-15T20:38:00+09:00",
      "Failed with result 'exit-code'.",
    );
    expect(
      recoverJournalFailure(
        unit,
        `${line("t", `Starting ${unit}...`)}\n${failed}`,
      ),
    ).toMatchObject({
      unit,
      reason: "unit exited non-zero",
      line: failed,
    });
  });

  test("a later healthy HOLD clears an earlier fatal", () => {
    const healthy = line(
      "2026-10-15T15:58:15+09:00",
      "TMPFS HOLD inodes=799028/1048576 (76.2%) bytes=18.5GiB/27.5GiB (67.3%) threshold=80%",
    );
    const journal = [
      line("t1", `Starting ${unit}...`),
      fatal,
      line("t2", `Starting ${unit}...`),
      healthy,
    ].join("\n");
    expect(recoverJournalFailure(unit, journal)).toBeUndefined();
  });

  test("requires consecutive zero-progress reclaim runs under pressure", () => {
    const firstRun = `${line("t1", `Starting ${unit}...`)}\n${zeroAtWarn("t1")}`;
    expect(recoverJournalFailure(unit, firstRun)).toBeUndefined();
    const secondRun = `${line("t2", `Starting ${unit}...`)}\n${zeroAtWarn("t2")}`;
    expect(
      recoverJournalFailure(unit, `${firstRun}\n${secondRun}`),
    ).toMatchObject({
      reason:
        "two consecutive reclaim runs made no progress under the warn line",
      line: zeroAtWarn("t2"),
    });
    const lowPressure = zeroAtWarn("t3").replace(
      "before_inodes=900/1000",
      "before_inodes=100/1000",
    );
    expect(
      recoverJournalFailure(
        unit,
        `${firstRun}\n${line("t3", `Starting ${unit}...`)}\n${lowPressure}`,
      ),
    ).toBeUndefined();
  });

  test("renders a current failure as a red segment and omits a healthy run", () => {
    const bad = recoverJournalFailure(
      unit,
      `${line("t", `Starting ${unit}...`)}\n${fatal}`,
      {
        at: Temporal.Now.instant().epochMilliseconds,
      },
    );
    const badOutput = render({ ...frame, recoverHealth: bad });
    expect(badOutput).not.toContain(
      "\u001B[38;5;167mRecover: wsl FATAL\u001B[0m",
    );
    expect(render({ ...frame, recoverHealth: undefined })).not.toContain(
      "Recover:",
    );
  });
});
