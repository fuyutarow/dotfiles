import { afterAll, expect, test } from "bun:test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  chmod,
  symlink,
  readFile,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installCccEntry } from "../../../scripts/install-mcp.ts";
import { jsonOf, z } from "../../../agents/hooks/zod.ts";

const roots: string[] = [];
afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
});
const router = join(import.meta.dir, "../src/repo-retrieve.ts");
const installer = join(import.meta.dir, "../../../scripts/install-mcp.ts");
async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "ccc-entry-"));
  roots.push(home);
  const bin = join(home, ".local/bin");
  const vendor = join(home, "vendor");
  const project = join(home, "project");
  await mkdir(bin, { recursive: true });
  await mkdir(vendor);
  await mkdir(join(project, ".cocoindex_code"), { recursive: true });
  const settings = join(project, ".cocoindex_code/settings.yml");
  await writeFile(settings, "include_patterns: ['**/*.ts']\n");
  await writeFile(join(project, "source.ts"), "const value = 1;\n");
  const calls = join(home, "calls");
  const python = Bun.which("python3");
  expect(python).not.toBeNull();
  const interpreter = python ?? process.execPath;
  const pythonLib = join(vendor, "pythonlib", "cocoindex_code");
  await mkdir(pythonLib, { recursive: true });
  await writeFile(join(pythonLib, "__init__.py"), "");
  await writeFile(
    join(pythonLib, "settings.py"),
    "from pathlib import Path\nclass Settings:\n    include_patterns = ['**/*.ts']\n    exclude_patterns = []\n    max_file_size = 1000000\ndef load_project_settings(root):\n    result = Settings()\n    if 'payload.json' in (Path(root) / '.cocoindex_code/settings.yml').read_text(): result.include_patterns = ['**/*.json']\n    return result\n",
  );
  await writeFile(
    join(pythonLib, "file_walk.py"),
    "from pathlib import Path\nclass Matcher:\n    def __init__(self, includes): self.suffixes = tuple('.json' if 'json' in value else '.ts' for value in includes)\n    def is_dir_included(self, path): return True\n    def is_file_included(self, path): return Path(path).suffix in self.suffixes\ndef build_matcher(root, includes, excludes, max_file_size): return Matcher(includes)\ndef iter_included_files(root, current, matcher):\n    for path in Path(current).rglob('*'):\n        relative = path.relative_to(root)\n        if path.is_file() and not any(part.startswith('.') for part in relative.parts) and matcher.is_file_included(relative): yield path, relative\n",
  );
  const backend = join(vendor, "ccc");
  await writeFile(
    backend,
    `#!${interpreter}\nimport json, os, sys\nfrom pathlib import Path\nargs = sys.argv[1:]\nwith open(${JSON.stringify(calls)}, 'a') as stream: stream.write(json.dumps(args) + '\\n')\nif args and args[0] == 'index': Path('.cocoindex_code/target_sqlite.db').write_text('fixture')\nelif args and args[0] == 'status': print('Chunks: 10')\nelif args[:2] == ['daemon', 'status']: print(os.getcwd() + ' [idle]')\nelif args and args[0] == 'search': print(json.dumps(args)); sys.exit(7)\n`,
  );
  await chmod(backend, 0o755);
  const entry = join(bin, "ccc");
  const deployedEntry = join(vendor, "ccc-entry");
  const wrapper = await Bun.file(
    join(import.meta.dir, "../../../cocoindex/ccc-entry"),
  ).text();
  await writeFile(deployedEntry, wrapper);
  await chmod(deployedEntry, 0o755);
  const env = {
    ...process.env,
    HOME: home,
    PATH: `${bin}:${process.env.PATH}`,
    XDG_STATE_HOME: join(home, "state"),
    XDG_RUNTIME_DIR: join(home, "runtime"),
    COCOINDEX_CODE_DB_PATH_MAPPING: "",
    REPO_RETRIEVE_AUTO_INDEX: "0",
    PYTHONPATH: join(vendor, "pythonlib"),
  };
  async function run(args: string[]) {
    const invocation = args[0] === entry ? [process.execPath, ...args] : args;
    const child = Bun.spawn(invocation, {
      cwd: project,
      env,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 15_000,
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, code };
  }
  const callSchema = z.array(z.string());
  const log = async (): Promise<string[][]> => {
    if (!(await Bun.file(calls).exists())) return [];
    const parsed = jsonOf(z.array(callSchema)).safeParse(
      `[${(await Bun.file(calls).text()).trim().split("\n").join(",")}]`,
    );
    return parsed.success ? parsed.data : [];
  };
  return {
    home,
    bin,
    backend,
    entry,
    deployedEntry,
    project,
    settings,
    run,
    log,
  };
}

test("deployed raw index refuses before any backend call; non-index argv and exit pass through", async () => {
  const f = await fixture();
  await symlink(f.backend, f.entry);
  const original = await readFile(f.backend, "utf8");
  await installCccEntry(f.home, f.entry);
  await installCccEntry(f.home, f.entry);
  for (const args of [["index"], ["--", "index"], ["index", "--help"]]) {
    const result = await f.run([f.entry, ...args]);
    expect(result.code).toBe(4);
    expect(result.stderr).toContain("rr index");
    expect(await f.log()).toEqual([]);
  }
  const forwarded = await f.run([
    f.entry,
    "search",
    "index",
    "--",
    "--literal",
  ]);
  expect(forwarded.code).toBe(7);
  expect(await f.log()).toEqual([["search", "index", "--", "--literal"]]);
  expect(await readFile(f.backend, "utf8")).toBe(original);
});

test("rr admitted index reaches backend index exactly once and writes watermark", async () => {
  const f = await fixture();
  await installCccEntry(f.home, f.backend);
  const result = await f.run([process.execPath, router, "index"]);
  expect(result.stderr).not.toContain("PLAN REFUSED");
  expect(result.code).toBe(0);
  expect((await f.log()).filter((args) => args[0] === "index")).toEqual([
    ["index"],
  ]);
  expect(
    await Bun.file(join(f.project, ".cocoindex_code/INDEXED_AT")).exists(),
  ).toBe(true);
}, 20_000);

test("content violations refuse even with --accept-plan and --detach, before any backend/daemon call", async () => {
  const f = await fixture();
  await installCccEntry(f.home, f.backend);
  await writeFile(f.settings, "include_patterns: ['payload.json']\n");
  await writeFile(
    join(f.project, "payload.json"),
    JSON.stringify({ value: 1 }),
  );
  for (const flags of [
    [],
    ["--plan"],
    ["--accept-plan"],
    ["--accept-plan", "--detach"],
  ]) {
    const result = await f.run([process.execPath, router, "index", ...flags]);
    expect(result.code).toBe(4);
    expect(result.stderr).toContain("PLAN REFUSED");
    expect(await f.log()).toEqual([]);
  }
  for (const name of [
    "INDEXED_AT",
    "RR_ACCEPTED_PLAN.json",
    "INDEX_REQUEST.json",
  ])
    expect(
      await Bun.file(join(f.project, ".cocoindex_code", name)).exists(),
    ).toBe(false);
});

test("invalid admission configuration refuses before backend startup with override", async () => {
  const f = await fixture();
  await installCccEntry(f.home, f.backend);
  await writeFile(
    join(f.project, ".cocoindex_code/rr.toml"),
    "[index]\nmax_data_share = 2\n",
  );
  const result = await f.run([
    process.execPath,
    router,
    "index",
    "--accept-plan",
  ]);
  expect(result.code).toBe(2);
  expect(result.stderr).toContain("invalid rr.toml");
  expect(await f.log()).toEqual([]);
});

test("fresh installer deploys the same wrapper after uv, and reinstallation repairs a vendor upgrade", async () => {
  const f = await fixture();
  const uv = join(f.home, "uv");
  await writeFile(
    uv,
    `#!${process.execPath}\nimport { symlinkSync } from 'node:fs';\nsymlinkSync(${JSON.stringify(f.backend)}, ${JSON.stringify(f.entry)});\n`,
  );
  await chmod(uv, 0o755);
  const args = [
    process.execPath,
    installer,
    "--home",
    f.home,
    "--dotfiles",
    f.home,
    "--uv-bin",
    uv,
    "--ccc-bin",
    f.entry,
    "--claude-bin",
    "/nonexistent/claude",
    "--codex-bin",
    "/nonexistent/codex",
  ];
  expect((await f.run([...args, "--dry-run"])).code).toBe(0);
  expect(await Bun.file(f.entry).exists()).toBe(false);
  expect((await f.run(args)).code).toBe(0);
  expect((await f.run([f.entry, "index"])).code).toBe(4);
  expect(await f.log()).toEqual([]);
  expect((await f.run(args)).code).toBe(0);
  await rm(f.entry);
  await symlink(f.backend, f.entry);
  expect((await f.run(args)).code).toBe(0);
  expect((await f.run([f.entry, "index"])).code).toBe(4);
  expect(await f.log()).toEqual([]);
});
