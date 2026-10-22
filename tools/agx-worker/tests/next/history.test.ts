import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gradedHistory } from "../../src/next/history.ts";
import { fullFoldedRuns, type NextEvent } from "../../src/next/store.ts";

const priorState = process.env.AGX_STATE_DIR;
let root: string | undefined;
afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true });
  if (priorState === undefined) delete process.env.AGX_STATE_DIR;
  else process.env.AGX_STATE_DIR = priorState;
});

test("audit history can aggregate judgments; unjudged exits do not imply acceptance", async () => {
  root = await mkdtemp(join(tmpdir(), "router-graded-"));
  process.env.AGX_STATE_DIR = root;
  const at = "2026-10-16T00:00:00Z";
  const old = "2026-09-01T00:00:00Z";
  const input: NextEvent[] = [];
  for (const [id, row, time, decision] of [
    ["accepted", "luna-high", at, "accept"],
    ["rejected", "luna-high", old, "reject"],
    ["unjudged", "luna-high", at, undefined],
    ["capacity", "luna-high", at, "reject"],
    ["other-row", "sol-low", at, "reject"],
  ]) {
    if (id === undefined || row === undefined || time === undefined) continue;
    input.push(
      {
        kind: "started",
        id,
        row,
        at: time,
        ticket: id,
        writes: [],
        cwd: root,
        workspace: root,
        dispatcher_session: null,
        vendor_session: null,
        pid: 0,
      },
      {
        kind: "ended",
        id,
        at: time,
        exit: 0,
        outcome: id === "capacity" ? "capacity" : "ok",
        report_path: null,
        vendor_session: null,
        verify: [],
      },
    );
    if (decision !== undefined)
      input.push({ kind: "judged", id, at: time, decision, note: "reviewed" });
    const dir = join(root, "runs", id);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "brief.md"),
      `Proposition ${id === "accepted" ? "SAME" : "OTHER"}: claim\n`,
    );
  }
  await writeFile(
    join(root, "records.jsonl"),
    `${input.map((event) => JSON.stringify(event)).join("\n")}\n`,
  );
  const history = await gradedHistory(
    await fullFoldedRuns(),
    "Proposition SAME: revised claim",
    Temporal.Instant.from(at).epochMilliseconds,
  );
  expect(history("luna-high")).toEqual({
    here: { accepted: 1, partial: 0, rejected: 1 },
    recent: { accepted: 1, partial: 0, rejected: 0 },
    comparable: { accepted: 1, partial: 0, rejected: 0 },
  });
  expect(history("sol-low").here.rejected).toBe(1);
  expect(history("unused")).toEqual({
    here: { accepted: 0, partial: 0, rejected: 0 },
    recent: { accepted: 0, partial: 0, rejected: 0 },
  });
});
