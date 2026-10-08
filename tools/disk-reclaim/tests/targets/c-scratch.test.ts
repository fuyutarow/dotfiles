import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempRoot } from "../fixtures/temp.ts";
import { run, plan } from "../../src/engine.ts";
import type {
  LivenessFacts,
  LivenessRef,
  Probe,
} from "../../src/liveness/facts.ts";
import { createScratchTarget } from "../../src/targets/scratch.ts";
import type { Context } from "../../src/targets/index.ts";

const uuidA = "123e4567-e89b-42d3-a456-426614174000";
const uuidB = "223e4567-e89b-42d3-a456-426614174000";
const uuidC = "323e4567-e89b-42d3-a456-426614174000";
const yes = <T>(value: T): Probe<T> => ({ ok: true, value });
const no = (error: string): Probe<never> => ({ ok: false, error });
const config = (root: string) => ({
  repo_roots: [],
  repos: [],
  scratch_roots: [root],
  delete_roots: [],
  regenerable_ignored: [],
  session_grace_hours: 24,
  ignore_unreadable_procs: ["sshd"],
});
function makeFacts(
  ref: LivenessRef,
  state: "dead" | "live" | "unknown",
): LivenessFacts {
  return {
    sessions: yes([]),
    procStarttime: () => no("not in registry"),
    environSessionIds: state === "live" ? yes([ref.uuid]) : yes([]),
    openPaths: yes([]),
    transcript:
      state === "unknown"
        ? yes({ exists: false })
        : yes({ exists: true, mtimeMs: 1 }),
    now: 100_000_000,
    graceHours: 24,
  };
}

describe("scratch target", () => {
  test("only uuid-shaped scratchpad directories are enumerated and uncertainty asks", () => {
    const home = tempRoot("reclaim-scratch-enumeration-");
    const root = join(home, `claude-${process.getuid?.() ?? 0}`);
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(home, { recursive: true, force: true });
    });
    const scratch = (slug: string, uuid: string) =>
      join(root, slug, uuid, "scratchpad");
    mkdirSync(scratch("project", uuidA), { recursive: true });
    mkdirSync(join(root, "project", "arenas.json", "scratchpad"), {
      recursive: true,
    });
    mkdirSync(join(root, "project", "cache-break-state-123", "scratchpad"), {
      recursive: true,
    });
    const target = createScratchTarget({
      getFacts: (ref) => makeFacts(ref, "unknown"),
    });
    const procDir = join(home, "proc");
    mkdirSync(procDir, { recursive: true });
    const context: Context = {
      mode: "plan",
      procDir,
      config: config(root),
      log: () => {},
    };
    const rows = target.plan(context);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      path: scratch("project", uuidA),
      verdict: "ASK",
    });
  });

  test("nested jj workspace is delegated and kept", () => {
    const home = tempRoot("reclaim-scratch-jj-");
    const root = join(home, `claude-${process.getuid?.() ?? 0}`);
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(home, { recursive: true, force: true });
    });
    const scratch = join(root, "project", uuidA, "scratchpad");
    mkdirSync(join(scratch, "nested", ".jj"), { recursive: true });
    writeFileSync(join(scratch, "nested", ".jj/repo"), "store path");
    let probed = false;
    const target = createScratchTarget({
      getFacts: (ref) => {
        probed = true;
        return makeFacts(ref, "dead");
      },
    });
    const rows = target.plan({
      mode: "plan",
      config: config(root),
      log: () => {},
    });
    expect(rows[0]).toMatchObject({
      verdict: "KEEP",
      reason: "delegated: jj workspace",
    });
    expect(probed).toBe(false);
  });

  test("nested git worktree marker is delegated", () => {
    const home = tempRoot("reclaim-scratch-git-");
    const root = join(home, `claude-${process.getuid?.() ?? 0}`);
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(home, { recursive: true, force: true });
    });
    const scratch = join(root, "project", uuidA, "scratchpad");
    mkdirSync(join(scratch, "nested/.git"), { recursive: true });
    let probed = false;
    const target = createScratchTarget({
      getFacts: (ref) => {
        probed = true;
        return makeFacts(ref, "dead");
      },
    });
    expect(
      target.plan({ mode: "plan", config: config(root), log: () => {} })[0]
        ?.reason,
    ).toBe("delegated: jj workspace");
    expect(probed).toBe(false);
  });

  test("plan and run remove only the proven dead fixture scratchpad", async () => {
    const home = tempRoot("reclaim-scratch-e2e-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(home, { recursive: true, force: true });
    });
    const uid = process.getuid?.() ?? 0;
    const root = join(home, `claude-${uid}`);
    const makeScratch = (uuid: string) => {
      const path = join(root, "project", uuid, "scratchpad");
      mkdirSync(path, { recursive: true });
      writeFileSync(join(path, "fixture.txt"), uuid);
      return path;
    };
    const dead = makeScratch(uuidA);
    const live = makeScratch(uuidB);
    const unknown = makeScratch(uuidC);
    const byUuid: Record<string, "dead" | "live" | "unknown"> = {
      [uuidA]: "dead",
      [uuidB]: "live",
      [uuidC]: "unknown",
    };
    const target = createScratchTarget({
      home: () => join(home, "home"),
      uid: () => uid,
      getFacts: (ref) => makeFacts(ref, byUuid[ref.uuid] ?? "unknown"),
    });
    const procDir = join(home, "protected-proc");
    mkdirSync(procDir, { recursive: true });
    const context: Context = {
      mode: "plan",
      procDir,
      config: config(root),
      log: () => {},
    };
    const preview = await plan([target], { context, headroom: { drives: [] } });
    expect(preview.exit).toBe(0);
    expect(
      preview.plan?.targets[0]?.candidates.map(({ path, verdict }) => ({
        path,
        verdict,
      })),
    ).toEqual([
      { path: dead, verdict: "RECLAIM" },
      { path: live, verdict: "KEEP" },
      { path: unknown, verdict: "ASK" },
    ]);
    const executed = await run([target], {
      context,
      headroom: { drives: [] },
      yes: true,
      state: join(home, "state"),
    });
    expect(executed.exit).toBe(0);
    expect(existsSync(dead)).toBe(false);
    expect(existsSync(live)).toBe(true);
    expect(existsSync(unknown)).toBe(true);
  });
});
