import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..", "..");
const SCRIPT = join(REPO, "scripts", "tracked-files.ts");
const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

function fixture(): { root: string; secondary: string } {
  const temp = mkdtempSync(join(tmpdir(), "tracked-files-"));
  cleanups.push(() => {
    rmSync(temp, { recursive: true, force: true });
  });
  const root = join(temp, "main");
  const secondary = join(temp, "secondary");
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "scripts", "main.ts"), "export {};\n");
  writeFileSync(join(root, "scripts", "ignored.ts"), "export {};\n");
  writeFileSync(join(root, "scripts", "ignored.txt"), "ignored by selector\n");
  return { root, secondary };
}

function run(command: string[], cwd: string): { code: number; out: string } {
  const result = Bun.spawnSync(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  return {
    code: result.exitCode ?? 1,
    out: result.stdout.toString() + result.stderr.toString(),
  };
}

function list(
  cwd: string,
  pathspecs: string[],
): { code: number; files: string[]; out: string } {
  const result = run(["bun", SCRIPT, "--expect-non-empty", ...pathspecs], cwd);
  const files = result.out.split("\0").filter(Boolean);
  return { code: result.code, files, out: result.out };
}

describe("tracked-files.ts", () => {
  test("Git main and jj secondary workspaces list the same tracked files", () => {
    const { root, secondary } = fixture();
    const init = run(["jj", "git", "init", "--colocate", root], root);
    expect(init.code).toBe(0);
    expect(run(["jj", "new", "-m", "tracked files fixture"], root).code).toBe(
      0,
    );
    expect(
      run(["jj", "workspace", "add", "--name", "secondary", secondary], root)
        .code,
    ).toBe(0);

    const pathspecs = [":(glob)scripts/*.ts", ":(exclude)scripts/ignored.ts"];
    const main = list(root, pathspecs);
    const side = list(secondary, pathspecs);
    expect(main.code).toBe(0);
    expect(side.code).toBe(0);
    expect(main.files.toSorted()).toEqual(side.files.toSorted());
    expect(side.files).toEqual(["scripts/main.ts"]);
    const empty = list(secondary, [":(glob)no-match/**/*.ts"]);
    expect(empty.code).toBe(2);
    expect(empty.out).toContain("tracked-file selection was empty");
  });

  test("lint:bun's selector is non-empty in a jj secondary workspace", () => {
    const { root, secondary } = fixture();
    expect(run(["jj", "git", "init", "--colocate", root], root).code).toBe(0);
    expect(run(["jj", "new", "-m", "lint selector fixture"], root).code).toBe(
      0,
    );
    expect(
      run(["jj", "workspace", "add", "--name", "secondary", secondary], root)
        .code,
    ).toBe(0);

    const lintBunPathspecs = [
      ":(glob)scripts/*.ts",
      "android/line-notifications.ts",
      ":(glob)tools/repo-retrieve/src/*.ts",
      ":(glob)agents/claude/*.ts",
      ":(glob)agents/claude/hooks/*.ts",
      ":(glob)agents/hooks/*.ts",
      ":(glob)agents/models/*.ts",
      ":(glob)agents/skills/*/scripts/**/*.ts",
      "agents/goal-kernel/cli.ts",
      ":(glob)tools/agent-resource-run/src/*.ts",
      ":(glob)tools/agent-dispatch/src/*.ts",
      ":(glob)tools/agent-dispatch/src/workers/*.ts",
      ":(glob)tools/serena-foreground/src/*.ts",
      ":(glob)tools/smart-open/src/*.ts",
      ":(exclude)agents/claude/hooks/repo-retrieve.ts",
    ];
    const selected = list(secondary, lintBunPathspecs);
    expect(selected.code).toBe(0);
    expect(selected.files).toContain("scripts/main.ts");
  });
});
