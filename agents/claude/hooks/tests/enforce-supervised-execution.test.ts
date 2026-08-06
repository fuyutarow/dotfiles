import { describe, expect, test } from "bun:test";
import { decisionOf, runHook } from "./helpers.ts";

const HOOK = "enforce-supervised-execution.ts";

const bash = (command: string) => ({
  tool_name: "Bash",
  tool_input: { command },
  cwd: "/home/fuyu/dotfiles",
});

function denial(command: string) {
  const result = runHook(HOOK, bash(command));
  expect(result.code).toBe(0);
  return decisionOf(result.stdout);
}

describe("enforce-supervised-execution", () => {
  test("denies the detachers that orphan work to init", () => {
    for (const command of [
      "setsid ./queue9.sh",
      "setsid bash /tmp/scratchpad/queue9.sh > q.log 2>&1",
      "cd /home/fuyu/Workspace/firedancer && setsid ./run.sh &",
      "nohup julia probe.jl > out.log 2>&1 &",
      "nohup ./sweep.sh &",
      "./long-job.sh & disown",
      "/usr/bin/setsid ./queue.sh",
    ]) {
      const decision = denial(command);
      expect(decision?.permissionDecision).toBe("deny");
      expect(decision.permissionDecisionReason).toContain(
        "supervised-execution",
      );
    }
  });

  test("denies detachers hidden in a nested shell string", () => {
    for (const command of [
      `bash -c 'nohup ./sweep.sh &'`,
      `sh -c "setsid ./queue.sh"`,
      `zsh -c 'julia probe.jl & disown'`,
    ]) {
      expect(denial(command)?.permissionDecision).toBe("deny");
    }
  });

  test("denies detached tmux/screen launches and deferred scheduling", () => {
    for (const command of [
      "tmux new-session -d -s queue9 './queue9.sh'",
      "tmux new -d -s gpu 'julia probe.jl'",
      "screen -dm ./queue.sh",
      "at now + 1 minute < job.sh",
      "batch now",
      "crontab - < mycron",
    ]) {
      expect(denial(command)?.permissionDecision).toBe("deny");
    }
  });

  test("names the three sanctioned routes instead of only forbidding", () => {
    const reason = denial("nohup ./sweep.sh &").permissionDecisionReason;
    expect(reason).toContain("run_in_background");
    expect(reason).toContain("agent-resource-run");
    expect(reason).toContain("systemd-run --user --unit=");
    expect(reason).toContain("STOP and say so");
  });

  // The runner this whole policy funnels work into is itself `setsid --wait systemd-run …`.
  // If that were denied, the gate would forbid the only compliant path — self-defeating.
  test("allows supervised setsid --wait, including agent-resource-run's own launch", () => {
    for (const command of [
      "setsid --wait systemd-run --user --scope --unit=agent-resource-1 taskset -c 0,1 julia probe.jl",
      "setsid -w ./job.sh",
      "setsid --wait ./job.sh",
    ]) {
      const result = runHook(HOOK, bash(command));
      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toBe("");
    }
  });

  test("allows the observable-durability escape and ordinary commands", () => {
    for (const command of [
      "systemd-run --user --unit=agent-job-sweep --collect julia probe.jl",
      "systemctl --user stop agent-job-sweep",
      "journalctl --user -u agent-job-sweep -f",
      "agent-resource-run --manifest /abs/path.resource.json -- julia probe.jl",
      "tmux attach -t queue9",
      "tmux list-sessions",
      "crontab -l",
      "bun ~/.claude/hooks/repo-search.ts literal --query 'setsid'",
      "git status",
      "echo 'nohup is a word in this sentence'",
    ]) {
      const result = runHook(HOOK, bash(command));
      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toBe("");
    }
  });

  test("ignores non-Bash tools", () => {
    const result = runHook(HOOK, {
      tool_name: "Read",
      tool_input: { file_path: "/tmp/setsid-notes.md" },
    });
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  test("fails closed on a malformed payload", () => {
    const result = runHook(HOOK, "{not json");
    expect(result.code).toBe(0);
    expect(decisionOf(result.stdout)?.permissionDecision).toBe("deny");
  });
});
