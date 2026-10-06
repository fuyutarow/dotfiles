// The detached-execution guard judges shell SYNTAX: a word is not a command, a heredoc body is data
// (2026-10-06, case 1). Each allow is paired with the same construct used for real, still denied.
import { describe, expect, test } from "bun:test";
import { decisionOf, runHook } from "./helpers.ts";

const HOOK = "enforce-supervised-execution.ts";
const run = (command: string) =>
  runHook(HOOK, {
    tool_name: "Bash",
    tool_input: { command },
    cwd: "/home/fuyu/dotfiles",
  });

async function verdict(command: string): Promise<string | undefined> {
  const r = run(command);
  expect(r.code).toBe(0);
  const d = await decisionOf(r.stdout);
  return d.ok ? (d.value.permissionDecision ?? undefined) : undefined;
}

describe("supervised-execution reads syntax, not text", () => {
  test("`at` and friends inside quotes or a heredoc body are allowed", async () => {
    for (const command of [
      `echo "ran at now" && printf '%s\\n' 'batch now' 'crontab x'`,
      `cat > notes.md <<'EOF'\nat now\nbatch 5\ncrontab job\nnohup x &\nsetsid y\nEOF`,
      `cat > notes.md <<EOF\n; at now + 1 minute\n| crontab job\nEOF`,
      `git commit -m "move work at 5pm; at -f job"`,
      `bash -c 'echo nohup is banned'`,
    ])
      expect(await verdict(command)).toBeUndefined();
  });

  test("the same constructs used for real are still denied", async () => {
    for (const command of [
      "at now",
      "at now + 1 minute < job.sh",
      `echo "x" | at 5pm`,
      "batch now",
      "crontab job.txt",
      `cat <<EOF | at now\necho hi\nEOF`,
      `bash <<EOF\nnohup ./x.sh &\nEOF`,
      `echo $(nohup ./x.sh &)`,
      `cat <<EOF\n$(setsid ./x.sh)\nEOF`,
      "sudo at noon",
    ])
      expect(await verdict(command)).toBe("deny");
  });

  test("a pgrep -f poll inside heredoc text is data; a real one is denied", async () => {
    expect(
      await verdict(`cat <<'EOF'\nwhile pgrep -f job; do sleep 1; done\nEOF`),
    ).toBeUndefined();
    expect(await verdict(`while pgrep -f job; do sleep 1; done`)).toBe("deny");
  });

  test("unparseable syntax keeps the text-based fail-closed behaviour", async () => {
    expect(await verdict(`echo 'unterminated; nohup ./x.sh &`)).toBe("deny");
  });
});
