import { afterAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  claimWriteLease,
  listWriteLeases,
  type LeaseEvidence,
} from "../src/write-leases.ts";

const scratch = mkdtempSync(join(tmpdir(), "agx-write-leases-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function lease(runId: string, cwd: string): void {
  const repoHash = createHash("sha256").update("/repo").digest("hex");
  const runHash = createHash("sha256").update(runId).digest("hex");
  const dir = join(scratch, "write-leases", repoHash);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${runHash}.json`),
    JSON.stringify({
      repo: "/repo",
      run_id: runId,
      cwd,
      writes: [`src/${runId}.ts`],
      ticket: runId,
      dispatcher_session: "fixture-session",
      since: "2026-10-12T00:00:00Z",
    }),
  );
}

function prune(evidence: LeaseEvidence[], active: string[] = []) {
  return listWriteLeases({
    stateDir: scratch,
    repo: "/repo",
    activeRunIds: new Set(active),
    evidence,
  });
}

test("terminal judgement and clean terminal outcomes release leases", () => {
  const cwd = join(scratch, "workspace");
  mkdirSync(cwd, { recursive: true });
  const gone = join(scratch, "gone");
  const runIds = [
    "accepted",
    "rejected",
    "landed",
    "abandoned",
    "unchanged",
    "missing-workspace",
  ];
  for (const runId of runIds)
    lease(runId, runId === "missing-workspace" ? gone : cwd);
  const result = prune(
    [
      { kind: "acceptance", run_id: "accepted", accept: true },
      { kind: "acceptance", run_id: "rejected", accept: false },
      { kind: "landed", run_id: "landed" },
      { kind: "abandoned", run_id: "abandoned" },
      { kind: "run", run_id: "unchanged", cwd, facts: { changed_files: [] } },
      {
        kind: "run",
        run_id: "missing-workspace",
        cwd: gone,
        facts: { changed_files: ["src/a.ts"] },
      },
    ],
    runIds,
  );
  expect(result).toEqual({ ok: true, value: [] });
});

test("only live and changed unjudged terminal runs retain leases; history is never backfilled", () => {
  const cwd = join(scratch, "workspace-live");
  mkdirSync(cwd, { recursive: true });
  const leaseIds = ["live", "unjudged", "absent-history"];
  for (const runId of leaseIds) lease(runId, cwd);
  const result = prune(
    [
      {
        kind: "run",
        run_id: "unjudged",
        cwd,
        facts: { changed_files: ["src/a.ts"] },
      },
    ],
    ["live"],
  );
  expect(result.ok).toBe(true);
  if (result.ok)
    expect(result.value.map((entry) => entry.run_id).toSorted()).toEqual([
      "live",
      "unjudged",
    ]);

  const noBackfill = listWriteLeases({
    stateDir: join(scratch, "fresh-state"),
    repo: "/repo",
    activeRunIds: new Set(),
    evidence: [
      {
        kind: "run",
        run_id: "old",
        cwd,
        facts: { changed_files: ["src/a.ts"] },
      },
    ],
  });
  expect(noBackfill).toEqual({ ok: true, value: [] });

  lease("live-missing-workspace", join(scratch, "gone-live"));
  expect(prune([], ["live-missing-workspace"])).toEqual({
    ok: true,
    value: [],
  });
});

test("admission claims overlapping writes and ignores unleased historical runs", () => {
  const stateDir = join(scratch, "claim-state");
  const cwd = scratch;
  const first = claimWriteLease({
    stateDir,
    repo: "/repo-claim",
    run_id: "first",
    cwd,
    writes: ["tools/agx/**"],
    ticket: "first",
    dispatcher_session: "fixture-session",
    since: "2026-10-12T00:00:00Z",
    activeRunIds: new Set(),
    evidence: [],
  });
  expect(first.ok).toBe(true);
  const overlap = claimWriteLease({
    stateDir,
    repo: "/repo-claim",
    run_id: "second",
    cwd,
    writes: ["tools/agx/src/**"],
    ticket: "second",
    dispatcher_session: "other-session",
    since: "2026-10-12T00:01:00Z",
    activeRunIds: new Set(["first"]),
    evidence: [],
  });
  expect(overlap.ok).toBe(false);
  if (!overlap.ok) expect(overlap.error).toContain("run first");

  const noBackfill = claimWriteLease({
    stateDir: join(scratch, "claim-no-history"),
    repo: "/repo-claim",
    run_id: "new-after-history",
    cwd,
    writes: ["tools/agx/**"],
    ticket: "new",
    dispatcher_session: "new-session",
    since: "2026-10-12T00:02:00Z",
    activeRunIds: new Set(),
    evidence: [
      {
        kind: "run",
        run_id: "old-history-only",
        cwd,
        ticket: { writes: ["tools/agx/**"] },
        facts: { changed_files: ["tools/agx/src/agx.ts"] },
      },
    ],
  });
  expect(noBackfill.ok).toBe(true);
});

test("a detached admission remains leased until its child records started", () => {
  const cwd = join(scratch, "detached-cwd");
  mkdirSync(cwd, { recursive: true });
  lease("detached-pending", cwd);
  const pendingAt = Temporal.Now.instant().toString();
  const pending = prune([
    { kind: "detached", run_id: "detached-pending", at: pendingAt },
  ]);
  expect(pending.ok).toBe(true);
  if (pending.ok)
    expect(pending.value.map((entry) => entry.run_id)).toContain(
      "detached-pending",
    );

  const started = prune(
    [
      { kind: "detached", run_id: "detached-pending", at: pendingAt },
      { kind: "started", run_id: "detached-pending" },
    ],
    ["detached-pending"],
  );
  expect(started.ok).toBe(true);
  if (started.ok)
    expect(started.value.map((entry) => entry.run_id)).toContain(
      "detached-pending",
    );

  lease("abandoned-detached-pending", cwd);
  const oldPending = prune([
    {
      kind: "detached",
      run_id: "abandoned-detached-pending",
      at: Temporal.Now.instant().subtract({ minutes: 16 }).toString(),
    },
  ]);
  expect(oldPending.ok).toBe(true);
  if (oldPending.ok)
    expect(oldPending.value.map((entry) => entry.run_id)).not.toContain(
      "abandoned-detached-pending",
    );
});
