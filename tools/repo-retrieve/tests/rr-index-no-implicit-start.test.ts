import { expect, test } from "bun:test";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { installCccEntry } from "../../../scripts/install-mcp.ts";
import { cccBackend } from "../src/ccc-entry.ts";

const router = join(import.meta.dir, "../src/repo-retrieve.ts");
const fixture = join(import.meta.dir, "ccc-daemon-fixture.py");

async function size(path: string): Promise<number> {
  const entry = await lstat(path).catch(() => null);
  if (entry === null) return 0;
  if (!entry.isDirectory()) return entry.size;
  let total = 0;
  for (const child of await readdir(path))
    total += await size(join(path, child));
  return total;
}

async function waitForSocket(runtime: string): Promise<boolean> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (
      await stat(join(runtime, "daemon.sock")).then(
        () => true,
        () => false,
      )
    )
      return true;
    await Bun.sleep(100);
  }
  return false;
}

test("real daemon reads do not start a build; admitted rr index builds", async () => {
  const installed = Bun.which("ccc");
  expect(installed).not.toBeNull();
  if (installed === null) return;
  const backend = await realpath(await cccBackend(installed));
  const python = join(dirname(backend), "python");
  const root = await mkdtemp(join(tmpdir(), "rr-no-start-"));
  const home = join(root, "home");
  // All daemon clients use project as cwd, so a relative socket path remains short
  // even when the test-owned TMPDIR is deep.
  const runtime = join(root, "run");
  const db = join(root, "db");
  const project = join(root, "project");
  const bin = join(home, ".local/bin");
  await mkdir(runtime, { recursive: true });
  await mkdir(bin, { recursive: true });
  await mkdir(join(project, ".cocoindex_code"), { recursive: true });
  await writeFile(
    join(home, "global_settings.yml"),
    "embedding:\n  provider: sentence-transformers\n  model: fixture\n",
  );
  await writeFile(
    join(project, ".cocoindex_code/settings.yml"),
    "include_patterns: ['**/*.ts']\n",
  );
  await writeFile(
    join(project, "source.ts"),
    "export const fixture = 'searchable';\n",
  );
  const entry = join(bin, "ccc");
  await symlink(backend, entry);
  await installCccEntry(home, entry);
  await chmod(entry, 0o755);
  const env = {
    ...process.env,
    HOME: home,
    PATH: `${bin}:${process.env["PATH"]}`,
    XDG_STATE_HOME: join(root, "state"),
    XDG_CACHE_HOME: join(root, "cache"),
    XDG_CONFIG_HOME: join(root, "config"),
    XDG_RUNTIME_DIR: runtime,
    COCOINDEX_CODE_DIR: home,
    COCOINDEX_CODE_RUNTIME_DIR: "../run",
    COCOINDEX_CODE_DB_PATH_MAPPING: `${root}=${db}`,
    COCOINDEX_CODE_HOST_CWD: "",
    COCOINDEX_CODE_HOST_PATH_MAPPING: "",
    COCOINDEX_CODE_DAEMON_SUPERVISED: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    REPO_RETRIEVE_AUTO_INDEX: "0",
  };
  const spawnDaemon = () =>
    Bun.spawn([python, fixture], {
      env,
      cwd: project,
      stdout: "ignore",
      stderr: "ignore",
    });
  let daemon = spawnDaemon();
  await using _daemonCleanup = {
    async [Symbol.asyncDispose]() {
      daemon.kill();
      await daemon.exited;
    },
  };
  async function run(args: readonly string[]) {
    const child = Bun.spawn([...args], {
      cwd: project,
      env,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, code };
  }
  await (async () => {
    expect(await waitForSocket(runtime)).toBe(true);
    const before = await size(db);
    for (const [args, expected] of [
      [[entry, "status"], 0],
      [[entry, "search", "fixture"], 1],
      [[process.execPath, router, "index", "--status"], 0],
    ] as const) {
      const result = await run(args);
      expect(result.code).toBe(expected);
      const state = await run([entry, "daemon", "status"]);
      expect(state.code).toBe(0);
      expect(state.stdout).not.toContain("[indexing]");
      expect(await size(db)).toBe(before);
    }
    const refused = await run([entry, "index"]);
    expect(refused.code).toBe(4);
    const refresh = await run([entry, "search", "--refresh", "fixture"]);
    expect(refresh.code).toBe(4);
    expect(await size(db)).toBe(before);
    const indexed = await run([process.execPath, router, "index"]);
    expect(indexed.code).toBe(0);
    expect(await size(db)).toBeGreaterThan(before);
    const status = await run([entry, "status"]);
    expect(status.code).toBe(0);
    expect(status.stdout).toContain("Chunks:");
    const search = await run([entry, "search", "fixture"]);
    expect(search.code).toBe(0);
    expect(search.stdout).toContain("source.ts");
    // A restarted daemon serves a stale index as-is; first contact never refreshes it.
    await writeFile(join(project, "later.ts"), "export const later = 'new';\n");
    daemon.kill();
    await daemon.exited;
    daemon = spawnDaemon();
    expect(await waitForSocket(runtime)).toBe(true);
    const stale = await run([entry, "search", "fixture"]);
    expect(stale.code).toBe(0);
    expect(stale.stdout).toContain("source.ts");
    expect(stale.stdout).not.toContain("later.ts");
    const state = await run([entry, "daemon", "status"]);
    expect(state.stdout).not.toContain("[indexing]");
  })();
}, 90_000);
