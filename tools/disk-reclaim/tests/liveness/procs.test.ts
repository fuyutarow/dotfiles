import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  createLivenessSnapshot,
  scratchRef,
} from "../../src/liveness/facts.ts";
import { judge } from "../../src/liveness/predicate.ts";
import { collectProcesses, openPathsUnder } from "../../src/lib/procs.ts";
import { judgeWorkspace, type WorkspaceFacts } from "../../src/jj/safety.ts";
import { procFixture } from "../fixtures/procs.ts";
import { tempRoot } from "../fixtures/temp.ts";
import type { Candidate } from "../../src/model.ts";

const uuid = "123e4567-e89b-42d3-a456-426614174000";
const safeWorkspace: Omit<WorkspaceFacts, "open"> = {
  fresh: { ok: true, detail: "fresh" },
  unpushed: [],
  conflicts: [],
  bookmarks: [],
  foreign: [],
  session: null,
  lastFetch: "fixture",
};

const cases: [string, Candidate["verdict"]][] = [
  ["sshd", "RECLAIM"],
  ["python", "ASK"],
];
for (const via of ["cwd", "fd", "fd/3", "environ"]) {
  for (const [comm, expected] of cases) {
    test(`unreadable ${comm} ${via}: both liveness and workspace probe give ${expected}`, () => {
      const root = tempRoot("reclaim-procs-");
      using cleanup = new DisposableStack();
      cleanup.defer(() => {
        rmSync(root, { recursive: true, force: true });
      });
      const proc = procFixture(root, comm, [via]);
      const home = join(root, "home");
      mkdirSync(join(home, ".claude/sessions"), { recursive: true });
      const transcript = join(
        home,
        ".claude/projects/project",
        `${uuid}.jsonl`,
      );
      mkdirSync(join(transcript, ".."), { recursive: true });
      writeFileSync(transcript, "{}\n");
      utimesSync(transcript, 1, 1);
      const scratch = join(root, "scratch");
      const ref = scratchRef(
        join(scratch, "project", uuid, "scratchpad/repo"),
        [scratch],
      );
      expect(ref).not.toBeNull();
      assert.ok(ref !== null);
      const config = {
        repo_roots: [],
        repos: [],
        scratch_roots: [scratch],
        delete_roots: [],
        regenerable_ignored: [],
        ignore_unreadable_procs: ["sshd"],
        session_grace_hours: 24,
      };
      const snapshot = createLivenessSnapshot(config, { home, procs: proc });
      const live = judge(ref, snapshot.facts(ref));
      expect(live.verdict).toBe(expected === "RECLAIM" ? "dead" : "unknown");
      const open = openPathsUnder(ref.dir, ref.uid, {
        ...proc,
        ignoreUnreadableProcs: config.ignore_unreadable_procs,
      });
      expect(judgeWorkspace({ ...safeWorkspace, open }).verdict).toBe(expected);
      expect(snapshot.openPaths(ref.dir).unknown).toEqual(open.unknown);
      expect(snapshot.facts(ref)).toBe(snapshot.facts(ref));
      expect(proc.scans()).toBe(2); // one shared snapshot + one independent compatibility probe
    });
  }
}

test("same-uid EACCES requires a readable allowlisted comm; EPERM remains unknown", () => {
  for (const options of [
    { comm: "sshd", denied: ["cwd", "comm"], code: "EACCES", unknown: true },
    {
      comm: "sshd",
      denied: ["cwd", "comm", "exe"],
      code: "EACCES",
      unknown: true,
    },
    { comm: "sshd", denied: ["cwd"], code: "EPERM", unknown: true },
    { comm: "sshd-helper", denied: ["cwd"], code: "EACCES", unknown: true },
    { comm: "sshd", denied: ["cwd"], code: "EACCES", unknown: true, allow: [] },
  ]) {
    const root = tempRoot("reclaim-proc-identity-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(root, { recursive: true, force: true });
    });
    const proc = procFixture(root, options.comm, options.denied, options.code);
    const snapshot = collectProcesses({
      ...proc,
      ignoreUnreadableProcs: options.allow ?? ["sshd"],
    });
    expect(snapshot.openPaths(root).unknown.length > 0).toBe(options.unknown);
  }
});

test("recorded EACCES facts include process comm, state, and status uid line", () => {
  const root = tempRoot("reclaim-proc-eacces-fact-");
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const proc = procFixture(root, "python", ["environ"]);
  const snapshot = collectProcesses({
    ...proc,
    ignoreUnreadableProcs: ["sshd"],
  });
  const fact = snapshot.openPaths(root).unknown[0];
  expect(fact).toContain("comm=python");
  expect(fact).toContain("state=S");
  expect(fact).toContain("uid_line=Uid:");
});

test("same-uid EACCES rechecks process state and starttime once", () => {
  for (const scenario of [
    "vanished",
    "reused",
    "zombie",
    "ignored",
    "live",
  ] as const) {
    const root = tempRoot("reclaim-proc-eacces-race-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(root, { recursive: true, force: true });
    });
    const comm = scenario === "live" ? "python" : "sshd";
    const proc = procFixture(root, comm, ["environ", "fd"]);
    const statPath = join(proc.base, "stat");
    const readText = proc.fs.readText;
    let statReads = 0;
    const fs = {
      ...proc.fs,
      readText: (path: string) => {
        if (path === statPath) {
          statReads++;
          if (statReads === 2 && scenario === "vanished")
            return Object.assign(new Error("ENOENT"), { code: "ENOENT" });
          if (statReads === 2 && scenario === "reused")
            return `9999999 (${comm}) S ${Array.from({ length: 18 }, () => "0").join(" ")} 456\n`;
          if (statReads === 2 && scenario === "zombie")
            return `9999999 (${comm}) Z ${Array.from({ length: 18 }, () => "0").join(" ")} 123\n`;
        }
        return readText(path);
      },
    };
    const snapshot = collectProcesses({
      ...proc,
      fs,
      ignoreUnreadableProcs: ["sshd"],
    });
    const expectedUnknown = scenario === "live";
    expect(snapshot.openPaths(root).unknown.length > 0).toBe(expectedUnknown);
    expect(statReads).toBe(expectedUnknown ? 4 : 2); // identity recheck plus stat reads when recording each EACCES fact
  }
});

test("allowlisted permission failures do not suppress readable live paths; deleted fd links respect boundaries", () => {
  const root = tempRoot("reclaim-proc-paths-");
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const proc = procFixture(root, "sshd", ["environ"]);
  unlinkSync(join(proc.base, "fd/3"));
  symlinkSync(`${root}/candidate/data (deleted)`, join(proc.base, "fd/3"));
  const snapshot = collectProcesses({
    ...proc,
    ignoreUnreadableProcs: ["sshd"],
  });
  expect(snapshot.openPaths(join(root, "candidate")).open).toEqual([
    { pid: 9999999, via: "fd/3", path: `${root}/candidate/data` },
  ]);
  expect(snapshot.openPaths(join(root, "candidate-sibling")).open).toEqual([]);
  expect(snapshot.openPaths(root).unknown).toEqual([]);
});

test("a known conflict requires KEEP even when process evidence is unknown", () => {
  expect(
    judgeWorkspace({
      ...safeWorkspace,
      conflicts: ["conflicted"],
      open: { open: [], unknown: ["pid 1 cwd"] },
    }).verdict,
  ).toBe("KEEP");
});

test("foreign uid unreadable processes have no effect", () => {
  const root = tempRoot("reclaim-proc-foreign-");
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const proc = procFixture(root, "python", ["cwd", "fd"]);
  const snapshot = collectProcesses({
    ...proc,
    fs: {
      ...proc.fs,
      uid: () => (process.getuid?.() ?? 0) + 1,
    },
  });
  expect(snapshot.openPaths(root).unknown).toEqual([]);
  expect(snapshot.openPaths(root).open).toEqual([]);
});

test("foreign root process permission failures have no effect", () => {
  const root = tempRoot("reclaim-proc-root-");
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const proc = procFixture(root, "rootproc", ["cwd", "fd"]);
  const snapshot = collectProcesses({
    ...proc,
    uid: 1,
    fs: { ...proc.fs, uid: () => 0 },
  });
  expect(snapshot.openPaths(root).unknown).toEqual([]);
});

test("same-uid cwd inside the candidate is KEEP evidence", () => {
  const root = tempRoot("reclaim-proc-cwd-");
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const proc = procFixture(root, "python");
  unlinkSync(join(proc.base, "cwd"));
  symlinkSync(join(root, "candidate", "nested"), join(proc.base, "cwd"));
  const snapshot = collectProcesses(proc);
  expect(snapshot.openPaths(join(root, "candidate")).open).toEqual([
    {
      pid: 9999999,
      via: "cwd",
      path: join(root, "candidate", "nested"),
    },
  ]);
});
