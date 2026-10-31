import { afterAll, expect, test } from "bun:test";
import { mkdtemp, symlink, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const fixture = await mkdtemp(join(tmpdir(), "preset-vendored-scope-"));
afterAll(async () => {
  await rm(fixture, { recursive: true, force: true });
});

async function run(args: string[]) {
  const child = Bun.spawn(args, {
    cwd: fixture,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exit };
}

test("consumer excludes installed contract files but checks its own code", async () => {
  await symlink(join(root, "node_modules"), join(fixture, "node_modules"));
  const apply = await run([
    process.execPath,
    join(root, "standard-presets/src/cli.ts"),
    "apply",
    "typescript",
    "--to",
    fixture,
  ]);
  expect(apply.exit, apply.stderr).toBe(0);
  const sync = await run([
    process.execPath,
    join(root, "tools/preset/src/preset.ts"),
    "sync",
    fixture,
  ]);
  expect(sync.exit, sync.stderr).toBe(0);
  await writeFile(
    join(fixture, "app.ts"),
    "export const answer: number = 42;\n",
  );
  const check = await run([process.execPath, "check"]);
  expect(check.exit, check.stdout + check.stderr).toBe(0);
  const lint = await run([
    process.execPath,
    "tools/lint-oxlint.ts",
    "--type-aware",
  ]);
  expect(lint.exit, lint.stdout + lint.stderr).toBe(0);
  expect(lint.stdout).toContain("checked 6 file(s)");
  await writeFile(
    join(fixture, "app.ts"),
    "export const answer: number = 'wrong';\n",
  );
  expect((await run([process.execPath, "check"])).exit).not.toBe(0);
  const diff = await run([
    process.execPath,
    join(root, "standard-presets/src/cli.ts"),
    "diff",
    "typescript",
    "--to",
    fixture,
  ]);
  expect(diff.exit, diff.stdout + diff.stderr).toBe(0);
}, 180_000);
