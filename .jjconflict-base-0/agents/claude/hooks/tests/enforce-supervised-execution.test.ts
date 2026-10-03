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
      expect(decision.permissionDecision).toBe("deny");
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
      expect(denial(command).permissionDecision).toBe("deny");
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
      expect(denial(command).permissionDecision).toBe("deny");
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
      "bun ~/.claude/hooks/repo-retrieve.ts literal --query 'setsid'",
      "git status",
      "echo 'nohup is a word in this sentence'",
    ]) {
      const result = runHook(HOOK, bash(command));
      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toBe("");
    }
  });

  // The Bash tool runs `<shell> -c '<command>'`, so `pgrep -f X` inside the command always
  // matches that shell itself — the loop never ends (2026-09-26: shells up to 12.7 h old).
  test("denies self-matching pgrep -f polling loops", () => {
    for (const command of [
      'while pgrep -f "runner2609-comparator-fixed.jl" > /dev/null; do sleep 30; done',
      "until ! kill -0 $(pgrep -f buxb0ewku) 2>/dev/null; do sleep 10; done",
      "while true; do pgrep -af sweep.jl || break; sleep 5; done",
      "while ! pgrep -f server.jl; do sleep 1; done",
      "cd /tmp\nwhile pgrep --full probe.jl; do\n  sleep 5\ndone",
      'pid=$(pgrep -f job.jl | head -1); while kill -0 "$pid"; do sleep 5; done',
    ]) {
      const decision = denial(command);
      expect(decision.permissionDecision).toBe("deny");
      expect(decision.permissionDecisionReason).toContain("pgrep -f");
      expect(decision.permissionDecisionReason).toContain("run_in_background");
    }
  });

  test("allows pgrep without -f, bracketed self-exclusion, loopless pgrep -f, and mentions", () => {
    for (const command of [
      "pgrep -f runner2609",
      "while pgrep julia > /dev/null; do sleep 5; done",
      "pid=$(pgrep -f '[j]ob.jl'); while kill -0 \"$pid\"; do sleep 5; done",
      "while pgrep -f '[r]unner2609.jl' > /dev/null; do sleep 30; done",
      "bun ~/.claude/hooks/repo-retrieve.ts literal --query 'while pgrep -f foo'",
      'while read -r line; do echo "$line"; done < pids.txt',
    ]) {
      const result = runHook(HOOK, bash(command));
      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toBe("");
    }
  });

  test("reports a detacher and a self-matching poll together in ONE deny", () => {
    const reason = denial(
      "nohup ./sweep.sh & while pgrep -f sweep.sh; do sleep 5; done",
    ).permissionDecisionReason;
    expect(reason).toContain("2 independent problems");
    expect(reason).toContain("nohup");
    expect(reason).toContain("pgrep -f");
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
    expect(decisionOf(result.stdout).permissionDecision).toBe("deny");
  });
});
