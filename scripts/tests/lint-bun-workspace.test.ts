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

test("shared imports require a listed workspace, matching lock, and no hook exemption", async () => {
  const root = await mkdtemp(join(tmpdir(), "lint-bun-shared-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  await mkdir(join(root, "scripts"), { recursive: true });
  await mkdir(join(root, "tools/shared/src"), { recursive: true });
  await mkdir(join(root, "agents/hooks"), { recursive: true });
  const rootManifest = join(root, "package.json");
  const lock = join(root, "bun.lock");
  const declaration = { dependencies: { "@dotfiles/shared": "workspace:*" } };
  const workspaces = ["scripts", "agents/hooks"];
  const lockEntries = {
    "tools/shared": { name: "@dotfiles/shared" },
    scripts: declaration,
    "agents/hooks": declaration,
  };
  await writeFile(rootManifest, JSON.stringify({ workspaces }));
  await writeFile(lock, JSON.stringify({ workspaces: lockEntries }));
  await writeFile(
    join(root, "tools/shared/package.json"),
    '{"name":"@dotfiles/shared"}',
  );
  await writeFile(
    join(root, "tools/shared/src/example.ts"),
    "export const value = 1;\n",
  );
  await writeFile(
    join(root, "scripts/package.json"),
    JSON.stringify(declaration),
  );
  const source = join(root, "scripts/example.ts");
  const importText = 'import "@dotfiles/shared/src/example.ts";\n';
  await writeFile(source, importText);
  const run = () =>
    Bun.spawnSync([process.execPath, script], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    });
  expect(run().exitCode).toBe(0);
  await writeFile(
    rootManifest,
    JSON.stringify({ workspaces: ["agents/hooks"] }),
  );
  expect(run().exitCode).toBe(1);
  await writeFile(rootManifest, JSON.stringify({ workspaces }));
  await writeFile(
    lock,
    JSON.stringify({ workspaces: { ...lockEntries, scripts: {} } }),
  );
  expect(run().exitCode).toBe(1);
  await writeFile(lock, JSON.stringify({ workspaces: lockEntries }));
  await writeFile(
    join(root, "agents/hooks/package.json"),
    JSON.stringify(declaration),
  );
  await writeFile(join(root, "agents/hooks/example.ts"), importText);
  const hooks = run();
  expect(hooks.exitCode).toBe(1);
  expect(hooks.stdout.toString()).toContain("zero-dep tree");
});

test("workspace dependencies belong to the nearest manifest and hooks remain zero-dep", async () => {
  const root = await mkdtemp(join(tmpdir(), "lint-bun-workspace-deps-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  await mkdir(join(root, "scripts"), { recursive: true });
  await mkdir(join(root, "agents/hooks"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      workspaces: ["scripts", "agents/hooks"],
      dependencies: { example: "1.2.3" },
    }),
  );
  await writeFile(
    join(root, "bun.lock"),
    JSON.stringify({
      workspaces: {
        scripts: { dependencies: { example: "1.2.3" } },
        "agents/hooks": { dependencies: { example: "1.2.3" } },
      },
    }),
  );
  const manifest = join(root, "scripts/package.json");
  await writeFile(
    manifest,
    JSON.stringify({ dependencies: { example: "1.2.3" } }),
  );
  await writeFile(join(root, "scripts/example.ts"), 'import "example";\n');
  const run = () =>
    Bun.spawnSync([process.execPath, script], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    });
  expect(run().exitCode).toBe(0);
  await writeFile(manifest, JSON.stringify({ dependencies: {} }));
  const undeclared = run();
  expect(undeclared.exitCode).toBe(1);
  expect(undeclared.stdout.toString()).toContain(
    "unpinned external dependency 'example'",
  );
  await writeFile(
    manifest,
    JSON.stringify({ dependencies: { example: "1.2.3" } }),
  );
  await writeFile(
    join(root, "agents/hooks/package.json"),
    JSON.stringify({ dependencies: { example: "1.2.3" } }),
  );
  await writeFile(join(root, "agents/hooks/example.ts"), 'import "example";\n');
  const hooks = run();
  expect(hooks.exitCode).toBe(1);
  expect(hooks.stdout.toString()).toContain("zero-dep tree");
});
