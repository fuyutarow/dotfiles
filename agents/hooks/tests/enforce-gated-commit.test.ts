import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bareCommitVerb } from "#root/enforce-gated-commit.ts";
import { decisionOf, runHook, tempDir } from "#tests/helpers.ts";

const HOOK = "enforce-gated-commit.ts";

function repo(gated: boolean): string {
  const root = tempDir("gated-commit-");
  mkdirSync(join(root, "src"));
  writeFileSync(
    join(root, "mise.toml"),
    gated
      ? '[tasks.commit]\nrun = "bun x.ts"\n'
      : '[tasks.check]\nrun = "true"\n',
  );
  return root;
}
const bash = (command: string, cwd: string) =>
  decisionOf(
    runHook(HOOK, { tool_name: "Bash", tool_input: { command }, cwd }).stdout,
  );

describe("enforce-gated-commit", () => {
  test("the segment parser finds bare commit verbs and nothing else", () => {
    expect(bareCommitVerb("jj commit -m x")).toBe("commit");
    expect(bareCommitVerb("cd a && jj --ignore-working-copy squash")).toBe(
      "squash",
    );
    expect(bareCommitVerb("command jj split")).toBe("split");
    expect(bareCommitVerb("jj log -r @-")).toBeUndefined();
    expect(bareCommitVerb("mise run commit -- -m x")).toBeUndefined();
    expect(bareCommitVerb("jj bookmark set main -r @-")).toBeUndefined();
  });
  test("bare jj commit is denied inside a gated repo, also from a subdirectory", () => {
    const root = repo(true);
    expect(bash("jj commit -m x", root)?.permissionDecision).toBe("deny");
    expect(bash("jj commit -m x", join(root, "src"))?.permissionDecision).toBe(
      "deny",
    );
  });
  test("the gated commit and read-only jj pass inside a gated repo", () => {
    const root = repo(true);
    expect(bash("mise run commit -- -m x -- a.ts", root)).toBeNull();
    expect(bash("jj log -r @", root)).toBeNull();
  });
  test("bare jj commit passes in a repo without a gated commit task", () => {
    expect(bash("jj commit records/a.md -m x", repo(false))).toBeNull();
  });
  test("a cd into a gated repo is followed", () => {
    const gated = repo(true);
    expect(
      bash(`cd ${gated} && jj commit -m x`, repo(false))?.permissionDecision,
    ).toBe("deny");
  });
  test("a cd out of a gated repo into one without the gate is judged where the commit runs", () => {
    const plain = repo(false);
    expect(
      bash(`cd ${plain} && jj commit records/a.md -m x`, repo(true)),
    ).toBeNull();
  });
  test("a heredoc body or a quoted word that mentions jj commit is data, not a commit", () => {
    const root = repo(true);
    expect(bash("cat > t.ts <<'EOF'\njj commit -m x\nEOF", root)).toBeNull();
    expect(bash("echo 'jj commit -m x'", root)).toBeNull();
  });
});
