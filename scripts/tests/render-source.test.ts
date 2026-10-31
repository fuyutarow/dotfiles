import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { RENDER_INPUTS, renderNeedsDependencies } from "../render-source.ts";

const ROOT = join(import.meta.dir, "../..");
const RESTORE = join(ROOT, "scripts/render-source.ts");
const INPUTS = ["package.json", "bun.lock"];

test("bootstrap and render import closures have no npm dependencies", async () => {
  expect(
    await renderNeedsDependencies(ROOT, [
      "scripts/render-home.ts",
      "scripts/post-merge.ts",
      "scripts/bun-runtime.ts",
      "scripts/deps-prune.ts",
      "tools/tool-tiers/src/core-floor.ts",
    ]),
  ).toBe(false);
});

test("bootstrap import scan detects a transitive bare package import", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "bootstrap-imports-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(scratch, { recursive: true, force: true }),
  };
  await writeFile(join(scratch, "entry.ts"), 'import "./child.ts";\n');
  await writeFile(
    join(scratch, "child.ts"),
    'import { consola } from "consola";\n',
  );
  expect(await renderNeedsDependencies(scratch, ["entry.ts"])).toBe(true);
});

async function unlistedImports(modulePath: string): Promise<string[]> {
  const source = await readFile(modulePath, "utf8");
  const missing: string[] = [];
  for (const match of source.matchAll(
    /\bimport\s+(?:[\w$*{},\s]+?\s+from\s*)?["']([^"']+)["']/gu,
  )) {
    const specifier = match[1];
    if (specifier === undefined || !specifier.startsWith(".")) continue;
    const resolved = resolve(dirname(modulePath), specifier);
    const relativePath = relative(ROOT, resolved);
    const insideRepo = relativePath !== ".." && !relativePath.startsWith("../");
    const listed = RENDER_INPUTS.some(
      (input) => relativePath === input || relativePath.startsWith(`${input}/`),
    );
    if (insideRepo && !listed)
      missing.push(`${relative(ROOT, modulePath)} -> ${relativePath}`);
  }
  return missing;
}

test("immutable render inputs include shared adapters and root dependency declarations", () => {
  expect(RENDER_INPUTS).toContain("agents/agx/agx.toml");
  expect(RENDER_INPUTS).not.toContain("agents/models");
  expect(RENDER_INPUTS).toContain("tools/shared/src");
  expect(RENDER_INPUTS).toContain("package.json");
  expect(RENDER_INPUTS).toContain("bun.lock");
});

test("static relative imports from every listed module are in the snapshot", async () => {
  const modules = RENDER_INPUTS.filter((input) => input.endsWith(".ts")).map(
    (input) => join(ROOT, input),
  );
  const missing: string[] = [];
  for (const modulePath of modules)
    missing.push(...(await unlistedImports(modulePath)));
  expect(missing).toEqual([]);
});

test("offline restore uses the operator cache with a scratch HOME and preserves inputs", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "render-deps-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(scratch, { recursive: true, force: true }),
  };
  const before = await Promise.all(
    INPUTS.map(async (path) => ({
      path,
      bytes: await readFile(join(ROOT, path)),
    })),
  );
  for (const { path, bytes } of before) {
    await mkdir(join(scratch, path, ".."), { recursive: true });
    await writeFile(join(scratch, path), bytes);
  }
  const script = join(scratch, "restore.ts");
  await writeFile(
    script,
    `
    import { restoreRenderDependencies } from ${JSON.stringify(RESTORE)};
    const error = await restoreRenderDependencies(${JSON.stringify(scratch)});
    if (error !== undefined) { process.stderr.write(error.message); process.exitCode = 1; }
  `,
  );
  const child = Bun.spawn([process.execPath, script], {
    env: {
      ...process.env,
      HOME: join(scratch, "home"),
      COMMAND_TARGET_HOME: homedir(),
    },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 15000,
  });
  const [, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code, err).toBe(0);
  expect(
    await Bun.file(join(scratch, "node_modules/cleye/package.json")).exists(),
  ).toBe(true);
  for (const { path, bytes } of before) {
    expect(await readFile(join(scratch, path))).toEqual(bytes);
    expect(await readFile(join(ROOT, path))).toEqual(bytes);
  }
}, 20000);

test("an empty explicit cache fails offline without downloading dependencies", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "render-deps-miss-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(scratch, { recursive: true, force: true }),
  };
  for (const path of INPUTS) {
    await mkdir(join(scratch, path, ".."), { recursive: true });
    await writeFile(join(scratch, path), await readFile(join(ROOT, path)));
  }
  const script = join(scratch, "restore.ts");
  await writeFile(
    script,
    `
    import { restoreRenderDependencies } from ${JSON.stringify(RESTORE)};
    const error = await restoreRenderDependencies(${JSON.stringify(scratch)});
    if (error !== undefined) { process.stderr.write(error.message); process.exitCode = 1; }
  `,
  );
  const child = Bun.spawn([process.execPath, script], {
    env: {
      ...process.env,
      BUN_INSTALL_CACHE_DIR: join(scratch, "empty-cache"),
      npm_config_registry: "http://127.0.0.1:1",
    },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 15000,
  });
  const [, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code).toBe(1);
  expect(err).toContain("--offline:");
  expect(err).toContain("not in the cache");
  expect(
    await Bun.file(join(scratch, "node_modules/cleye/package.json")).exists(),
  ).toBe(false);
}, 20000);
