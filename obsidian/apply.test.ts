import { afterEach, expect, test } from "bun:test";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("merges declared settings atomically and keeps check read-only", async () => {
  const home = mkdtempSync(join(tmpdir(), "obsidian-apply-test-"));
  tempDirs.push(home);
  const vault = join(home, "vault");
  const obsidianDir = join(vault, ".obsidian");
  const pluginDir = join(obsidianDir, "plugins", "code-view");
  const registryDir = join(home, "Library", "Application Support", "obsidian");
  const registry = join(registryDir, "obsidian.json");
  const appSource = join(home, "app-source.json");
  const pluginsSource = join(home, "plugins-source.json");
  const appPath = join(obsidianDir, "app.json");
  const dataPath = join(pluginDir, "data.json");
  const enabledPath = join(obsidianDir, "community-plugins.json");

  for (const dir of [obsidianDir, pluginDir, registryDir])
    await Bun.write(join(dir, ".keep"), "");
  await Bun.write(registry, JSON.stringify({ vaults: { x: { path: vault } } }));
  await Bun.write(appSource, JSON.stringify({ readableLineLength: false }));
  await Bun.write(
    pluginsSource,
    JSON.stringify({
      "code-view": {
        repo: "example/code-view",
        version: "1.0.0",
        sha256: {},
        settings: { extensions: "a,b", flag: true },
      },
    }),
  );
  await Bun.write(
    appPath,
    JSON.stringify({ unrelated: "keep", readableLineLength: true }),
  );
  await Bun.write(
    dataPath,
    JSON.stringify({ showLineNumbers: false, extensions: "old" }),
  );
  await Bun.write(enabledPath, JSON.stringify(["existing"]));

  const env = {
    ...process.env,
    HOME: home,
    OBSIDIAN_APP_SOURCE: appSource,
    OBSIDIAN_PLUGINS_SOURCE: pluginsSource,
  };
  const run = async (...args: string[]) => {
    const child = Bun.spawn([process.execPath, "obsidian/apply.ts", ...args], {
      cwd: import.meta.dir + "/..",
      env,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exitCode, stdout, stderr };
  };

  const before = [appPath, dataPath, enabledPath].map((path) =>
    readFileSync(path, "utf8"),
  );
  expect((await run("--check")).exitCode).toBe(1);
  expect([appPath, dataPath, enabledPath].map((path) => readFileSync(path, "utf8"))).toEqual(before);

  expect((await run()).exitCode).toBe(0);
  expect(JSON.parse(readFileSync(appPath, "utf8"))).toEqual({
    unrelated: "keep",
    readableLineLength: false,
  });
  expect(JSON.parse(readFileSync(dataPath, "utf8"))).toEqual({
    showLineNumbers: false,
    extensions: "a,b",
    flag: true,
  });
  expect(JSON.parse(readFileSync(enabledPath, "utf8"))).toEqual([
    "existing",
    "code-view",
  ]);
  expect((await run()).stdout).toContain("OK");
  expect((await run("--check")).exitCode).toBe(0);

  rmSync(dataPath);
  expect((await run()).exitCode).toBe(0);
  expect(JSON.parse(readFileSync(dataPath, "utf8"))).toEqual({
    extensions: "a,b",
    flag: true,
  });

  const malformed = "{not-json";
  writeFileSync(dataPath, malformed);
  const failure = await run();
  expect(failure.exitCode).toBe(2);
  expect(readFileSync(dataPath, "utf8")).toBe(malformed);

  const tempFiles: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".tmp")) tempFiles.push(path);
    }
  };
  walk(obsidianDir);
  expect(tempFiles).toEqual([]);
});
