import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = join(import.meta.dir, "..", "lint-no-project-names.ts");
const temporary: string[] = [];
afterEach(() => {
  for (const path of temporary.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});
function fixture(list?: string) {
  const root = mkdtempSync(join(tmpdir(), "private-name-guard-"));
  temporary.push(root);
  const cwd = join(root, "repo");
  const config = join(root, "config");
  mkdirSync(cwd);
  mkdirSync(join(config, "dotfiles"), { recursive: true });
  if (list !== undefined)
    writeFileSync(join(config, "dotfiles", "private-names.txt"), list);
  const init = Bun.spawnSync(["jj", "git", "init", cwd], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  expect(init.exitCode).toBe(0);
  return {
    cwd,
    run() {
      const result = Bun.spawnSync([process.execPath, script], {
        cwd,
        env: { ...process.env, XDG_CONFIG_HOME: config },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 30_000,
      });
      return {
        code: result.exitCode,
        stdout: result.stdout.toString(),
        stderr: result.stderr.toString(),
      };
    },
  };
}

test("absent list reports unconfigured and passes", () => {
  const result = fixture().run();
  expect(result.code).toBe(0);
  expect(result.stdout).toBe(
    "lint:no-project-names: unconfigured (private list absent)\n",
  );
  expect(result.stderr).toBe("");
});
test("content findings include each line and support comments and duplicate entries", () => {
  const f = fixture("# private fixture\nquuxword # comment\nQUUXWORD\n");
  writeFileSync(join(f.cwd, "sample.txt"), "clean\nQuuxword\nquuxword\n");
  const result = f.run();
  expect(result.code).toBe(1);
  expect(result.stdout).toBe(
    "sample.txt:2: quuxword\nsample.txt:3: quuxword\n",
  );
});
test("path findings use line zero", () => {
  const f = fixture("quuxword\n");
  writeFileSync(join(f.cwd, "Quuxword.txt"), "clean\n");
  const result = f.run();
  expect(result.code).toBe(1);
  expect(result.stdout).toBe("Quuxword.txt:0: quuxword\n");
});
test("matches whole words case insensitively, including punctuation boundaries", () => {
  const f = fixture("quuxword\n");
  writeFileSync(
    join(f.cwd, "sample.txt"),
    "prequuxword quuxwords _quuxword quuxword2 équuxword\n(QUUXWORD), quuxword!\n",
  );
  const result = f.run();
  expect(result.code).toBe(1);
  expect(result.stdout).toBe(
    "sample.txt:2: quuxword\nsample.txt:2: quuxword\n",
  );
});
test("untracked ignored files are excluded", () => {
  const f = fixture("quuxword\n");
  writeFileSync(join(f.cwd, ".gitignore"), "scratch.txt\n");
  writeFileSync(join(f.cwd, "scratch.txt"), "quuxword\n");
  const result = f.run();
  expect(result.code).toBe(0);
  expect(result.stdout).toBe("");
});
test("configured check fails closed if jj cannot list files", () => {
  const f = fixture("quuxword\n");
  const result = Bun.spawnSync([process.execPath, script], {
    cwd: tmpdir(),
    env: { ...process.env, XDG_CONFIG_HOME: join(f.cwd, "..", "config") },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  expect(result.exitCode).toBe(2);
  expect(result.stderr.toString()).toContain("jj file list failed");
});
