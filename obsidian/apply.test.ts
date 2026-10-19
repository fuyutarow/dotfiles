import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../agents/hooks/zod.ts";

const tempDirs: string[] = [];

async function readJson(path: string): Promise<unknown> {
  const parsed = jsonOf(z.unknown()).safeParse(await readFile(path, "utf8"));
  return parsed.success ? parsed.data : undefined;
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0))
    await rm(dir, { recursive: true, force: true });
});

test("routes txt and YAML to editable markdown without code-view conflicts", async () => {
  const plugins = await readJson(join(import.meta.dir, "plugins.json"));
  expect(plugins).toMatchObject({
    "obsidian-custom-file-extensions-plugin": {
      repo: "meeptech/obsidian-custom-file-extensions-plugin",
      version: "1.2.1",
      sha256: {
        "main.js":
          "0cd164f9bc9b732ba87e0e3149ce77b3821ae9c27c1c750c7e8dd75d3d69e3cc",
        "manifest.json":
          "82675c42eca77f5ce39f68d795b14accfc17eb46ce9b765d960931df3a2dc6a0",
      },
      settings: { types: { markdown: ["txt", "yml", "yaml"] } },
    },
  });
  const codeView = z
    .object({
      "code-view": z.object({
        settings: z.object({ extensions: z.string() }),
      }),
    })
    .safeParse(plugins);
  expect(codeView.success).toBe(true);
  if (codeView.success) {
    const extensions =
      codeView.data["code-view"].settings.extensions.split(",");
    for (const extension of ["txt", "yml", "yaml"])
      expect(extensions).not.toContain(extension);
    expect(extensions).toContain("log");
  }
});

test("merges declared settings atomically and keeps check read-only", async () => {
  const home = await mkdtemp(join(tmpdir(), "obsidian-apply-test-"));
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

  const before = await Promise.all(
    [appPath, dataPath, enabledPath].map((path) => readFile(path, "utf8")),
  );
  expect((await run("--check")).exitCode).toBe(1);
  expect(
    await Promise.all(
      [appPath, dataPath, enabledPath].map((path) => readFile(path, "utf8")),
    ),
  ).toEqual(before);

  expect((await run()).exitCode).toBe(0);
  expect(await readJson(appPath)).toEqual({
    unrelated: "keep",
    readableLineLength: false,
  });
  expect(await readJson(dataPath)).toEqual({
    showLineNumbers: false,
    extensions: "a,b",
    flag: true,
    common: { language: "en", theme: "x" },
  });
  for (const file of ["manifest.json", "main.js"])
    expect(
      await readFile(join(obsidianDir, "plugins", "doc-view", file), "utf8"),
    ).toBe(
      await readFile(
        join(import.meta.dir, "local-plugins", "doc-view", file),
        "utf8",
      ),
    );
  expect(await readJson(enabledPath)).toEqual([
    "existing",
    "code-view",
    "doc-view",
  ]);
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

  await rm(dataPath);
  expect((await run()).exitCode).toBe(0);
  expect(await readJson(dataPath)).toEqual({
    extensions: "a,b",
    flag: true,
    common: { language: "en" },
  });

  const malformed = "{not-json";
  await writeFile(dataPath, malformed);
  const failure = await run();
  expect(failure.exitCode).toBe(2);
  expect(await readFile(dataPath, "utf8")).toBe(malformed);

  const tempFiles: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith(".tmp")) tempFiles.push(path);
    }
  };
  await walk(obsidianDir);
  expect(tempFiles).toEqual([]);
});

test("shadow settings stay byte-identical while pinned plugin files are installed", async () => {
  const home = await mkdtemp(join(tmpdir(), "obs-shadow-owner-"));
  tempDirs.push(home);
  const vault = join(home, ".obsidian-remote/vaults/host--notes");
  const config = join(vault, ".obsidian");
  const registry = join(
    home,
    "Library/Application Support/obsidian/obsidian.json",
  );
  const data = join(config, "plugins/remote-ssh/data.json");
  const app = join(config, "app.json");
  const enabled = join(config, "community-plugins.json");
  const bytes =
    '{ "profiles": [{"id":"so-owner","remotePath":"/notes"}], "autoConnectProfileId":"so-owner", "secrets":{"keep":true} }\n';
  await Bun.write(data, bytes);
  await Bun.write(app, '{ "promptDelete": false }\n');
  await Bun.write(enabled, '["remote-ssh"]\n');
  await Bun.write(
    registry,
    JSON.stringify({ vaults: { shadow: { path: vault } } }),
  );
  const appSource = join(home, "app-source.json");
  const pluginSource = join(home, "plugin-source.json");
  await Bun.write(appSource, '{"promptDelete":true}');
  await Bun.write(
    pluginSource,
    JSON.stringify({
      "remote-ssh": {
        local: "local-plugins/doc-view",
        settings: {
          profiles: [{ id: "house" }],
          autoConnectProfileId: "house",
        },
      },
      "doc-view": { local: "local-plugins/doc-view" },
    }),
  );
  const run = async (args: string[] = []) => {
    const child = Bun.spawn(
      [process.execPath, join(import.meta.dir, "apply.ts"), ...args],
      {
        env: {
          ...process.env,
          HOME: home,
          OBSIDIAN_APP_SOURCE: appSource,
          OBSIDIAN_PLUGINS_SOURCE: pluginSource,
        },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 30_000,
      },
    );
    const [exit, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exit, stdout, stderr };
  };
  expect((await run(["--check"])).exit).toBe(1);
  expect(await run()).toMatchObject({ exit: 0, stderr: "" });
  const checked = await run(["--check"]);
  expect(checked.exit).toBe(0);
  expect(checked.stdout).toContain("SKIP");
  expect(checked.stdout).toContain("owned by open-remote.ts");
  expect(await readFile(data, "utf8")).toBe(bytes);
  expect(await readFile(app, "utf8")).toBe('{ "promptDelete": false }\n');
  expect(await readFile(enabled, "utf8")).toBe('["remote-ssh"]\n');
  expect(
    await Bun.file(join(config, "plugins/doc-view/main.js")).exists(),
  ).toBe(true);
  expect(
    await Bun.file(join(config, "plugins/remote-ssh/main.js")).exists(),
  ).toBe(true);
});
