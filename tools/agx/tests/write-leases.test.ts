import { afterAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  existsSync,
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  claimWriteLease,
  listWriteLeases,
  readLeaseEvidence,
  reconcileWriteLeases,
  releaseWriteLease,
  workspaceChanges,
  type LeaseEvidence,
} from "../src/write-leases.ts";

const scratch = mkdtempSync(join(tmpdir(), "agx-write-leases-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function context(name: string) {
  const stateDir = join(scratch, name);
  const cwd = join(scratch, `${name}-workspace`);
  mkdirSync(cwd, { recursive: true });
  mkdirSync(join(cwd, ".jj"));
  return {
    stateDir,
    cwd,
    repo: "/repo",
    activeRunIds: new Set<string>(),
    workspaceChanges: () => ({ changed: false }),
  };
}
function row(run_id: string, cwd: string, name = run_id): LeaseEvidence {
  return {
    kind: "admitted",
    lease_version: 1,
    run_id,
    cwd,
    repo: "/repo",
    ticket: { name, writes: ["src/**"] },
    facts: { changed_files: ["src/old.ts"] },
  };
}

test("four admissions after a slow router do not time out on disjoint leases", async () => {
  const input = context("slow-router-race");
  const admissions = await Promise.all(
    Array.from({ length: 4 }, async (_, index) => {
      await Bun.sleep(100);
      const cwd = join(scratch, `slow-router-workspace-${index}`);
      mkdirSync(join(cwd, ".jj"), { recursive: true });
      return claimWriteLease({
        ...input,
        run_id: `slow-${index}`,
        cwd,
        writes: [`tools/part-${index}/**`],
        ticket: `slow-${index}`,
        dispatcher_session: "test-session",
        since: Temporal.Now.instant().toString(),
        evidence: [],
        workspaceChanges: () => ({ changed: false }),
      });
    }),
  );
  expect(admissions.every((result) => result.ok)).toBe(true);

  const overlap = claimWriteLease({
    ...input,
    run_id: "overlap",
    cwd: join(scratch, "slow-router-workspace-overlap"),
    writes: ["tools/part-2/file.ts"],
    ticket: "overlap",
    dispatcher_session: "test-session",
    since: Temporal.Now.instant().toString(),
    evidence: [],
    workspaceChanges: () => ({ changed: false }),
  });
  expect(overlap.ok).toBe(false);
  if (!overlap.ok) expect(overlap.error).toContain("held by run slow-2");
});

test("lock timeout names its live holder and uses a distinct exit code", () => {
  const input = context("lock-timeout");
  const dir = join(input.stateDir, "write-leases", hash(input.repo));
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, ".lock"),
    JSON.stringify({
      pid: process.pid,
      run_id: "holder-run",
      ticket: "holder-ticket",
      since: Temporal.Now.instant().subtract({ seconds: 8 }).toString(),
    }),
  );
  const result = claimWriteLease({
    ...input,
    run_id: "waiter",
    cwd: input.cwd,
    writes: ["tools/new/**"],
    ticket: "waiter-ticket",
    dispatcher_session: "test-session",
    since: Temporal.Now.instant().toString(),
    evidence: [],
    lockWaitMs: 40,
  });
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.exitCode).toBe(75);
    expect(result.error).toContain("pid ");
    expect(result.error).toContain("run holder-run");
    expect(result.error).toContain("ticket holder-ticket");
    expect(result.error).toContain("held 8s");
  }
});

test("a lock held by a dead pid is reclaimed for admission", () => {
  const input = context("stale-lock");
  const dir = join(input.stateDir, "write-leases", hash(input.repo));
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, ".lock"),
    JSON.stringify({
      pid: 2_147_483_647,
      run_id: "dead-run",
      ticket: "dead-ticket",
      since: Temporal.Now.instant().toString(),
    }),
  );
  const result = claimWriteLease({
    ...input,
    run_id: "new-after-stale",
    cwd: input.cwd,
    writes: ["tools/new/**"],
    ticket: "new-after-stale",
    dispatcher_session: "test-session",
    since: Temporal.Now.instant().toString(),
    evidence: [],
    lockWaitMs: 100,
  });
  expect(result.ok).toBe(true);
  expect(existsSync(join(dir, ".lock"))).toBe(false);
});

test("live OR unjudged unlanded changes: live holds even after judgment or workspace removal", () => {
  const input = context("formula");
  const evidence = [
    row("accepted", input.cwd),
    { kind: "acceptance", run_id: "accepted", accept: true },
    row("rejected", input.cwd),
    { kind: "acceptance", run_id: "rejected", accept: false },
    row("clean", input.cwd),
    row("gone", join(scratch, "gone")),
  ];
  const result = listWriteLeases({
    ...input,
    evidence,
    activeRunIds: new Set(["accepted", "gone"]),
  });
  expect(result.ok).toBe(true);
  if (result.ok)
    expect(result.value.map((l) => l.run_id).toSorted()).toEqual([
      "accepted",
      "gone",
    ]);
  expect(existsSync(input.stateDir)).toBe(false);
});

test("80 finished holders and one live: historical file changes are not current changes", () => {
  const input = context("firedancer-80");
  const evidence = Array.from({ length: 79 }, (_, i) =>
    row(`finished-${i}`, input.cwd),
  );
  evidence.push({ ...row("v1repair-3yjmw5", input.cwd), pid: process.pid });
  const result = listWriteLeases({
    ...input,
    evidence,
    activeRunIds: new Set(["v1repair-3yjmw5"]),
  });
  expect(result.ok).toBe(true);
  if (result.ok)
    expect(result.value.map((l) => l.run_id)).toEqual(["v1repair-3yjmw5"]);
});

test("cache alone is not evidence; foreground and detached live runs are reconstructed without cache", () => {
  const input = context("cache");
  const dir = join(input.stateDir, "write-leases", hash(input.repo));
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "ghost.json"),
    JSON.stringify({
      repo: input.repo,
      run_id: "ghost",
      cwd: input.cwd,
      ticket: "ghost",
      writes: ["src/**"],
      dispatcher_session: "old",
      since: "2026-10-12T00:00:00Z",
    }),
  );
  const before = readdirSync(dir);
  const result = listWriteLeases({
    ...input,
    evidence: [
      { ...row("leasefold", input.cwd), pid: process.pid },
      row("routepipe", input.cwd),
      { ...row("routepipe", input.cwd), kind: "detached", unit: "test-unit" },
    ],
    unitAlive: () => true,
  });
  expect(result.ok).toBe(true);
  if (result.ok)
    expect(result.value.map((l) => l.run_id).toSorted()).toEqual([
      "leasefold",
      "routepipe",
    ]);
  expect(readdirSync(dir)).toEqual(before);
  expect(existsSync(join(dir, ".lock"))).toBe(false);
});

test("externally stopped detached amend is recorded abandoned once by GC and admission", () => {
  for (const method of ["gc", "admission"]) {
    const input = context(`chainacc-${method}`);
    const id = "2026-10-12T22-54-10.995700277Z-2964755-1nzley";
    const evidence = [
      row(id, input.cwd, "chainacc"),
      {
        ...row(id, input.cwd, "chainacc"),
        kind: "detached",
        unit: "agx-chainacc-gone",
      },
    ];
    const settings = { ...input, evidence, unitAlive: () => false };
    const result =
      method === "gc"
        ? reconcileWriteLeases(settings)
        : claimWriteLease({
            ...settings,
            run_id: "new",
            writes: ["src/**"],
            ticket: "new",
            dispatcher_session: "fixture",
            since: "2026-10-13T00:00:00Z",
          });
    expect(result.ok).toBe(true);
    const log = readLeaseEvidence(input.stateDir);
    expect(
      log.filter((r) => r.run_id === id && r.kind === "abandoned"),
    ).toHaveLength(1);
    expect(log.find((r) => r.run_id === id)?.reason).toBe("stopped externally");
    const second = reconcileWriteLeases({
      ...settings,
      evidence: [...evidence, ...log],
    });
    expect(second.ok).toBe(true);
    expect(
      readLeaseEvidence(input.stateDir).filter(
        (r) => r.run_id === id && r.kind === "abandoned",
      ),
    ).toHaveLength(1);
  }
});

test("admission caches current workspace checks and refuses historical holders with recovery and fail-closed reason", () => {
  const input = context("admission");
  let probes = 0;
  const result = claimWriteLease({
    ...input,
    evidence: [row("old", input.cwd), row("other", input.cwd)],
    workspaceChanges: () => {
      probes++;
      return { changed: true, error: "jj failed" };
    },
    run_id: "new",
    cwd: input.cwd,
    writes: ["src/a.ts"],
    ticket: "new",
    dispatcher_session: "fixture",
    since: "2026-10-13T00:00:00Z",
  });
  expect(result.ok).toBe(false);
  expect(probes).toBe(1);
  if (!result.ok) {
    expect(result.error).toContain("jj failed");
    expect(result.error).toContain("ledger note old --reject");
  }
});

test("judgment in dated shard without pick releases an entire exact lineage", () => {
  const input = context("shard");
  mkdirSync(input.stateDir);
  writeFileSync(
    join(input.stateDir, "runs-2026-10-12.jsonl"),
    JSON.stringify({ ...row("old", input.cwd, "stallesc") }) +
      "\n" +
      JSON.stringify({ ...row("new", input.cwd, "stallesc") }) +
      "\n",
  );
  writeFileSync(
    join(input.stateDir, "runs.jsonl"),
    JSON.stringify({ kind: "acceptance", run_id: "new", accept: false }) + "\n",
  );
  expect(
    listWriteLeases({
      ...input,
      evidence: readLeaseEvidence(input.stateDir),
      workspaceChanges: () => ({ changed: true }),
    }),
  ).toEqual({ ok: true, value: [] });
});

test("read-only workspace observations cover clean, dirty, failed and stale snapshots without running jj", () => {
  const input = context("readonly-observation");
  const workingCopy = join(input.cwd, ".jj", "working_copy");
  mkdirSync(workingCopy, { recursive: true });
  const snapshot = join(workingCopy, "tree_state");
  const file = join(input.cwd, "a.ts");
  writeFileSync(file, "unchanged");
  writeFileSync(snapshot, "fixture");
  const future =
    Temporal.Instant.from("2099-01-01T00:00:00Z").epochMilliseconds / 1000;
  utimesSync(snapshot, future, future);
  const outputs = new Map([
    ["file", "a.ts\n"],
    ["sparse", ".\n"],
  ]);
  const calls: string[][] = [];
  const clean = workspaceChanges(input.cwd, (args) => {
    calls.push(args);
    return {
      exit: 0,
      stdout: outputs.get(args[0] ?? "") ?? "",
      stderr: "",
    };
  });
  expect(clean).toEqual({ changed: false });
  expect(calls).toEqual([
    ["diff", "--from", "trunk()", "--to", "@", "--summary"],
    ["file", "list", "-r", "@"],
    ["sparse", "list"],
  ]);
  expect(
    workspaceChanges(input.cwd, () => ({
      exit: 0,
      stdout: "M a.ts\n",
      stderr: "",
    })),
  ).toEqual({ changed: true });
  expect(
    workspaceChanges(input.cwd, () => ({
      exit: 1,
      stdout: "",
      stderr: "jj failed",
    })),
  ).toEqual({ changed: true, error: "jj failed" });
  const past =
    Temporal.Instant.from("2000-01-01T00:00:00Z").epochMilliseconds / 1000;
  utimesSync(snapshot, past, past);
  expect(
    workspaceChanges(input.cwd, (args) => ({
      exit: 0,
      stdout: outputs.get(args[0] ?? "") ?? "",
      stderr: "",
    })).error,
  ).toContain("stale");
});

test("same ticket in another workspace does not inherit judgment; landing does fold", () => {
  const input = context("lineage-boundary");
  const other = join(scratch, "other-workspace");
  mkdirSync(other);
  mkdirSync(join(other, ".jj"));
  const evidence = [
    row("old", input.cwd, "same"),
    row("new", input.cwd, "same"),
    row("other", other, "same"),
    { kind: "landed", run_id: "new" },
  ];
  const result = listWriteLeases({
    ...input,
    evidence,
    workspaceChanges: () => ({ changed: true }),
  });
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.value.map((l) => l.run_id)).toEqual(["other"]);
});

test("a resume can take over its own unfinished workspace lineage", () => {
  const input = context("resume-lineage");
  const result = claimWriteLease({
    ...input,
    evidence: [row("old", input.cwd, "stallesc")],
    workspaceChanges: () => ({ changed: true }),
    run_id: "new",
    writes: ["src/**"],
    ticket: "stallesc",
    dispatcher_session: "fixture",
    since: "2026-10-13T00:00:00Z",
  });
  expect(result.ok).toBe(true);
  expect(
    readLeaseEvidence(input.stateDir).some(
      (r) => r.kind === "admitted" && r.run_id === "new",
    ),
  ).toBe(true);
});

test("a ticket resumed from a subdirectory belongs to the same workspace lineage", () => {
  const input = context("subdirectory-lineage");
  const child = join(input.cwd, "child");
  mkdirSync(child);
  const evidence = [
    row("old", input.cwd, "same"),
    row("new", child, "same"),
    { kind: "acceptance", run_id: "new", accept: false },
  ];
  expect(
    listWriteLeases({
      ...input,
      evidence,
      workspaceChanges: () => ({ changed: true }),
    }),
  ).toEqual({ ok: true, value: [] });
});

test("pre-lease firedancer history never backfills dirty terminal workspaces; live writers hold in any era", () => {
  const input = context("pre-lease-history");
  const id = "2026-10-08T18-56-09.568625096Z-59568";
  const result = listWriteLeases({
    ...input,
    evidence: [
      { ...row(id, input.cwd, "ktfix"), kind: "run", lease_version: undefined },
    ],
    workspaceChanges: () => ({ changed: true }),
  });
  expect(result).toEqual({ ok: true, value: [] });
  const live = listWriteLeases({
    ...input,
    evidence: [
      {
        ...row(id, input.cwd, "ktfix"),
        kind: "started",
        lease_version: undefined,
      },
    ],
    activeRunIds: new Set([id]),
  });
  expect(live.ok && live.value.map((lease) => lease.run_id)).toEqual([id]);
});

test("a detached live process holds even when its unit lookup is unavailable and admission is missing", () => {
  const input = context("detached-process-live");
  const evidence = [
    {
      ...row("m10_v2", input.cwd),
      kind: "detached",
      lease_version: undefined,
      pid: 42,
      unit: "missing",
    },
  ];
  const held = listWriteLeases({
    ...input,
    evidence,
    unitAlive: () => false,
    processAlive: (pid) => pid === 42,
  });
  expect(held.ok && held.value.map((lease) => lease.run_id)).toEqual([
    "m10_v2",
  ]);
});

test("3.5.0 compatibility rejects backfilled receipts before deployment and includes its exact boundary", () => {
  const input = context("deployment-cutoff");
  const dir = join(input.stateDir, "write-leases", hash(input.repo));
  mkdirSync(dir, { recursive: true });
  const ids = [
    "2026-10-11T00-44-18.000Z-1-gpx9dz",
    "2026-10-12T13-39-36.999Z-1-before",
    "2026-10-12T13-39-37Z-1-boundary",
  ];
  const evidence = ids.map((run_id) =>
    Object.assign({}, row(run_id, input.cwd), {
      kind: "run",
      lease_version: undefined,
      started_at: "2026-10-13T00:00:00Z",
    }),
  );
  for (const r of evidence)
    writeFileSync(
      join(dir, hash(r.run_id ?? "") + ".json"),
      JSON.stringify({
        repo: input.repo,
        run_id: r.run_id,
        cwd: input.cwd,
        ticket: r.ticket?.name,
        writes: r.ticket?.writes,
        dispatcher_session: "fixture",
        since: "2026-10-13T00:00:00Z",
      }),
    );
  const held = listWriteLeases({
    ...input,
    evidence,
    workspaceChanges: () => ({ changed: true }),
  });
  expect(held.ok && held.value.map((lease) => lease.run_id)).toEqual([
    "2026-10-12T13-39-37Z-1-boundary",
  ]);
});

test("f2_fix3 live amend transfers its own lineage lease and judgments reach its successor", () => {
  const input = context("f2-fix3-transfer");
  const id = "2026-10-12T23-24-20.916335236Z-3353299-pafyhc";
  const writes = [
    "packages/FireOps.jl/src/lineage/distributions*.jl",
    "packages/FireOps.jl/test/lineage/distributions*",
  ];
  const parent = {
    ...row(id, input.cwd, "f2_fix3"),
    ticket: { name: "f2_fix3", writes },
  };
  const result = claimWriteLease({
    ...input,
    evidence: [parent],
    activeRunIds: new Set([id]),
    run_id: "successor",
    ticket: "f2_fix3",
    writes,
    predecessor: id,
    dispatcher_session: "fixture",
    since: "2026-10-13T00:00:00Z",
  });
  expect(result.ok).toBe(true);
  const admitted = readLeaseEvidence(input.stateDir);
  expect(admitted.find((r) => r.run_id === "successor")?.predecessor).toBe(id);
  const listed = listWriteLeases({
    ...input,
    evidence: [parent, ...admitted],
    activeRunIds: new Set([id, "successor"]),
  });
  expect(listed.ok).toBe(true);
  if (listed.ok)
    expect(listed.value.map((l) => l.run_id)).toEqual(["successor"]);
  const judged = listWriteLeases({
    ...input,
    evidence: [
      parent,
      ...admitted,
      { kind: "run", run_id: "successor" },
      { kind: "acceptance", run_id: id, accept: false },
    ],
    workspaceChanges: () => ({ changed: true }),
  });
  expect(judged).toEqual({ ok: true, value: [] });
});

test("frame_rev6 does not collide with fo_rel2's exact paths, but its true counterpart does", () => {
  const input = context("frame-rev6-overlap");
  const id = "2026-10-12T23-24-54.505573801Z-3361642-4xqgms";
  const parent = {
    ...row(id, input.cwd, "fo_rel2"),
    ticket: {
      name: "fo_rel2",
      writes: [
        "packages/FireOps.jl/Project.toml",
        "packages/FireOps.jl/CHANGELOG.md",
        "launcher/designs/module-ledger.toml",
      ],
    },
  };
  const request = {
    ...input,
    evidence: [parent],
    activeRunIds: new Set([id]),
    run_id: "frame_rev6",
    ticket: "frame_rev6",
    writes: ["launcher/frame_integrity*.test.*"],
    dispatcher_session: "fixture",
    since: "2026-10-13T00:00:00Z",
  };
  expect(claimWriteLease(request).ok).toBe(true);
  const trueOverlap = claimWriteLease({
    ...request,
    run_id: "true-overlap",
    ticket: "other",
    writes: ["launcher/designs/module-*.toml"],
  });
  expect(trueOverlap.ok).toBe(false);
  if (!trueOverlap.ok) expect(trueOverlap.error).toContain(id);
});

test.each(["foreground", "detached", "amend", "resume"])(
  "%s has durable admission and holds while live without a lease cache",
  (mode) => {
    const input = context(`mode-${mode}`);
    const run_id = `live-${mode}`;
    expect(
      claimWriteLease({
        ...input,
        evidence: [],
        run_id,
        ticket: mode,
        writes: ["src/**"],
        dispatcher_session: "fixture",
        since: "2026-10-13T00:00:00Z",
      }).ok,
    ).toBe(true);
    rmSync(join(input.stateDir, "write-leases"), {
      recursive: true,
      force: true,
    });
    const result = listWriteLeases({
      ...input,
      evidence: readLeaseEvidence(input.stateDir),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.map((l) => l.run_id)).toEqual([run_id]);
  },
);

test("a refused successor restores its live predecessor's ownership", () => {
  const input = context("refused-successor");
  const parent = row("parent", input.cwd, "same");
  const activeRunIds = new Set(["parent"]);
  expect(
    claimWriteLease({
      ...input,
      evidence: [parent],
      activeRunIds,
      run_id: "child",
      ticket: "same",
      predecessor: "parent",
      writes: ["src/**"],
      dispatcher_session: "fixture",
      since: "2026-10-13T00:00:00Z",
    }).ok,
  ).toBe(true);
  expect(
    releaseWriteLease({
      stateDir: input.stateDir,
      repo: input.repo,
      run_id: "child",
    }).ok,
  ).toBe(true);
  const result = listWriteLeases({
    ...input,
    evidence: [parent, ...readLeaseEvidence(input.stateDir)],
    activeRunIds,
  });
  expect(result.ok).toBe(true);
  if (result.ok)
    expect(result.value.map((lease) => lease.run_id)).toEqual(["parent"]);
});

test("a legacy stopped chainacc unit gets abandonment without becoming a lease holder", () => {
  const input = context("legacy-chainacc");
  const id = "2026-10-12T22-54-10.995700277Z-2964755-1nzley";
  const evidence = [
    {
      ...row(id, input.cwd, "chainacc"),
      kind: "detached",
      lease_version: undefined,
      unit: "externally-stopped",
    },
  ];
  expect(
    reconcileWriteLeases({
      ...input,
      evidence,
      unitAlive: () => false,
      workspaceChanges: () => ({ changed: true }),
    }),
  ).toEqual({ ok: true, value: [] });
  expect(
    readLeaseEvidence(input.stateDir).filter(
      (entry) => entry.kind === "abandoned" && entry.run_id === id,
    ),
  ).toHaveLength(1);
});

test("3.5.0 doe_prep receipt plus matching run metadata holds and upgrades, while cache alone does not", () => {
  const input = context("legacy-doe-prep");
  const id = "2026-10-12T23-38-58.255732416Z-3546676-fudgy4";
  const dir = join(input.stateDir, "write-leases", hash(input.repo));
  mkdirSync(dir, { recursive: true });
  const receipt = {
    repo: input.repo,
    run_id: id,
    cwd: input.cwd,
    ticket: "doe_prep",
    writes: ["src/**"],
    dispatcher_session: "fixture",
    since: "2026-10-12T23:40:01.620490276Z",
  };
  writeFileSync(join(dir, hash(id) + ".json"), JSON.stringify(receipt));
  const evidence = [{ ...row(id, input.cwd, "doe_prep"), kind: "run" }];
  const observation = {
    ...input,
    evidence,
    workspaceChanges: () => ({ changed: true }),
  };
  expect(listWriteLeases({ ...observation, evidence: [] })).toEqual({
    ok: true,
    value: [],
  });
  const held = listWriteLeases(observation);
  expect(held.ok).toBe(true);
  if (held.ok) expect(held.value.map((lease) => lease.run_id)).toEqual([id]);
  expect(reconcileWriteLeases(observation).ok).toBe(true);
  rmSync(dir, { recursive: true, force: true });
  const upgraded = listWriteLeases({
    ...observation,
    evidence: [...readLeaseEvidence(input.stateDir), ...evidence],
  });
  expect(upgraded.ok).toBe(true);
  if (upgraded.ok)
    expect(upgraded.value.map((lease) => lease.run_id)).toEqual([id]);
});

test("ag_ident's rejection in the 10-13 shard releases its corroborated 3.5.0 receipt", () => {
  const input = context("legacy-ag-ident");
  const id = "2026-10-12T23-17-27.028560466Z-3252940-alpx79";
  const dir = join(input.stateDir, "write-leases", hash(input.repo));
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, hash(id) + ".json"),
    JSON.stringify({
      repo: input.repo,
      run_id: id,
      cwd: input.cwd,
      ticket: "ag_ident",
      writes: ["src/**"],
      dispatcher_session: "fixture",
      since: "2026-10-12T23:17:27Z",
    }),
  );
  writeFileSync(
    join(input.stateDir, "runs.jsonl"),
    JSON.stringify({ ...row(id, input.cwd, "ag_ident"), kind: "run" }) + "\n",
  );
  writeFileSync(
    join(input.stateDir, "runs-2026-10-13.jsonl"),
    JSON.stringify({ kind: "acceptance", run_id: id, accept: false }) + "\n",
  );
  expect(
    listWriteLeases({
      ...input,
      evidence: readLeaseEvidence(input.stateDir),
      workspaceChanges: () => ({ changed: true }),
    }),
  ).toEqual({ ok: true, value: [] });
});

test("synthesized 3.5.x admitted returned unjudged changes HOLD, and a live run HOLDs", () => {
  const input = context("positive-holders");
  const admit = (run_id: string) =>
    claimWriteLease({
      ...input,
      evidence: readLeaseEvidence(input.stateDir),
      run_id,
      ticket: run_id,
      writes: [`${run_id}/**`],
      dispatcher_session: "fixture",
      since: "2026-10-13T01:19:03Z",
      workspaceChanges: () => ({ changed: true }),
    });
  expect(admit("returned").ok).toBe(true);
  appendFileSync(
    join(input.stateDir, "runs.jsonl"),
    JSON.stringify({ kind: "run", run_id: "returned", result: "returned" }) +
      "\n",
  );
  expect(admit("live").ok).toBe(true);
  const result = listWriteLeases({
    ...input,
    evidence: readLeaseEvidence(input.stateDir),
    workspaceChanges: () => ({ changed: true }),
  });
  expect(result.ok).toBe(true);
  if (result.ok)
    expect(result.value.map((lease) => lease.run_id).toSorted()).toEqual([
      "live",
      "returned",
    ]);
});

test("integrated 3.5.0 compatibility: readonly listing, foreground transfer, lineage rejection and stopped-unit abandonment", () => {
  const input = context("compatibility-integration");
  const dir = join(input.stateDir, "write-leases", hash(input.repo));
  mkdirSync(dir, { recursive: true });
  const receipt = (run_id: string, name: string, writes: string[]) => {
    writeFileSync(
      join(dir, hash(run_id) + ".json"),
      JSON.stringify({
        repo: input.repo,
        run_id,
        cwd: input.cwd,
        ticket: name,
        writes,
        dispatcher_session: "fixture",
        since: "2026-10-12T23:00:00Z",
      }),
    );
  };
  const parent = {
    ...row("legacy-parent", input.cwd, "same"),
    kind: "started",
    pid: process.pid,
  };
  receipt("legacy-parent", "same", ["src/**"]);
  const before = readdirSync(dir);
  const initial = listWriteLeases({
    ...input,
    evidence: [parent],
    activeRunIds: new Set(["legacy-parent"]),
  });
  expect(initial.ok).toBe(true);
  if (initial.ok)
    expect(initial.value.map((lease) => lease.run_id)).toEqual([
      "legacy-parent",
    ]);
  expect(readdirSync(dir)).toEqual(before);
  expect(existsSync(join(dir, ".lock"))).toBe(false);
  expect(
    claimWriteLease({
      ...input,
      evidence: [parent],
      activeRunIds: new Set(["legacy-parent"]),
      run_id: "foreground-successor",
      ticket: "same",
      predecessor: "legacy-parent",
      writes: ["src/**"],
      dispatcher_session: "fixture",
      since: "2026-10-13T01:19:03Z",
    }).ok,
  ).toBe(true);
  const successor = listWriteLeases({
    ...input,
    evidence: [parent, ...readLeaseEvidence(input.stateDir)],
    activeRunIds: new Set(["legacy-parent"]),
  });
  expect(successor.ok).toBe(true);
  if (successor.ok)
    expect(successor.value.map((lease) => lease.run_id)).toEqual([
      "foreground-successor",
    ]);
  appendFileSync(
    join(input.stateDir, "runs.jsonl"),
    [
      { kind: "run", run_id: "legacy-parent" },
      { kind: "run", run_id: "foreground-successor" },
      { kind: "acceptance", run_id: "legacy-parent", accept: false },
    ]
      .map((entry) => JSON.stringify(entry))
      .join("\n") + "\n",
  );
  expect(
    listWriteLeases({
      ...input,
      evidence: [parent, ...readLeaseEvidence(input.stateDir)],
      workspaceChanges: () => ({ changed: true }),
    }),
  ).toEqual({ ok: true, value: [] });
  receipt("stopped", "stopped", ["other/**"]);
  const stopped = {
    ...row("stopped", input.cwd, "stopped"),
    kind: "detached",
    unit: "externally-stopped",
    ticket: { name: "stopped", writes: ["other/**"] },
  };
  expect(
    reconcileWriteLeases({
      ...input,
      evidence: [parent, stopped, ...readLeaseEvidence(input.stateDir)],
      unitAlive: () => false,
    }).ok,
  ).toBe(true);
  expect(
    readLeaseEvidence(input.stateDir).filter(
      (entry) => entry.run_id === "stopped" && entry.kind === "abandoned",
    ),
  ).toHaveLength(1);
});
