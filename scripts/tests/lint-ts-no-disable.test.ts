import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..", "..");
const SCRIPT = join(REPO, "scripts", "lint-ts-no-disable.ts");
const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function temporaryDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), "lint-ts-no-disable-"));
  cleanups.push(() => {
    rmSync(path, { recursive: true, force: true });
  });
  return path;
}

function run(command: string[], cwd: string) {
  const result = Bun.spawnSync(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  return {
    code: result.exitCode ?? 1,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

describe("lint-ts-no-disable.ts", () => {
  test("clean and planted files are checked in Git and a jj secondary workspace", () => {
    const temp = temporaryDirectory();
    const root = join(temp, "main");
    const secondary = join(temp, "secondary");
    mkdirSync(join(root, "src"), { recursive: true });
    const relativeFile = "src/check.ts";
    writeFileSync(join(root, relativeFile), "export {};\n");

    expect(run(["jj", "git", "init", "--colocate", root], root).code).toBe(0);
    expect(run(["jj", "new", "-m", "disable lint fixture"], root).code).toBe(0);
    expect(
      run(["jj", "workspace", "add", "--name", "secondary", secondary], root)
        .code,
    ).toBe(0);

    expect(run(["bun", SCRIPT], root).code).toBe(0);
    expect(run(["bun", SCRIPT], secondary).code).toBe(0);

    const planted = ["// oxlint-", "disable no-console\nexport {};\n"].join("");
    writeFileSync(join(root, relativeFile), planted);
    const mainHit = run(["bun", SCRIPT], root);
    expect(mainHit.code).toBe(1);
    expect(mainHit.stdout).toContain(`${relativeFile}:1`);

    writeFileSync(join(secondary, relativeFile), planted);
    const secondaryHit = run(["bun", SCRIPT], secondary);
    expect(secondaryHit.code).toBe(1);
    expect(secondaryHit.stdout).toContain(`${relativeFile}:1`);
  });

  test("fails with exit 2 when no repository can provide a file listing", () => {
    const cwd = temporaryDirectory();
    const result = run(["bun", SCRIPT], cwd);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("could not list tracked TypeScript files");
  });
});
