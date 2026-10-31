import { afterAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { jsonOf, z } from "../../../agents/hooks/zod.ts";

const SCRIPT = resolve(import.meta.dir, "../src/preset.ts");
const roots: string[] = [];
afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "preset-stale-fixture-"));
  roots.push(root);
  return root;
}

async function run(root: string, ...args: string[]) {
  const child = Bun.spawn([process.execPath, SCRIPT, "sync", ...args, root], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exit };
}

test("removes record-proven stale files and reports unmanaged files", async () => {
  const root = await fixture();
  const initial = await run(root, "--tool", "jj-precommit");
  expect(initial.exit, initial.stderr).toBe(0);

  const toolRoot = join(root, "tools/jj-precommit");
  const stalePath = join(toolRoot, "tests/jj-commit.test.ts");
  const unmanagedPath = join(toolRoot, "tests/local.test.ts");
  await Bun.write(stalePath, "previously shipped test\n");
  await Bun.write(unmanagedPath, "consumer test\n");
  const manifestPath = join(toolRoot, ".preset-sync.json");
  const manifestResult = jsonOf(
    z.object({
      sourceCommit: z.string(),
      files: z.array(z.object({ source: z.string(), destination: z.string() })),
    }),
  ).safeParse(await readFile(manifestPath, "utf8"));
  expect(manifestResult.success).toBe(true);
  if (!manifestResult.success) return;
  const manifest = manifestResult.data;
  manifest.files.push({
    source: "agents/skills/wiring-mise-tasks/tests/jj-commit.test.ts",
    destination: "tests/jj-commit.test.ts",
  });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const drift = await run(root, "--check", "--tool", "jj-precommit");
  expect(drift.exit).toBe(1);
  expect(drift.stdout).toContain(
    "DIFF tools/jj-precommit/tests/jj-commit.test.ts",
  );

  const synced = await run(root, "--tool", "jj-precommit");
  expect(synced.exit, synced.stderr).toBe(0);
  expect(synced.stdout).toContain(
    "REMOVE tools/jj-precommit/tests/jj-commit.test.ts",
  );
  expect(synced.stdout).toContain(
    "unmanaged: tools/jj-precommit/tests/local.test.ts",
  );
  expect(existsSync(stalePath)).toBe(false);
  expect(await readFile(unmanagedPath, "utf8")).toBe("consumer test\n");
});
