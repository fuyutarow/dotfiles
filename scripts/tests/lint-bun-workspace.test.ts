import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve(import.meta.dir, "../lint-bun.ts");

// Workspace code resolves from files alone: `@dotfiles/<name>/…` through the root tsconfig
// `paths`, `#<top>/…` through the nearest package.json "imports". Neither needs an install, so
// both are admitted — in hooks too — while an undeclared alias or an unlisted package fails.
test("lint:bun admits tsconfig-path and package-alias imports, and nothing undeclared", async () => {
  const root = await mkdtemp(join(tmpdir(), "lint-bun-workspace-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  await mkdir(join(root, "tools/statusline/src"), { recursive: true });
  await mkdir(join(root, "tools/shared/src"), { recursive: true });
  await mkdir(join(root, "agents/hooks"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    '{"workspaces":["tools/*","agents/hooks"]}',
  );
  await writeFile(join(root, "bun.lock"), '{"workspaces":{}}');
  await writeFile(
    join(root, "tsconfig.json"),
    '{"compilerOptions":{"paths":{"@dotfiles/shared/*":["./tools/shared/*"]}}}',
  );
  await writeFile(
    join(root, "tools/shared/package.json"),
    '{"name":"@dotfiles/shared"}',
  );
  await writeFile(
    join(root, "tools/shared/src/example.ts"),
    "export const value = 1;\n",
  );
  await writeFile(
    join(root, "tools/statusline/package.json"),
    '{"name":"@dotfiles/statusline","imports":{"#src/*":"./src/*"}}',
  );
  await writeFile(
    join(root, "tools/statusline/src/local.ts"),
    "export const local = 1;\n",
  );
  const source = join(root, "tools/statusline/src/example.ts");
  await writeFile(
    join(root, "agents/hooks/package.json"),
    '{"name":"@dotfiles/hooks"}',
  );
  await writeFile(
    join(root, "agents/hooks/hook.ts"),
    'import { value } from "@dotfiles/shared/src/example.ts";\nconsole.log(value);\n',
  );
  const run = () =>
    Bun.spawnSync([process.execPath, script], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    });

  await writeFile(
    source,
    'import { value } from "@dotfiles/shared/src/example.ts";\nimport { local } from "#src/local.ts";\nconsole.log(value, local);\n',
  );
  const good = run();
  expect(good.exitCode, good.stdout.toString()).toBe(0);

  await writeFile(source, 'import "#lib/local.ts";\n');
  const alias = run();
  expect(alias.exitCode).toBe(1);
  expect(alias.stdout.toString()).toContain("'#lib/local.ts' is not declared");

  await writeFile(source, 'import "@dotfiles/unmapped/src/x.ts";\n');
  expect(run().exitCode).toBe(1);

  await writeFile(source, 'import "unlisted-external";\n');
  const external = run();
  expect(external.exitCode).toBe(1);
  expect(external.stdout.toString()).toContain("unlisted-external");
});
