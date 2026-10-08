import { expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { jsonOf } from "../../shared/src/zod.ts";
import { plan } from "../src/engine.ts";
import { createLivenessSnapshot, readSessions } from "../src/liveness/facts.ts";
import { Plan, ReceiptV2 } from "../src/model.ts";
import { registry } from "../src/targets/index.ts";
import { cliEnv } from "./fixtures/cli-env.ts";
import { procFixture } from "./fixtures/procs.ts";
import { World } from "./jj/fixture.ts";

const script = resolve(import.meta.dir, "fixtures/cli-fixture.ts");
const uuid = (n: number) => `${n}23e4567-e89b-42d3-a456-426614174000`;
function session(
  home: string,
  scratchRoot: string,
  id: string,
  state: "dead" | "live" | "unknown",
) {
  const dir = join(scratchRoot, "project", id, "scratchpad");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "scratch.txt"), `scratch ${state}`);
  mkdirSync(join(home, ".claude/sessions"), { recursive: true });
  const transcript = join(home, ".claude/projects/project", `${id}.jsonl`);
  mkdirSync(join(transcript, ".."), { recursive: true });
  if (state !== "unknown") {
    writeFileSync(transcript, "{}\n");
    if (state === "dead") utimesSync(transcript, 1, 1);
  }
  return dir;
}
function invoke(w: World, env: ReturnType<typeof cliEnv>, args: string[]) {
  const result = Bun.spawnSync([process.execPath, script, ...args], {
    cwd: w.root,
    env: {
      ...env,
      RECLAIM_UNIT_PROC_ROOT: join(w.root, "proc"),
      JJ_CONFIG: w.env.JJ_CONFIG,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: w.env.GIT_CONFIG_GLOBAL,
    },
    timeout: 30_000,
  });
  return {
    exit: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}
function validPlan(result: ReturnType<typeof invoke>): Plan {
  expect(result.exit, `${result.stdout}\n${result.stderr}`).toBe(0);
  const parsed = jsonOf(Plan).safeParse(result.stdout);
  if (!parsed.success) {
    expect(parsed.error.message).toBe("");
    process.exit(1);
  }
  expect(result.stdout.trim().split("\n")).toHaveLength(1);
  return parsed.data;
}

test("tmp HOME CLI plans all 12 targets and blind run deletes only safe scratch, pushed workspaces, and caches; v2 receipts persist", () => {
  const w = new World();
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    w.dispose();
  });
  const scratchRoot = join(w.root, `claude-${process.getuid?.() ?? 0}`);
  const env = cliEnv(w.root, {
    repoRoots: [w.repo],
    scratchRoots: [scratchRoot],
  });
  procFixture(w.root, "sshd");
  const nested = session(env.HOME, scratchRoot, uuid(1), "dead");
  const plain = session(env.HOME, scratchRoot, uuid(2), "dead");
  const live = session(env.HOME, scratchRoot, uuid(3), "live");
  const unknown = session(env.HOME, scratchRoot, uuid(4), "unknown");
  const unpushed = session(env.HOME, scratchRoot, uuid(5), "dead");
  const nestedWs = w.add("nested", join(nested, "repo"));
  const unpushedWs = w.add("unpushed", join(unpushed, "repo"));
  w.write(unpushedWs, "work.txt", "not pushed");
  w.jj(unpushedWs, "commit", "-m", "unpublished work");
  const cache = join(env.HOME, ".cache/pip");
  const build = join(env.HOME, "project/node_modules");
  const retained = join(env.HOME, ".cache/research-output");
  const grave = join(env.GRAVEYARD, "owner-only");
  for (const dir of [cache, build, retained, grave]) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "data"), "fixture");
  }

  const preview = validPlan(invoke(w, env, ["plan", "--json"]));
  expect(preview.schema).toBe("reclaim.plan/1");
  expect(preview.targets.map((t) => [t.name, t.tier])).toEqual(
    registry.map((t) => [t.name, t.tier]),
  );
  expect(preview.targets).toHaveLength(12);
  const workspaces = preview.targets.find((t) => t.name === "workspaces")!;
  expect(workspaces.candidates.find((c) => c.path === nestedWs)?.verdict).toBe(
    "RECLAIM",
  );
  expect(
    workspaces.candidates.find((c) => c.path === unpushedWs)?.verdict,
  ).toBe("ASK");
  const scratch = preview.targets.find((t) => t.name === "scratch")!;
  expect(scratch.candidates.find((c) => c.path === nested)?.reason).toBe(
    "delegated: jj workspace",
  );
  expect(scratch.candidates.find((c) => c.path === plain)?.verdict).toBe(
    "RECLAIM",
  );
  expect(scratch.candidates.find((c) => c.path === live)?.verdict).toBe("KEEP");
  expect(scratch.candidates.find((c) => c.path === unknown)?.verdict).toBe(
    "ASK",
  );
  expect(existsSync(join(env.RECLAIM_STATE_DIR, "log.jsonl"))).toBe(false);
  expect(
    [nestedWs, plain, cache, build].every((path) => existsSync(path)),
  ).toBe(true);

  const result = invoke(w, env, ["run", "--tier", "blind", "--yes", "--json"]);
  expect(result.exit, `blind run: ${result.stderr}\n${result.stdout}`).toBe(0);
  const executed = validPlan(result);
  expect(executed.targets.map((t) => t.name)).toEqual([
    "clean",
    "builds",
    "rust",
    "toolchains",
    "workspaces",
    "scratch",
    "system",
  ]);
  for (const removed of [nestedWs, nested, plain, cache, build])
    expect(
      existsSync(removed),
      `not removed: ${removed}\n${JSON.stringify(executed.targets.flatMap((t) => t.candidates))}`,
    ).toBe(false);
  for (const kept of [
    w.repo,
    unpushedWs,
    unpushed,
    live,
    unknown,
    retained,
    grave,
  ])
    expect(existsSync(kept)).toBe(true);
  expect(w.workspaceNames()).toEqual(["default", "unpushed"]);
  expect(readFileSync(join(unpushedWs, "work.txt"), "utf8")).toBe("not pushed");

  const lines = readFileSync(join(env.RECLAIM_STATE_DIR, "log.jsonl"), "utf8")
    .trim()
    .split("\n");
  expect(lines).toHaveLength(7);
  const receipts = lines.map((line) => {
    const parsed = jsonOf(ReceiptV2).safeParse(line);
    if (!parsed.success) {
      expect(parsed.error.message).toBe("");
      process.exit(1);
    }
    return parsed.data;
  });
  expect(receipts.map((r) => r.target)).toEqual(
    executed.targets.map((t) => t.name),
  );
  const workspaceReceipt = receipts.find((r) => r.target === "workspaces")!;
  expect(workspaceReceipt.actions).toHaveLength(1);
  expect(workspaceReceipt.actions[0]).toMatchObject({
    path: nestedWs,
    ok: true,
    verdict_at_act: "RECLAIM",
    recovery: { repo: w.repo, workspace: "nested" },
  });
  expect(workspaceReceipt.actions[0]?.recovery?.commit_id).toMatch(
    /^[0-9a-f]+$/u,
  );
  expect(
    receipts
      .flatMap((r) => r.actions)
      .every((a) => a.verdict_at_act === "RECLAIM" && a.ok),
  ).toBe(true);
  expect(existsSync(join(env.RECLAIM_STATE_DIR, "lock"))).toBe(false);
}, 30_000);

test("one plan shares one process and registry scan between workspaces and scratch", async () => {
  const w = new World();
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    w.dispose();
  });
  const scratchRoot = join(w.root, "scratch");
  const nested = session(w.env.HOME, scratchRoot, uuid(1), "dead");
  session(w.env.HOME, scratchRoot, uuid(2), "dead");
  const ws = w.add("nested", join(nested, "repo"));
  const procs = procFixture(w.root, "sshd", ["cwd", "fd", "environ"]);
  const context = w.context("plan", {
    repo_roots: [w.repo],
    scratch_roots: [scratchRoot],
    ignore_unreadable_procs: ["sshd"],
  });
  let snapshots = 0;
  let registries = 0;
  const result = await plan(
    registry.filter((t) => ["workspaces", "scratch"].includes(t.name)),
    {
      context,
      headroom: { drives: [] },
      captureLiveness: (config) => {
        snapshots++;
        return createLivenessSnapshot(config, {
          home: w.env.HOME,
          procs,
          probes: {
            readSessions: (dir) => {
              registries++;
              return readSessions(dir);
            },
          },
        });
      },
    },
  );
  expect(result.exit, result.error ?? "plan failed").toBe(0);
  expect(
    result.plan?.targets[0]?.candidates.find((c) => c.path === ws)?.verdict,
  ).toBe("RECLAIM");
  expect(
    result.plan?.targets[1]?.candidates.some((c) => c.verdict === "RECLAIM"),
  ).toBe(true);
  expect([snapshots, procs.scans(), registries]).toEqual([1, 1, 1]);
});

test("--fetch is off by default, works on plan and blind run, and fetch failure yields ASK", () => {
  const w = new World();
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    w.dispose();
  });
  const env = cliEnv(w.root, { repoRoots: [w.root] });
  procFixture(w.root, "sshd");
  const ws = w.add("pushed");
  const producer = join(w.root, "producer");
  w.jj(w.root, "git", "clone", w.remote, producer);
  w.jj(producer, "new", "main@origin");
  w.jj(producer, "bookmark", "track", "main@origin");
  w.write(producer, "advanced.txt", "advance the bare remote");
  w.jj(producer, "commit", "-m", "advance remote");
  w.jj(producer, "bookmark", "set", "main", "-r", "@-");
  w.jj(producer, "git", "push", "-b", "main");
  const operations = () =>
    w.jj(
      w.repo,
      "--ignore-working-copy",
      "op",
      "log",
      "--no-graph",
      "-T",
      'description ++ "\\n"',
    );
  validPlan(invoke(w, env, ["plan", "workspaces", "--json"]));
  expect(operations()).not.toContain("fetch from git remote");
  expect(
    w.jj(
      w.repo,
      "--ignore-working-copy",
      "log",
      "--no-graph",
      "-r",
      "main@origin",
      "-T",
      "description",
    ),
  ).not.toContain("advance remote");
  const fetched = validPlan(
    invoke(w, env, ["plan", "workspaces", "--fetch", "--json"]),
  );
  const fetchedCandidate = fetched.targets[0]?.candidates.find(
    (c) => c.path === ws,
  );
  expect(fetchedCandidate?.verdict, fetchedCandidate?.reason).toBe("RECLAIM");
  expect(operations()).toContain("fetch from git remote");
  expect(
    w.jj(
      w.repo,
      "--ignore-working-copy",
      "log",
      "--no-graph",
      "-r",
      "main@origin",
      "-T",
      "description",
    ),
  ).toContain("advance remote");
  w.jj(
    w.repo,
    "git",
    "remote",
    "set-url",
    "origin",
    join(w.root, "absent-remote.git"),
  );
  const failed = validPlan(
    invoke(w, env, ["plan", "workspaces", "--fetch", "--json"]),
  );
  expect(
    failed.targets[0]?.candidates.find((c) => c.path === ws),
  ).toMatchObject({ verdict: "ASK" });
  expect(failed.targets[0]?.candidates[0]?.reason).toContain("fetch failed");
  w.jj(w.repo, "git", "remote", "set-url", "origin", w.remote);
  const executed = validPlan(
    invoke(w, env, ["run", "--tier", "blind", "--yes", "--fetch", "--json"]),
  );
  expect(
    executed.targets.find((t) => t.name === "workspaces")?.candidates[0]?.result
      ?.ok,
  ).toBe(true);
  expect(existsSync(ws)).toBe(false);
}, 30_000);
