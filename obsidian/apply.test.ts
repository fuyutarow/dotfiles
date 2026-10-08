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
import { jsonOf, z } from "../agents/hooks/zod.ts";

const tempDirs: string[] = [];

function readJson(path: string): unknown {
  const parsed = jsonOf(z.unknown()).safeParse(readFileSync(path, "utf8"));
  return parsed.success ? parsed.data : undefined;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
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
        settings: {
          extensions: "a,b",
          flag: true,
          common: { language: "en" },
        },
      },
      "doc-view": { local: "local-plugins/doc-view" },
    }),
  );
  await Bun.write(
    appPath,
    JSON.stringify({ unrelated: "keep", readableLineLength: true }),
  );
  await Bun.write(
    dataPath,
    JSON.stringify({
      showLineNumbers: false,
      extensions: "old",
      common: { language: "zh", theme: "x" },
    }),
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
  expect(
    [appPath, dataPath, enabledPath].map((path) => readFileSync(path, "utf8")),
  ).toEqual(before);

  expect((await run()).exitCode).toBe(0);
  expect(readJson(appPath)).toEqual({
    unrelated: "keep",
    readableLineLength: false,
  });
  expect(readJson(dataPath)).toEqual({
    showLineNumbers: false,
    extensions: "a,b",
    flag: true,
    common: { language: "en", theme: "x" },
  });
  for (const file of ["manifest.json", "main.js"])
    expect(
      readFileSync(join(obsidianDir, "plugins", "doc-view", file), "utf8"),
    ).toBe(
      readFileSync(
        join(import.meta.dir, "local-plugins", "doc-view", file),
        "utf8",
      ),
    );
  expect(readJson(enabledPath)).toEqual(["existing", "code-view", "doc-view"]);
  expect((await run()).stdout).toContain("OK");
  expect((await run("--check")).exitCode).toBe(0);

  await Bun.write(pluginsSource, JSON.stringify({ bad: { local: "../x" } }));
  expect((await run("--check")).exitCode).toBe(2);
  await Bun.write(
    pluginsSource,
    JSON.stringify({
      "code-view": {
        repo: "example/code-view",
        version: "1.0.0",
        sha256: {},
        settings: {
          extensions: "a,b",
          flag: true,
          common: { language: "en" },
        },
      },
      "doc-view": { local: "local-plugins/doc-view" },
    }),
  );

  rmSync(dataPath);
  expect((await run()).exitCode).toBe(0);
  expect(readJson(dataPath)).toEqual({
    extensions: "a,b",
    flag: true,
    common: { language: "en" },
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
