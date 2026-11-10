import { expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { installCccEntry } from "../../../scripts/install-mcp.ts";
import { cccBackend } from "../src/ccc-entry.ts";
import { declaredDbEnv, MAPPING_ENV } from "../src/ccc-db-dir.ts";

const router = join(import.meta.dir, "../src/repo-retrieve.ts");
const fixture = join(import.meta.dir, "ccc-slow-daemon-fixture.py");

// P1: after max_seconds expires, what happens to the build is proved on a disposable daemon
// (its own socket, DB dir and process; the shared daemon is never contacted), and the text rr
// prints states exactly that outcome. The slow fixture embedder appends one line per call to a
// log, so "the build is still running" is a measured fact (the log keeps growing), not an
// inference from daemon status.

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

test("max_seconds stops only the client; rr says the daemon build continues, and only a daemon restart ends it", async () => {
  const installed = Bun.which("ccc");
  expect(installed).not.toBeNull();
  if (installed === null) return;
  const backend = await realpath(await cccBackend(installed));
  const python = join(dirname(backend), "python");
  const root = await mkdtemp(join(tmpdir(), "rr-budget-"));
  const home = join(root, "home");
  const runtime = join(root, "run");
  const project = join(root, "project");
  const bin = join(home, ".local/bin");
  const embedLog = join(root, "embed.log");
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
  // 100 chunks at the 50 chunks/s ceiling estimate 2 s, so the plan is admitted under a 3 s
  // budget; the serialised 0.25 s embedder makes the real build take about 25 s.
  await writeFile(
    join(project, ".cocoindex_code/rr.toml"),
    "[index]\nmax_seconds = 3\nest_chunks_per_second = 50\n",
  );
  for (let index = 0; index < 100; index++)
    await writeFile(
      join(project, `f${index}.ts`),
      `export const v${index} = ${index};\n`,
    );
  await writeFile(embedLog, "");
  const entry = join(bin, "ccc");
  await symlink(backend, entry);
  await installCccEntry(home, entry);
  await chmod(entry, 0o755);
  // rr refuses a mapping that differs from the declared db-root (cocoindex/db-root), so the
  // fixture uses the declared one for its own HOME. The project sits outside HOME, so the
  // mapping does not cover it and its DB stays in the disposable project directory.
  const declared = await declaredDbEnv({ HOME: home });
  expect(declared.isOk()).toBe(true);
  const mapping = declared.isOk() ? (declared.value[MAPPING_ENV] ?? "") : "";
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
    COCOINDEX_CODE_DB_PATH_MAPPING: mapping,
    COCOINDEX_CODE_HOST_CWD: "",
    COCOINDEX_CODE_HOST_PATH_MAPPING: "",
    COCOINDEX_CODE_DAEMON_SUPERVISED: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    REPO_RETRIEVE_AUTO_INDEX: "0",
    RR_FIXTURE_EMBED_LOG: embedLog,
  };
  const daemon = Bun.spawn([python, fixture], {
    env,
    cwd: project,
    stdout: "ignore",
    stderr: "ignore",
  });
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
      timeout: 60_000,
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, code };
  }
  const embeds = async () =>
    (await readFile(embedLog, "utf8")).split("\n").filter(Boolean).length;
  // Embed calls made during a window: the build is running iff this is positive.
  const embedsDuring = async (milliseconds: number) => {
    const before = await embeds();
    await Bun.sleep(milliseconds);
    return (await embeds()) - before;
  };
  const daemonState = async () =>
    (await run([entry, "daemon", "status"])).stdout;

  expect(await waitForSocket(runtime)).toBe(true);

  // 1. The budget expires mid-build: rr exits 125 and writes no watermark.
  const indexed = await run([process.execPath, router, "index"]);
  expect(indexed.code, indexed.stderr).toBe(125);
  expect(indexed.stderr).toContain("exceeds max_seconds=3");
  expect(
    await Bun.file(join(project, ".cocoindex_code", "INDEXED_AT")).exists(),
  ).toBe(false);

  // 2. The build did NOT stop: the daemon keeps embedding after rr has exited.
  const afterExit = await embedsDuring(2_000);
  expect(afterExit).toBeGreaterThan(0);
  expect(await daemonState()).toContain("[indexing]");

  // 3. rr's own words state that outcome, and only that outcome.
  expect(indexed.stderr).toContain("BUILD_AFTER_BUDGET=still-indexing");
  expect(indexed.stderr).toContain("STILL INDEXING");
  expect(indexed.stderr).toContain("NOT bounded by max_seconds");
  expect(indexed.stderr).toContain("ccc has no cancel request");
  expect(indexed.stderr).toContain(
    "stopped the client and left the daemon running",
  );
  expect(indexed.stderr).toContain("watermark left unchanged");
  expect(indexed.stderr).not.toMatch(
    /build (was )?(stopped|cancel+ed)|cancel+ed the build/iu,
  );

  // 4. Why rr cannot do better: the daemon protocol has no cancel request ...
  const protocol = await run([
    python,
    "-c",
    "import cocoindex_code.protocol as p; print(' '.join(sorted(n for n in dir(p) if 'cancel' in n.lower() or 'abort' in n.lower())))",
  ]);
  expect(protocol.code).toBe(0);
  expect(protocol.stdout.trim()).toBe("");

  // 5. ... and the one request that touches a running project, remove_project, hides the build
  // from `daemon status` without stopping it (the worst case: still consuming, now invisible).
  const removed = await run([
    python,
    "-c",
    `from cocoindex_code import client; print(client.remove_project(${JSON.stringify(project)}))`,
  ]);
  expect(removed.code).toBe(0);
  expect(await daemonState()).toContain("No projects loaded");
  expect(await embedsDuring(2_000)).toBeGreaterThan(0);

  // 6. Only ending the daemon process ends the build.
  daemon.kill();
  await daemon.exited;
  const settled = await embedsDuring(500);
  expect(settled).toBeLessThanOrEqual(1);
  expect(await embedsDuring(1_500)).toBe(0);
}, 120_000);
