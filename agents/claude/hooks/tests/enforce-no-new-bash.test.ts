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
