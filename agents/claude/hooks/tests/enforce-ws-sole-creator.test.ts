import { expect, test } from "bun:test";
import { mkdtemp, mkdir, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseJson, strAt } from "../../../hooks/narrow.ts";

const ROOT = resolve(import.meta.dir, "../../../..");
const HOOK = join(ROOT, "agents/claude/hooks/enforce-ws-sole-creator.ts");
const REMEDY =
  "use: ws add <slug> --repo <repo>  (creates <repo>.ws/ws_<slug>; tools/spec/jj-ws.md)";

async function run(tool_name: string, tool_input: unknown, cwd = tmpdir()) {
  const child = Bun.spawn([process.execPath, HOOK], {
    stdin: new Blob([JSON.stringify({ tool_name, tool_input, cwd })]),
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10_000,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code).toBe(0);
  expect(stderr).toBe("");
  return stdout;
}

async function denied(tool: string, input: unknown) {
  const out = parseJson(await run(tool, input));
  expect(strAt(out, "hookSpecificOutput", "permissionDecision")).toBe("deny");
  expect(
    strAt(out, "hookSpecificOutput", "permissionDecisionReason"),
  ).toContain(REMEDY);
  expect(
    strAt(out, "hookSpecificOutput", "permissionDecisionReason"),
  ).toContain("[dotfiles:ws-sole-creator]");
}

test.each([
  "jj workspace add ../x",
  "jj -R repo workspace add --name y ../y",
  "git worktree add ../z",
  "git -C repo worktree add ../z",
  "jj --repository=repo workspace add ../x",
  "env FOO=1 command jj workspace add ../x",
  "/usr/bin/git -c x=y worktree add ../z",
  "cd /tmp && jj workspace add ../x",
  "echo $(jj workspace add ../x)",
  "bash <<'EOF'\njj workspace add ../x\nEOF",
  "bash -c 'jj workspace add ../x'",
  "bash -c 'jj -R repo workspace add --name y ../y'",
  "bash -c 'git worktree add ../z'",
  "bash -c \"bash -c 'jj workspace add ../x'\"",
])("denies execution: %s", async (command) => {
  await denied("Bash", { command });
});

test.each([
  "ws add foo --repo /r",
  "bash -c 'ws add foo --repo /r'",
  "jj workspace list",
  "jj workspace forget old",
  "jj -R repo workspace list",
  "git worktree list",
  "echo 'jj workspace add ../x'",
  "cat <<'EOF'\njj workspace add ../x\nEOF",
  "# jj workspace add ../x\nws add foo --repo /r",
])("passes: %s", async (command) => {
  expect(await run("Bash", { command })).toBe("");
});

test("script writes and edits deny creation, while canonical implementation and prose pass", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ws-sole-creator-"));
  const file_path = join(dir, "coordinator.sh");
  await denied("Write", {
    file_path,
    content: "#!/bin/bash\njj workspace add ../x\n",
  });
  await denied("Write", {
    file_path: join(dir, "extensionless"),
    content: "#!/usr/bin/env bash\ngit worktree add ../z\n",
  });
  await Bun.write(file_path, "#!/bin/sh\njj workspace list\n");
  await denied("Edit", {
    file_path,
    old_string: "workspace list",
    new_string: "workspace add ../x",
  });
  await denied("MultiEdit", {
    file_path,
    edits: [
      { old_string: "workspace list", new_string: "workspace" },
      { old_string: "workspace", new_string: "workspace add ../x" },
    ],
  });
  expect(
    await run("Write", { file_path, content: "ws add foo --repo /r\n" }),
  ).toBe("");
  expect(
    await run("Write", {
      file_path: join(dir, "notes.md"),
      content: "jj workspace add ../x",
    }),
  ).toBe("");
  expect(
    await run("Write", {
      file_path: join(ROOT, "tools/jj-ws/sole-creator-fixture.sh"),
      content: "jj workspace add ../x",
    }),
  ).toBe("");
  await mkdir(join(dir, "tools"));
  await mkdir(join(dir, "outside"));
  await symlink(join(dir, "outside"), join(dir, "tools/jj-ws"));
  await denied("Write", {
    file_path: join(dir, "tools/jj-ws/bypass.sh"),
    content: "jj workspace add ../x",
  });
  await rm(dir, { recursive: true, force: true });
});

test("both vendor configs register the gate on the required events", async () => {
  for (const path of [
    "agents/claude/settings.json",
    "agents/codex/hooks.json",
  ]) {
    const config = await Bun.file(join(ROOT, path)).text();
    expect(config).toContain("Bash|Write|Edit|MultiEdit");
    expect(config).toContain(
      "HOOK_SLUG=dotfiles:ws-sole-creator sh ~/.claude/hooks/run.sh --fail-closed enforce-ws-sole-creator.ts",
    );
  }
});
