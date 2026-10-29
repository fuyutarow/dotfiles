import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve(import.meta.dir, "../lint-bun.ts");

test("lint:bun admits only declared and present shared workspace imports", async () => {
  const root = await mkdtemp(join(tmpdir(), "lint-bun-workspace-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  {
    await mkdir(join(root, "tools/statusline/src"), { recursive: true });
    await mkdir(join(root, "tools/shared/src"), { recursive: true });
    await writeFile(join(root, "package.json"), '{"workspaces":["tools/*"]}');
    await writeFile(
      join(root, "bun.lock"),
      '{"workspaces":{"tools/shared":{"name":"@dotfiles/shared"},"tools/statusline":{"dependencies":{"@dotfiles/shared":"workspace:*"}}}}',
    );
    await writeFile(
      join(root, "tools/shared/package.json"),
      '{"name":"@dotfiles/shared"}',
    );
    await writeFile(
      join(root, "tools/shared/src/example.ts"),
      "export const value = 1;\n",
    );
    const manifest = join(root, "tools/statusline/package.json");
    const source = join(root, "tools/statusline/src/example.ts");
    await writeFile(
      manifest,
      '{"dependencies":{"@dotfiles/shared":"workspace:*"}}',
    );
    await writeFile(
      source,
      'import { value } from "@dotfiles/shared/src/example.ts";\nconsole.log(value);\n',
    );
    const run = () =>
      Bun.spawnSync([process.execPath, script], {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 30_000,
      });
    expect(run().exitCode).toBe(0);
    await writeFile(manifest, '{"dependencies":{}}');
    expect(run().exitCode).toBe(1);
    await writeFile(
      manifest,
      '{"dependencies":{"@dotfiles/shared":"workspace:*"}}',
    );
    await writeFile(source, 'import "@dotfiles/shared/src/missing.ts";\n');
    expect(run().exitCode).toBe(1);
    await writeFile(
      source,
      'import "@dotfiles/shared/src/example.ts";\nimport "unlisted-external";\n',
    );
    const bad = run();
    expect(bad.exitCode).toBe(1);
    expect(bad.stdout.toString()).toContain("unlisted-external");
  }
});
