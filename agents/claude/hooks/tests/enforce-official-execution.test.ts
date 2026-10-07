import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decisionOf as decisionResult, runHook, tempDir } from "./helpers.ts";

const HOOK = "enforce-official-execution.ts";

// Two throwaway firedancer working copies: a jj one (colocated, like the main checkout) and a
// plain git one (like the firedancer-simplify worktree), each with a committed test script, a
// committed-then-edited one, and an untracked `scratch.jl`; plus a scratch dir outside both.
const base = tempDir("fd-official-");
const jj = join(base, "fd-jj");
const gt = join(base, "fd-git");
const scratch = join(base, "scratchpad");
const elsewhere = join(base, "elsewhere");

function seed(root: string): void {
  for (const f of [
    "launcher/launch.ts",
    "packages/ModelRegistry.jl",
    "packages/FireOps.jl/test/x.jl",
    "packages/FireOps.jl/test/edited.jl",
    "envs/gpu/Project.toml",
  ]) {
    mkdirSync(join(root, f, ".."), { recursive: true });
    writeFileSync(join(root, f), "# seed\n");
  }
}
function run(cmd: string, args: string[], cwd: string): void {
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
    },
  });
  expect(r.status, `${cmd} ${args.join(" ")}: ${r.stderr}`).toBe(0);
}

beforeAll(() => {
  for (const d of [jj, gt, scratch, elsewhere]) mkdirSync(d, { recursive: true });
  seed(jj);
  run("jj", ["git", "init", "--colocate", "."], jj);
  run("jj", ["--config", "user.name=t", "--config", "user.email=t@t", "commit", "-m", "base"], jj);
  seed(gt);
  run("git", ["init", "-q"], gt);
  run("git", ["add", "-A"], gt);
  run("git", ["commit", "-q", "-m", "base"], gt);
  for (const root of [jj, gt]) {
    writeFileSync(join(root, "packages/FireOps.jl/test/edited.jl"), "# edited\n");
    writeFileSync(join(root, "scratch.jl"), "# untracked\n");
  }
  writeFileSync(join(scratch, "s.jl"), "println(1)\n");
  writeFileSync(join(elsewhere, "e.jl"), "println(2)\n");
});
afterAll(() => {
  spawnSync("rm", ["-rf", base]);
});

async function verdict(command: string, cwd: string) {
  const r = runHook(HOOK, { tool_name: "Bash", tool_input: { command }, cwd });
  expect(r.code).toBe(0);
  if (r.stdout.trim() === "") return { denied: false, reason: "" };
  const d = await decisionResult(r.stdout);
  expect(d.ok).toBe(true);
  const value = d.ok ? d.value : {};
  return {
    denied: value.permissionDecision === "deny",
    reason: value.permissionDecisionReason ?? "",
  };
}

type Case = [label: string, command: () => string, cwd: () => string, deny: boolean];
const cases: Case[] = [
  // --- allowed ---------------------------------------------------------------------------
  ["launcher via bun", () => "bun launcher/launch.ts --rev abc arena launcher/model_interface_runner.jl p.toml m cause", () => jj, false],
  ["launcher via mise", () => "mise exec -- bun launcher/launch.ts --rev abc arena launcher/model_interface_runner.jl p.toml m c", () => jj, false],
  ["launcher via agent-resource-run", () => "agent-resource-run --manifest /tmp/m.resource.json -- mise exec -- bun launcher/launch.ts --rev a b c d e", () => jj, false],
  ["tracked repo test (jj)", () => "julia --project=envs/gpu packages/FireOps.jl/test/x.jl", () => jj, false],
  ["tracked repo test (git)", () => "julia --project=envs/gpu packages/FireOps.jl/test/x.jl", () => gt, false],
  ["modified tracked file (jj)", () => "julia --project=envs/gpu packages/FireOps.jl/test/edited.jl", () => jj, false],
  ["modified tracked file (git)", () => "julia --project=envs/gpu packages/FireOps.jl/test/edited.jl", () => gt, false],
  ["tracked test by absolute path from outside", () => `julia --project=${jj}/envs/gpu ${jj}/packages/FireOps.jl/test/x.jl`, () => elsewhere, false],
  ["--version inside firedancer", () => "julia --version", () => jj, false],
  ["--version with project", () => "julia --project=envs/gpu --version", () => jj, false],
  ["julia, no firedancer project, cwd outside, script", () => `julia ${scratch}/s.jl`, () => elsewhere, false],
  ["julia -e outside firedancer", () => `julia -e 'println(1)'`, () => elsewhere, false],
  ["julia REPL-ish --project=@temp outside", () => `julia --project=@temp ${elsewhere}/e.jl`, () => elsewhere, false],
  ["word julia as an argument", () => "rr text julia", () => jj, false],
  ["pgrep julia", () => "pgrep -f julia", () => jj, false],
  ["tracked test chained", () => "cd /tmp && cd " + jj + " && julia --project=envs/gpu packages/FireOps.jl/test/x.jl | tail -3", () => elsewhere, false],
  // --- (a) script outside every working copy, firedancer project or cwd ----------------------
  ["(a) scratch script, cwd in firedancer", () => `julia ${scratch}/s.jl`, () => jj, true],
  ["(a) scratch script, --project into firedancer", () => `julia --project=${jj}/envs/gpu ${scratch}/s.jl`, () => elsewhere, true],
  ["(a) relative scratch path, project relative", () => "julia --project=envs/gpu ../scratchpad/s.jl", () => jj, true],
  ["(a) JULIA_PROJECT env", () => `JULIA_PROJECT=${jj}/envs/gpu julia ${scratch}/s.jl`, () => elsewhere, true],
  ["(a) /tmp script", () => "julia /tmp/probe.jl", () => gt, true],
  ["(a) home script", () => "julia ~/probe.jl", () => jj, true],
  ["(a) --project bare", () => `julia --project ${scratch}/s.jl`, () => jj, true],
  ["(a) -L load of scratch", () => `julia --project=envs/gpu -L ${scratch}/s.jl packages/FireOps.jl/test/x.jl`, () => jj, true],
  ["(a) $VAR path in firedancer", () => "julia --project=envs/gpu $SCRIPT", () => jj, true],
  // --- (b) inline, stdin, REPL ---------------------------------------------------------------
  ["(b) -e", () => `julia --project=envs/gpu -e 'println(1)'`, () => jj, true],
  ["(b) -E", () => `julia --project=envs/gpu -E '1+1'`, () => jj, true],
  ["(b) --eval", () => `julia --project=envs/gpu --eval 'using Pkg'`, () => jj, true],
  ["(b) --eval= outside cwd, project inside", () => `julia --project=${jj}/envs/gpu --eval='1'`, () => elsewhere, true],
  ["(b) -e attached", () => `julia -e'1'`, () => gt, true],
  ["(b) heredoc", () => "julia --project=envs/gpu <<'EOF'\nprintln(1)\nEOF", () => jj, true],
  ["(b) stdin dash", () => "julia --project=envs/gpu -", () => jj, true],
  ["(b) pipe into julia", () => "echo 'println(1)' | julia --project=envs/gpu", () => jj, true],
  ["(b) bare REPL", () => "julia --project=envs/gpu", () => jj, true],
  ["(b) bare julia in firedancer cwd", () => "julia", () => gt, true],
  // --- (c) untracked in a working copy -------------------------------------------------------
  ["(c) untracked jj", () => "julia --project=envs/gpu scratch.jl", () => jj, true],
  ["(c) untracked git", () => "julia --project=envs/gpu scratch.jl", () => gt, true],
  ["(c) untracked, cwd and project outside", () => `julia ${jj}/scratch.jl`, () => elsewhere, true],
  ["(c) not yet written (heredoc then run)", () => "cat > new.jl <<'EOF'\nprintln(1)\nEOF\njulia --project=envs/gpu new.jl", () => jj, true],
  // --- wrapped and chained forms -------------------------------------------------------------
  ["wrap: agent-resource-run", () => `agent-resource-run --manifest /tmp/m.json -- julia --project=envs/gpu ${scratch}/s.jl`, () => jj, true],
  ["wrap: mise exec", () => `mise exec -- julia --project=envs/gpu -e '1'`, () => jj, true],
  ["wrap: mise x with tool spec", () => `mise x julia@1.13 -- julia -e '1'`, () => jj, true],
  ["wrap: env assignment", () => `env JULIA_NUM_THREADS=4 julia --project=envs/gpu -e '1'`, () => jj, true],
  ["wrap: inline assignment", () => `JULIA_NUM_THREADS=4 julia --project=envs/gpu -e '1'`, () => jj, true],
  ["wrap: timeout", () => `timeout 60 julia --project=envs/gpu scratch.jl`, () => jj, true],
  ["wrap: nice", () => `nice -n 10 julia --project=envs/gpu scratch.jl`, () => jj, true],
  ["wrap: setsid --wait", () => `setsid --wait julia --project=envs/gpu scratch.jl`, () => jj, true],
  ["wrap: taskset", () => `taskset -c 0,1 julia --project=envs/gpu scratch.jl`, () => jj, true],
  ["wrap: bash -c", () => `bash -c 'julia --project=envs/gpu -e "1"'`, () => jj, true],
  ["wrap: sh -c in agent-resource-run in mise", () => `mise exec -- agent-resource-run --manifest /tmp/m.json -- sh -c 'julia --project=envs/gpu scratch.jl'`, () => jj, true],
  ["wrap: full julia path", () => `/home/fuyu/.local/share/mise/installs/julia/1.13/bin/julia --project=envs/gpu scratch.jl`, () => jj, true],
  ["chain: ;", () => `echo hi; julia --project=envs/gpu scratch.jl`, () => jj, true],
  ["chain: &&", () => `cd ${jj} && julia scratch.jl`, () => elsewhere, true],
  ["chain: pipeline", () => `julia --project=envs/gpu scratch.jl | tee out.log`, () => jj, true],
  ["chain: second julia bad", () => `julia --version && julia --project=envs/gpu -e '1'`, () => jj, true],
  ["wrapped tracked still allowed", () => `agent-resource-run --manifest /tmp/m.json -- julia --project=envs/gpu packages/FireOps.jl/test/x.jl`, () => jj, false],
  ["chained tracked still allowed", () => `echo hi; timeout 60 julia --project=envs/gpu packages/FireOps.jl/test/x.jl && echo ok`, () => gt, false],
];

describe("enforce-official-execution", () => {
  for (const [label, command, cwd, deny] of cases) {
    test(`${deny ? "denies" : "allows"}: ${label}`, async () => {
      const v = await verdict(command(), cwd());
      expect(v.denied).toBe(deny);
    });
  }

  test("the denial names the official route", async () => {
    const v = await verdict(`julia --project=envs/gpu ${scratch}/s.jl`, jj);
    expect(v.reason).toContain("official-execution:");
    expect(v.reason).toContain(
      "scratch execution is banned in firedancer: measure through `mise exec -- bun launcher/launch.ts --rev <sealed sha> <arena> launcher/model_interface_runner.jl <params.toml> <manifest> <cause>`; put diagnostics in a tracked, committed script.",
    );
  });

  test("ignores non-Bash tools and commands without julia", async () => {
    expect(runHook(HOOK, { tool_name: "Read", tool_input: { command: "julia -e 1" }, cwd: jj }).stdout).toBe("");
    expect((await verdict("ls -la", jj)).denied).toBe(false);
  });

  test("fails closed on an invalid payload", async () => {
    const r = runHook(HOOK, "not json");
    const d = await decisionResult(r.stdout);
    expect(d.ok && d.value.permissionDecision).toBe("deny");
  });
});
