import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { RENDER_INPUTS } from "../render-source.ts";

const ROOT = join(import.meta.dir, "../..");
const RESTORE = join(ROOT, "scripts/render-source.ts");
const INPUTS = ["package.json", "bun.lock"];

test("immutable render inputs include shared adapters and root dependency declarations", () => {
  expect(RENDER_INPUTS).toContain("tools/shared/src");
  expect(RENDER_INPUTS).toContain("package.json");
  expect(RENDER_INPUTS).toContain("bun.lock");
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
