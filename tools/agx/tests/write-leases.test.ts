import { afterAll, expect, test } from "bun:test";
import { FFIType, dlopen } from "bun:ffi";
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf } from "../../shared/src/zod.ts";
import {
  appendLifecycle,
  lifecyclePath,
  LifecycleEventSchema,
  type LifecycleEvent,
} from "../src/lifecycle-log.ts";
import {
  appendLeaseSnapshot,
  claimWriteLease,
  listWriteLeases,
  releaseWriteLease,
} from "../src/write-leases.ts";

const scratch = mkdtempSync(join(tmpdir(), "agx-write-leases-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function context(name: string, cwd = join(scratch, `${name}-workspace`)) {
  const stateDir = join(scratch, name);
  mkdirSync(cwd, { recursive: true });
  mkdirSync(join(cwd, ".jj"), { recursive: true });
  return { stateDir, cwd, repo: "/repo" };
}

function appendAdmission(
  input: ReturnType<typeof context>,
  runId: string,
  options: { writes?: string[]; lease?: "workspace"; exclusive?: boolean } = {},
): void {
  const writes = options.writes ?? ["src/**"];
  const record = {
    kind: "admitted",
    run_id: runId,
    repo: input.repo,
    cwd: input.cwd,
    ticket: { name: runId, writes },
    lease: options.lease ?? "repository",
    exclusive: options.exclusive ?? false,
    lease_writes: writes,
    dispatcher_session: "fixture",
    started_at: Temporal.Now.instant().toString(),
  };
  const result = appendLifecycle(input.stateDir, {
    type: "admitted",
    run_id: runId,
    repo: input.repo,
    workspace: input.cwd,
    ticket: runId,
    writes,
    resource: null,
    session_id: "fixture",
    record,
  });
  expect(result.ok).toBe(true);
}

function appendTerminal(
  input: ReturnType<typeof context>,
  runId: string,
): void {
  const result = appendLifecycle(input.stateDir, {
    type: "terminal",
    run_id: runId,
    outcome: "done",
    workspace: input.cwd,
    record: { kind: "run", run_id: runId, cwd: input.cwd },
  });
  expect(result.ok).toBe(true);
}

function leases(input: ReturnType<typeof context>) {
  return listWriteLeases({
    stateDir: input.stateDir,
    repo: input.repo,
  });
}

function lifecycleLockIsFree(path: string): boolean {
  const library = dlopen(
    process.platform === "darwin" ? "/usr/lib/libSystem.B.dylib" : "libc.so.6",
    {
      flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
    },
  );
  const fd = openSync(path, "r");
  const acquired = library.symbols.flock(fd, 2 | 4) === 0;
  if (acquired) library.symbols.flock(fd, 8);
  closeSync(fd);
  library.close();
  return acquired;
}

test("terminal releases ordinary leases; exclusive terminal holds until reject or disposal", () => {
  const released = context("terminal-releases");
  appendAdmission(released, "terminal-run");
  const earlySuccessor = claimWriteLease({
    ...released,
    run_id: "early-successor",
    predecessor: "terminal-run",
    writes: ["src/main.ts"],
    ticket: "terminal-run",
    dispatcher_session: "fixture",
    since: Temporal.Now.instant().toString(),
  });
  expect(earlySuccessor.ok).toBe(false);
  appendTerminal(released, "terminal-run");
  const admitted = claimWriteLease({
    ...released,
    run_id: "terminal-successor",
    writes: ["src/main.ts"],
    ticket: "terminal-successor",
    dispatcher_session: "fixture",
    since: Temporal.Now.instant().toString(),
  });
  expect(admitted.ok).toBe(true);
  expect(leases(released)).toMatchObject({
    ok: true,
    value: [{ run_id: "terminal-successor" }],
  });

  const exclusive = context("exclusive-terminal");
  appendAdmission(exclusive, "exclusive-run", { exclusive: true });
  appendTerminal(exclusive, "exclusive-run");
  const refused = claimWriteLease({
    ...exclusive,
    run_id: "exclusive-successor",
    writes: ["src/main.ts"],
    ticket: "exclusive-successor",
    dispatcher_session: "fixture",
    since: Temporal.Now.instant().toString(),
  });
  expect(refused.ok).toBe(false);
  const acceptedExclusive = context("exclusive-accepted");
  appendAdmission(acceptedExclusive, "accepted-exclusive", { exclusive: true });
  appendTerminal(acceptedExclusive, "accepted-exclusive");
  expect(
    appendLifecycle(acceptedExclusive.stateDir, {
      type: "judged",
      run_id: "accepted-exclusive",
      decision: "accept",
      record: {
        kind: "acceptance",
        run_id: "accepted-exclusive",
        accept: true,
      },
    }).ok,
  ).toBe(true);
  expect(
    claimWriteLease({
      ...acceptedExclusive,
      run_id: "accepted-successor",
      writes: ["src/main.ts"],
      ticket: "accepted-successor",
      dispatcher_session: "fixture",
      since: Temporal.Now.instant().toString(),
    }).ok,
  ).toBe(false);
  expect(
    appendLifecycle(exclusive.stateDir, {
      type: "judged",
      run_id: "exclusive-run",
      decision: "reject",
      record: { kind: "acceptance", run_id: "exclusive-run", accept: false },
    }).ok,
  ).toBe(true);
  const rejectedSuccessor = claimWriteLease({
    ...exclusive,
    run_id: "rejected-successor",
    writes: ["src/main.ts"],
    ticket: "rejected-successor",
    dispatcher_session: "fixture",
    since: Temporal.Now.instant().toString(),
  });
  expect(rejectedSuccessor.ok).toBe(true);

  const disposed = context("exclusive-disposed");
  appendAdmission(disposed, "disposed-exclusive", { exclusive: true });
  appendTerminal(disposed, "disposed-exclusive");
  expect(
    releaseWriteLease({
      stateDir: disposed.stateDir,
      repo: disposed.repo,
      run_id: "disposed-exclusive",
    }).ok,
  ).toBe(true);
  const afterDispose = claimWriteLease({
    ...disposed,
    run_id: "after-dispose",
    writes: ["src/main.ts"],
    ticket: "after-dispose",
    dispatcher_session: "fixture",
    since: Temporal.Now.instant().toString(),
  });
  expect(afterDispose.ok).toBe(true);
});

test("ignored-only writes do not lease and workspace scope separates workspaces", () => {
  const ignored = context("ignored-target");
  writeFileSync(
    join(ignored.cwd, ".gitignore"),
    "target/**\nnode_modules/**\n",
  );
  const gitInit = Bun.spawnSync(["git", "init", "-q"], {
    cwd: ignored.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(gitInit.exitCode, gitInit.stderr.toString()).toBe(0);
  const result = claimWriteLease({
    ...ignored,
    run_id: "ignored-only",
    writes: ["target/**", "node_modules/**"],
    ticket: "ignored",
    dispatcher_session: "fixture",
    since: Temporal.Now.instant().toString(),
  });
  expect(result.ok).toBe(true);
  expect(leases(ignored)).toEqual({ ok: true, value: [] });
  const untracked = claimWriteLease({
    ...ignored,
    run_id: "untracked-probe",
    writes: ["probe/hold.txt"],
    ticket: "untracked-probe",
    dispatcher_session: "fixture",
    since: Temporal.Now.instant().toString(),
  });
  expect(untracked.ok).toBe(true);
  expect(leases(ignored)).toMatchObject({
    ok: true,
    value: [{ run_id: "untracked-probe", writes: ["probe/hold.txt"] }],
  });

  const workspace = context("workspace-scope");
  appendAdmission(workspace, "workspace-one", { lease: "workspace" });
  const other = context("workspace-scope-other");
  const admitted = claimWriteLease({
    ...other,
    stateDir: workspace.stateDir,
    repo: workspace.repo,
    run_id: "workspace-two",
    writes: ["src/main.ts"],
    lease: "workspace",
    ticket: "workspace-two",
    dispatcher_session: "fixture",
    since: Temporal.Now.instant().toString(),
  });
  expect(admitted.ok).toBe(true);
});

test("real lifecycle slice keeps probehold2 and old live firedancer writers", () => {
  const stateDir = join(scratch, "real-lifecycle-slice");
  mkdirSync(stateDir);
  const dotfilesWorkspace = join(scratch, "fixture-dotfiles");
  const firedancerWorkspace = join(scratch, "fixture-firedancer");
  for (const cwd of [dotfilesWorkspace, firedancerWorkspace]) {
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, ".gitignore"), "");
    const initialized = Bun.spawnSync(["git", "init", "-q"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(initialized.exitCode, initialized.stderr.toString()).toBe(0);
  }
  const fixtureEvents: LifecycleEvent[] = [];
  for (const line of readFileSync(
    join(import.meta.dir, "fixtures/lease-live-state-20261013.jsonl"),
    "utf8",
  )
    .trim()
    .split("\n")) {
    const parsed = jsonOf(LifecycleEventSchema).safeParse(line);
    expect(parsed.success).toBe(true);
    if (!parsed.success) continue;
    const event = parsed.data;
    if (event.type !== "admitted") {
      fixtureEvents.push(event);
      continue;
    }
    const cwd =
      event.repo === "/home/fuyu/dotfiles"
        ? dotfilesWorkspace
        : firedancerWorkspace;
    fixtureEvents.push({
      ...event,
      workspace: cwd,
      record: { ...event.record, cwd },
    });
  }
  writeFileSync(
    lifecyclePath(stateDir),
    fixtureEvents.map((event) => JSON.stringify(event)).join("\n") + "\n",
  );

  const probe = listWriteLeases({
    stateDir,
    repo: "/home/fuyu/dotfiles",
  });
  expect(probe.ok && probe.value.map((lease) => lease.ticket)).toContain(
    "probehold2",
  );
  const firedancer = listWriteLeases({
    stateDir,
    repo: "/home/fuyu/Workspace/firedancer",
  });
  expect(firedancer.ok && firedancer.value).toHaveLength(4);
});

test("admission lock is free in fresh, amended, and resumed worker phases", () => {
  for (const mode of ["fresh", "amended", "resumed"]) {
    const input = context(`lock-${mode}`);
    const result = claimWriteLease({
      ...input,
      run_id: mode,
      writes: ["src/**"],
      ticket: mode,
      dispatcher_session: "fixture",
      since: Temporal.Now.instant().toString(),
    });
    expect(result.ok).toBe(true);
    expect(
      appendLifecycle(input.stateDir, {
        type: "running",
        run_id: mode,
        pid: process.pid,
        started_at: Temporal.Now.instant().toString(),
        record: { kind: "started", run_id: mode, pid: process.pid },
      }).ok,
    ).toBe(true);
    expect(lifecycleLockIsFree(join(input.stateDir, "lifecycle.jsonl"))).toBe(
      true,
    );
    expect(existsSync(join(input.stateDir, "write-leases"))).toBe(false);
  }
});

test("lease folds resume from a lifecycle snapshot offset", () => {
  const input = context("snapshot-offset");
  appendAdmission(input, "before-snapshot");
  const snapshot = appendLeaseSnapshot({
    stateDir: input.stateDir,
    repo: input.repo,
  });
  expect(snapshot.ok).toBe(true);
  expect(
    appendLifecycle(input.stateDir, {
      type: "terminal",
      run_id: "before-snapshot",
      outcome: "done",
      workspace: input.cwd,
      record: { kind: "run", run_id: "before-snapshot", cwd: input.cwd },
    }).ok,
  ).toBe(true);
  appendAdmission(input, "after-snapshot");
  const result = leases(input);
  expect(result.ok && result.value.map((lease) => lease.run_id)).toEqual([
    "after-snapshot",
  ]);
});

test("admission reads only the snapshot suffix after 100,000 older events", () => {
  const input = context("snapshot-scale");
  mkdirSync(input.stateDir, { recursive: true });
  const at = Temporal.Now.instant().toString();
  const events = Array.from({ length: 100_000 }, (_, index) =>
    JSON.stringify({
      schema: 1,
      seq: index + 1,
      event_id: crypto.randomUUID(),
      at,
      run_id: `old-${index}`,
      lineage_id: `old-${index}`,
      session_id: null,
      record: {},
      type: "judged",
      decision: "reject",
    }),
  );
  events.push(
    JSON.stringify({
      schema: 1,
      seq: 100_001,
      event_id: crypto.randomUUID(),
      at,
      run_id: "__lease_snapshot__",
      lineage_id: "__lease_snapshot__",
      session_id: null,
      record: {
        repo: input.repo,
        snapshot_offset: 100_000,
        lease_state: [],
        ticket_index: {},
        lineage_index: {},
      },
      type: "lease_snapshot",
    }),
  );
  writeFileSync(lifecyclePath(input.stateDir), `${events.join("\n")}\n`);

  const started = performance.now();
  const admitted = claimWriteLease({
    ...input,
    run_id: "after-scale-snapshot",
    writes: ["src/new.ts"],
    ticket: "after-scale-snapshot",
    dispatcher_session: "fixture",
    since: at,
  });
  expect(admitted.ok).toBe(true);
  expect(performance.now() - started).toBeLessThan(500);
});

test("a later snapshot for another repo cannot hide this repo's held lease", () => {
  const first = context("snapshot-repo-one");
  first.repo = "/repo-one";
  appendAdmission(first, "repo-one-live");
  expect(
    appendLeaseSnapshot({ stateDir: first.stateDir, repo: first.repo }).ok,
  ).toBe(true);

  const second = context("snapshot-repo-two");
  second.repo = "/repo-two";
  expect(
    claimWriteLease({
      ...second,
      stateDir: first.stateDir,
      run_id: "repo-two-live",
      writes: ["other/**"],
      ticket: "repo-two-live",
      dispatcher_session: "fixture",
      since: Temporal.Now.instant().toString(),
    }).ok,
  ).toBe(true);
  expect(
    appendLeaseSnapshot({ stateDir: first.stateDir, repo: second.repo }).ok,
  ).toBe(true);

  const blocked = claimWriteLease({
    ...first,
    run_id: "repo-one-overlap",
    writes: ["src/new.ts"],
    ticket: "repo-one-overlap",
    dispatcher_session: "fixture",
    since: Temporal.Now.instant().toString(),
  });
  expect(blocked.ok).toBe(false);
  expect(blocked.ok ? "" : blocked.error).toContain("repo-one-live");
});
