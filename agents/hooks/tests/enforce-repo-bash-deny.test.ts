import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decisionOf, runHook, tempDir } from "./helpers.ts";

const HOOK = "enforce-repo-bash-deny.ts";
const GIT_BAN = ["Bash(git:*)", "Bash(command git:*)", "Bash(env git:*)"];

function repo(deny: unknown, jj = true): string {
  const root = tempDir("repo-deny-");
  mkdirSync(join(root, ".claude"));
  mkdirSync(join(root, "src"));
  if (jj) mkdirSync(join(root, ".jj"));
  writeFileSync(
    join(root, ".claude", "settings.json"),
    JSON.stringify({ permissions: { deny } }),
  );
  return root;
}
const bash = (command: string, cwd: string) =>
  decisionOf(
    runHook(HOOK, { tool_name: "Bash", tool_input: { command }, cwd }).stdout,
  );

describe("enforce-repo-bash-deny", () => {
  test("git is denied where the repo's settings deny it, with the jj route", () => {
    const root = repo(GIT_BAN);
    for (const cmd of [
      "git status",
      "git",
      "command git log",
      "env git push",
      "cd src && git add -A",
      "jj st; git diff",
      "echo $(git rev-parse HEAD)",
    ]) {
      const d = bash(cmd, join(root, "src"));
      expect(d?.permissionDecision).toBe("deny");
      expect(d?.permissionDecisionReason).toContain("mise run commit");
    }
  });

  test("other commands, and words that only contain git, pass", () => {
    const root = repo(GIT_BAN);
    for (const cmd of [
      "jj st",
      "mise run commit -- -m x -- a",
      "gitk",
      "echo git",
      "lazygit",
    ])
      expect(bash(cmd, root)).toBeNull();
  });

  test("a cd into a banning repo is caught from outside it", () => {
    const root = repo(GIT_BAN);
    expect(
      bash(`cd ${root} && git log`, tempDir("elsewhere-"))?.permissionDecision,
    ).toBe("deny");
  });

  test("no settings, no deny list, or no Bash rules: silent", () => {
    expect(bash("git status", tempDir("plain-"))).toBeNull();
    expect(bash("git status", repo(undefined))).toBeNull();
    expect(bash("git status", repo(["Read(./.env)"]))).toBeNull();
  });

  test("an exact rule matches only the exact command; no jj advice without .jj", () => {
    const root = repo(["Bash(make deploy)"], false);
    const d = bash("make deploy", root);
    expect(d?.permissionDecision).toBe("deny");
    expect(d?.permissionDecisionReason).not.toContain("jj");
    expect(bash("make deploy-docs", root)).toBeNull();
  });

  test("ONE deny names every rule a command hits", () => {
    const root = repo([...GIT_BAN, "Bash(make deploy)"]);
    const reason = bash("make deploy && env git push", root)?.permissionDecisionReason;
    expect(reason).toContain("Bash(make deploy)");
    expect(reason).toContain("Bash(env git:*)");
  });

  test("a malformed deny list fails closed", () => {
    const d = bash("ls", repo("Bash(git:*)"));
    expect(d?.permissionDecision).toBe("deny");
    expect(d?.permissionDecisionReason).toContain("not a list");
  });
});
