import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { decisionOf as decisionResult, runHook, tempDir } from "./helpers.ts";

async function decisionOf(stdout: string) {
  const result = await decisionResult(stdout);
  expect(result.ok).toBe(true);
  if (result.ok) return result.value;
  return {};
}

const HOOK = "enforce-no-new-bash.ts";

const lines = (n: number, head = "#!/bin/sh") =>
  [head, ...Array.from({ length: n - 1 }, (_, i) => `echo ${i}`)].join("\n") +
  "\n";

const write = (file_path: string, content: string) => ({
  tool_name: "Write",
  tool_input: { file_path, content },
});
const edit = (file_path: string, old_string: string, new_string: string) => ({
  tool_name: "Edit",
  tool_input: { file_path, old_string, new_string },
});

function fixture(name: string, content: string): string {
  const p = join(tempDir("nonewbash-"), name);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  return p;
}

describe("enforce-no-new-bash", () => {
  test("allows two added aliases in shebang-bearing zsh configuration", () => {
    const p = fixture("zsh/aliases.zsh", lines(1136, "#!/bin/zsh"));
    const r = runHook(
      HOOK,
      edit(p, "echo 3\n", "echo 3\nalias cpa='cp -a'\nalias cpv='cp -v'\n"),
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("exempts shell configuration paths even with automation extensions or shebangs", () => {
    const dir = tempDir("nonewbash-");
    for (const name of [
      "zsh/tests/x.test.zsh",
      "zsh/legacy.sh",
      "config/interactive.zsh",
      "config/x.test.zsh",
      "zshrc",
      ".zshrc",
      "zshrc.local",
      ".zshrc.local",
      "zprofile.mac",
      ".zprofile.wsl",
      "zshenv",
      ".zshenv.local",
    ]) {
      const r = runHook(HOOK, write(join(dir, name), lines(40)));
      expect(r.code).toBe(0);
      expect(r.stdout).toBe("");
    }
  });

  test("still refuses a new 40-line automation script outside config paths", async () => {
    const dir = tempDir("nonewbash-");
    for (const name of ["foo.sh", "zsh-tools/foo.sh", "zshrc-helper.sh"]) {
      const r = runHook(HOOK, write(join(dir, name), lines(40)));
      expect(r.code).toBe(0);
      const d = await decisionOf(r.stdout);
      expect(d.permissionDecision).toBe("deny");
      expect(d.permissionDecisionReason).toContain("[dotfiles:no-new-bash]");
      expect(d.permissionDecisionReason).toContain("40 lines");
      expect(d.permissionDecisionReason).toContain("one .ts file run by bun");
      expect(d.permissionDecisionReason).toContain(
        "Splitting a script into several shell files is not a fix.",
      );
    }
  });

  test("nudges a small new .sh through additionalContext, without a decision", async () => {
    const r = runHook(
      HOOK,
      write(join(tempDir("nonewbash-"), "x.sh"), lines(5)),
    );
    expect(r.code).toBe(0);
    const d = await decisionOf(r.stdout);
    expect(d.permissionDecision).toBeUndefined();
    expect(d.additionalContext).toContain("no-new-bash");
    expect(d.additionalContext).toContain("bun");
    expect(d.additionalContext).toContain("# shim:");
    expect(d.additionalContext).toContain("one .ts file run by bun");
    expect(d.additionalContext).toContain(
      "Splitting a script into several shell files is not a fix.",
    );
  });

  test("12 lines passes, 13 lines is denied for a new file", async () => {
    const dir = tempDir("nonewbash-");
    expect(
      (
        await decisionOf(
          runHook(HOOK, write(join(dir, "a.sh"), lines(12))).stdout,
        )
      ).permissionDecision,
    ).toBeUndefined();
    const d = await decisionOf(
      runHook(HOOK, write(join(dir, "b.sh"), lines(13))).stdout,
    );
    expect(d.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain("13 lines");
    expect(d.permissionDecisionReason).toContain("new file");
  });

  test("an Edit that grows a script past the limit is denied", async () => {
    const p = fixture("grow.sh", lines(12));
    const d = await decisionOf(
      runHook(HOOK, edit(p, "echo 3\n", "echo 3\necho extra\n")).stdout,
    );
    expect(d.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain("was 12");
  });

  test("a legacy script over the limit may be fixed without growing, with a nudge", async () => {
    const p = fixture("legacy.sh", lines(40));
    const same = await decisionOf(
      runHook(HOOK, edit(p, "echo 3\n", "echo three\n")).stdout,
    );
    expect(same.permissionDecision).toBeUndefined();
    expect(same.additionalContext).toContain("no-new-bash");
    const grown = await decisionOf(
      runHook(HOOK, edit(p, "echo 3\n", "echo 3\necho 3b\n")).stdout,
    );
    expect(grown.permissionDecision).toBe("deny");
  });

  test("detects shell by shebang when the path has no .sh extension", async () => {
    const dir = tempDir("nonewbash-");
    for (const head of [
      "#!/usr/bin/env bash",
      "#!/bin/zsh",
      "#!/usr/bin/env -S bash -eu",
    ]) {
      const d = await decisionOf(
        runHook(HOOK, write(join(dir, "tool"), lines(20, head))).stdout,
      );
      expect(d.permissionDecision).toBe("deny");
    }
  });

  test("ignores non-shell files, zsh config, and bun scripts", () => {
    const dir = tempDir("nonewbash-");
    const cases: Array<[string, string]> = [
      ["x.ts", lines(50, "// ts")],
      ["zshrc", lines(50, "# zsh config")],
      ["tool", lines(50, "#!/usr/bin/env bun")],
      ["notes.md", lines(50, "# heading")],
    ];
    for (const [name, content] of cases) {
      const r = runHook(HOOK, write(join(dir, name), content));
      expect(r.code).toBe(0);
      expect(r.stdout).toBe("");
    }
  });

  test("vendored and on-disk bootstrap shims are exempt; a new file cannot self-declare bootstrap", async () => {
    const vendored = fixture(
      "herdr.sh",
      lines(40, "#!/bin/sh\n# installed by herdr"),
    );
    expect(
      runHook(HOOK, edit(vendored, "echo 3\n", "echo 3\necho 4b\n")).stdout,
    ).toBe("");

    const boot = fixture(
      "link.sh",
      lines(200, "#!/usr/bin/env bash\n# shim: bootstrap"),
    );
    expect(
      runHook(HOOK, edit(boot, "echo 3\n", "echo 3\nln -s a b\n")).stdout,
    ).toBe("");

    const fresh = join(tempDir("nonewbash-"), "new.sh");
    const d = await decisionOf(
      runHook(HOOK, write(fresh, lines(20, "#!/bin/sh\n# shim: bootstrap")))
        .stdout,
    );
    expect(d.permissionDecision).toBe("deny");
  });

  test("an Edit whose old_string is absent is left to the tool to fail", () => {
    const p = fixture("miss.sh", lines(12));
    const r = runHook(HOOK, edit(p, "not there", "x\n".repeat(30)));
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("MultiEdit is replayed in order", async () => {
    const p = fixture("multi.sh", lines(12));
    const r = runHook(HOOK, {
      tool_name: "MultiEdit",
      tool_input: {
        file_path: p,
        edits: [
          { old_string: "echo 1\n", new_string: "echo 1\necho 1b\n" },
          { old_string: "echo 1b\n", new_string: "echo 1b\necho 1c\n" },
        ],
      },
    });
    expect((await decisionOf(r.stdout)).permissionDecisionReason).toContain(
      "14 lines",
    );
  });
});

describe("Bash shell write routes", () => {
  const bash = (command: string, cwd = tempDir("bash-write-")) =>
    runHook(HOOK, {
      tool_name: "Bash",
      cwd,
      tool_input: { command },
    });
  const heredoc = (n: number, target = "x.sh", producer = "cat") =>
    `${producer} > '${target}' <<'EOF'\n${lines(n)}EOF\n`;

  test("denies printf brace expansion, 13-line heredoc and tee writes", async () => {
    for (const command of [
      "printf '%s\\n' {1..13} > x.sh",
      heredoc(13),
      `tee x.sh <<'EOF'\n${lines(13)}EOF\n`,
      `cat <<'EOF' | tee x.sh\n${lines(13)}EOF\n`,
      "cat source > x.bash",
      "printf '%s\\n' {1..13} | command tee -- x.sh",
      `sh -c ${JSON.stringify("printf '%s\\n' {1..13} > x.sh")}`,
    ]) {
      const result = bash(command);
      expect(result.code).toBe(0);
      const decision = await decisionOf(result.stdout);
      expect(decision.permissionDecision).toBe("deny");
      expect(decision.permissionDecisionReason).toContain("bun");
      expect(decision.permissionDecisionReason).toContain(
        "A shell file is allowed only as a thin shim that execs it",
      );
      expect(decision.permissionDecisionReason).toContain(
        "Splitting a script into several shell files is not a fix.",
      );
    }
  });

  test("allows 5 and 12-line literal heredocs and non-shell writes", () => {
    for (const command of [
      heredoc(5),
      heredoc(12),
      heredoc(13, "notes.txt"),
      "printf '%s\\n' {1..13} > notes.md",
      "tee notes.txt",
      "echo 'tee x.sh > x.sh'",
    ]) {
      const result = bash(command);
      expect(result.code).toBe(0);
      expect(result.stdout).toBe("");
    }
  });

  test("append and successive writes use the resulting physical line count", async () => {
    const cwd = tempDir("bash-write-");
    writeFileSync(join(cwd, "x.sh"), lines(12));
    const result = bash("cat >> x.sh <<'EOF'\necho more\nEOF\n", cwd);
    expect((await decisionOf(result.stdout)).permissionDecision).toBe("deny");
    const multi = `${heredoc(5)}${heredoc(5).replace(">", ">>")}${heredoc(5).replace(">", ">>")}`;
    expect((await decisionOf(bash(multi).stdout)).permissionDecision).toBe(
      "deny",
    );
  });

  test("unknown expansion, loops, dynamic targets and unsupported syntax fail closed", async () => {
    for (const command of [
      "cat > x.sh <<EOF\n$BODY\nEOF\n",
      "tee x.sh",
      'cat > "$OUT"',
      "for i in {1..13}; do cat >> x.sh <<'EOF'\nx\nEOF\ndone",
      "case x in x) cat > x.sh;; esac",
    ]) {
      const decision = await decisionOf(bash(command).stdout);
      expect(decision.permissionDecision).toBe("deny");
      expect(decision.permissionDecisionReason).toContain(
        "one .ts file run by bun",
      );
      expect(decision.permissionDecisionReason).toContain(
        "A shell file is allowed only as a thin shim that execs it",
      );
      expect(decision.permissionDecisionReason).toContain(
        "Splitting a script into several shell files is not a fix.",
      );
    }
  });

  test("preserves legacy no-growth and existing bootstrap/herdr exemptions", () => {
    const cwd = tempDir("bash-write-");
    writeFileSync(join(cwd, "legacy.sh"), lines(40));
    writeFileSync(join(cwd, "boot.sh"), "# shim: bootstrap\n");
    writeFileSync(join(cwd, "herdr.sh"), "# installed by herdr\n");
    for (const command of [
      heredoc(40, "legacy.sh"),
      "tee boot.sh",
      "tee herdr.sh",
    ]) {
      expect(bash(command, cwd).stdout).toBe("");
    }
  });
});

test("blank heredoc append counts physical blank lines; tee -- preserves dash filenames", async () => {
  const cwd = tempDir("bash-blank-");
  const command = "cat >> x.sh <<'EOF'\n\nEOF\n".repeat(13);
  const result = runHook(HOOK, {
    tool_name: "Bash",
    cwd,
    tool_input: { command },
  });
  expect((await decisionOf(result.stdout)).permissionDecision).toBe("deny");
  const tee = runHook(HOOK, {
    tool_name: "Bash",
    cwd,
    tool_input: { command: "tee -- -x.sh" },
  });
  expect((await decisionOf(tee.stdout)).permissionDecision).toBe("deny");
});

test("quoted small heredoc preserves literal shell variables", () => {
  const result = runHook(HOOK, {
    tool_name: "Bash",
    cwd: tempDir("bash-literal-"),
    tool_input: {
      command:
        "cat > x.sh <<'EOF'\n#!/bin/sh\necho \"$HOME\"\necho ok\necho more\necho done\nEOF\n",
    },
  });
  expect(result.code).toBe(0);
  expect(result.stdout).toBe("");
});
