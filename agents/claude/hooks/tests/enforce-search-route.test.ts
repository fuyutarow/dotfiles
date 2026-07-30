import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { decisionOf, runHook, tempDir } from "./helpers.ts";

const HOOK = "enforce-search-route.ts";

function registerProject(): string {
  const dir = tempDir("search-route-project-");
  mkdirSync(join(dir, ".cocoindex_code"), { recursive: true });
  writeFileSync(
    join(dir, ".cocoindex_code", "settings.yml"),
    "include_patterns: []\n",
  );
  return dir;
}

function cccPath(): string {
  const dir = tempDir("search-route-bin-");
  const path = join(dir, "ccc");
  writeFileSync(path, "#!/bin/sh\nexit 0\n");
  chmodSync(path, 0o755);
  return dir;
}

const grepPayload = (cwd: string) => ({
  tool_name: "Grep",
  tool_input: { pattern: "needle", path: cwd },
  cwd,
});

const bashPayload = (cwd: string, command: string) => ({
  tool_name: "Bash",
  tool_input: { command },
  cwd,
});

const withCcc = () => ({
  PATH: `${cccPath()}:${process.env.PATH ?? ""}`,
});

describe("enforce-search-route", () => {
  test("denies built-in Grep in an operational ccc project", () => {
    const result = runHook(HOOK, grepPayload(registerProject()), withCcc());
    const decision = decisionOf(result.stdout);

    expect(result.code).toBe(0);
    expect(decision.permissionDecision).toBe("deny");
    expect(decision.permissionDecisionReason).toContain(
      "bun ~/.claude/hooks/repo-search.ts",
    );
    expect(decision.permissionDecisionReason).toContain("literal");
    expect(decision.permissionDecisionReason).toContain("concept");
    expect(decision.permissionDecisionReason).toContain("do not bypass");
  });

  test("denies direct rg, grep, git grep, and filtered find", () => {
    for (const command of [
      'rg -n "needle" src/',
      '/usr/bin/rg -n "needle" src/',
      'env LC_ALL=C rg -n "needle" src/',
      '/usr/bin/env LC_ALL=C rg -n "needle" src/',
      'timeout 10s rg -n "needle" src/',
      'echo ready && grep -n "needle" src/a.ts',
      'git grep -n "needle"',
      'git -C . grep -n "needle"',
      "repo-search files --path src | xargs rg needle",
      "sh -c 'rg -n needle src'",
      'find src -iname "*needle*"',
    ]) {
      const project = registerProject();
      const result = runHook(HOOK, bashPayload(project, command), withCcc());
      expect(decisionOf(result.stdout).permissionDecision).toBe("deny");
    }
  });

  test("detects a simple cd into a registered project", () => {
    const project = registerProject();
    const outside = tempDir("search-route-outside-");
    const result = runHook(
      HOOK,
      bashPayload(outside, `cd "${project}" && rg -n "needle" .`),
      withCcc(),
    );

    expect(decisionOf(result.stdout).permissionDecision).toBe("deny");
  });

  test("allows only the classified router and non-search ccc operations", () => {
    const project = registerProject();
    for (const command of [
      "repo-search literal --query needle",
      "bun ~/.claude/hooks/repo-search.ts exhaustive --query needle",
      "ccc status",
      "ccc daemon status",
      "ccc doctor",
      "ccc index",
    ]) {
      const result = runHook(HOOK, bashPayload(project, command), withCcc());
      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toBe("");
    }
  });

  test("denies direct ccc search and grep because they bypass router guards", () => {
    const project = registerProject();
    for (const command of [
      "ccc search 'semantic query' --limit 8 --refresh",
      "ccc grep 'foo(\\(ARGS*\\))'",
      "/usr/local/bin/ccc search 'semantic query'",
      "env CCC_LOG=warn ccc search 'semantic query'",
      "timeout 20s ccc grep 'foo(\\(ARGS*\\))'",
    ]) {
      const result = runHook(HOOK, bashPayload(project, command), withCcc());
      const decision = decisionOf(result.stdout);

      expect(decision.permissionDecision).toBe("deny");
      expect(decision.permissionDecisionReason).toContain(
        "bun ~/.claude/hooks/repo-search.ts",
      );
    }
  });

  test("denies obvious inline-runtime reimplementations of repository search", () => {
    for (const command of [
      "python3 - <<'PY'\nimport os\nfor root, dirs, files in os.walk('.'):\n  pass\nPY",
      'python -c "from pathlib import Path; print(list(Path(\\".\\").rglob(\\"*.md\\")))"',
      'node -e "import(\\"node:fs\\").then(({ readdirSync }) => readdirSync(\\".\\", { recursive: true }))"',
      'bun -e "for await (const path of new Bun.Glob(\\"**/*.ts\\").scan(\\".\\")) console.log(path)"',
    ]) {
      const project = registerProject();
      const result = runHook(HOOK, bashPayload(project, command), withCcc());
      const decision = decisionOf(result.stdout);

      expect(decision.permissionDecision).toBe("deny");
      expect(decision.permissionDecisionReason).toContain("do not bypass");
    }
  });

  test("allows normal runtime and test commands", () => {
    const project = registerProject();
    for (const command of [
      "uv run pytest tests/unit",
      "bun test agents/claude/hooks",
      "node scripts/build.mjs",
      "python scripts/migrate.py",
      'python -c "print(2 + 2)"',
      'python -c "from pathlib import Path; print(Path(\\"package.json\\").read_text())"',
    ]) {
      const result = runHook(HOOK, bashPayload(project, command), withCcc());
      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toBe("");
    }
  });

  test("allows non-search commands that merely mention grep", () => {
    const project = registerProject();
    const result = runHook(
      HOOK,
      bashPayload(project, 'echo "use rg or grep in the documentation"'),
      withCcc(),
    );

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  test("allows raw search outside a registered project", () => {
    const outside = tempDir("search-route-unregistered-");
    const result = runHook(
      HOOK,
      bashPayload(outside, 'rg -n "needle" .'),
      withCcc(),
    );

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  test("allows raw search when ccc is unavailable", () => {
    const project = registerProject();
    const emptyHome = tempDir("search-route-home-");
    const result = runHook(HOOK, grepPayload(project), {
      HOME: emptyHome,
      PATH: "",
    });

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  test("malformed input fails closed", () => {
    const result = runHook(HOOK, "{not json", withCcc());
    const decision = decisionOf(result.stdout);

    expect(result.code).toBe(0);
    expect(decision.permissionDecision).toBe("deny");
    expect(decision.permissionDecisionReason).toContain("failing closed");
  });
});
