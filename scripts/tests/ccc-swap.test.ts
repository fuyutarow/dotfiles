// bun test for scripts/ccc-swap.ts — the blue-green model-swap tool for ccc (cocoindex-code).
//
// Every scenario runs against throwaway fixture trees (mkdtemp under the OS tmpdir), passed via
// --home/--shadow-dir/--ccc-bin — the real $HOME, real ccc daemons, and real projects are never
// touched (Safety rule). `--ccc-bin` points at fake-ccc.ts (a real spawned executable — the
// house fixture-binary pattern, not a mock) instead of the real `ccc`, so build/cutover/
// rollback exercise the tool's actual subprocess/env-mapping/timeout logic without a network
// call, a GPU, or an embedding model.
//
// Layers:
//  1. Unit tests against the exported pure/injectable helpers — host-independent.
//  2. CLI-level tests that spawn the REAL script as a subprocess (mirrors reclaim-clean.test.ts's
//     pattern, incl. the mise-bun-shim dodge below).
//  3. A full build -> cutover -> rollback -> gc lifecycle against fake-ccc, including the
//     explicit safety proof: sha256 + mtime of every file under the live `.cocoindex_code`
//     before/after `build --yes`, asserted byte-for-byte and timestamp-for-timestamp identical.
import { describe, expect, test } from "bun:test";
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { MAPPING_ENV } from "../../tools/repo-retrieve/src/ccc-db-dir";
import {
  buildDbPathMappingEnv,
  computeIndexDimension,
  countIndexedRows,
  dbArtifactsSizeBytes,
  diffSnapshots,
  discoverProjects,
  dirSizeBytes,
  humanSize,
  isLiveDaemonRunning,
  listPrevGenerations,
  mirrorShadowDbDir,
  parseChunksAndFiles,
  pickModeDimension,
  readEmbeddingModel,
  replaceEmbeddingModel,
  removeDir,
  resolveHome,
  resolveShadowDir,
  snapshotDir,
} from "../ccc-swap";

const SCRIPT = join(import.meta.dir, "..", "ccc-swap.ts");
const FAKE_CCC = join(import.meta.dir, "fake-ccc.ts");

function testWithTimeout(
  name: string,
  run: () => void | Promise<void>,
  timeoutMs = 30_000,
): void {
  test(name, run, timeoutMs);
}

async function pathExists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

// mise ships a `bun` SHIM (a symlink to the mise binary itself, dispatched by argv[0]) ahead of
// the real bun on PATH. Bun.spawnSync's `env` option REPLACES rather than merges the child's
// environment, so a restricted-env subprocess needs an absolute path to the REAL bun binary —
// resolving "bun" via the shim would just re-invoke mise. Same trick as reclaim-clean.test.ts.
async function resolveRealBun(): Promise<string> {
  for (const dir of (process.env["PATH"] ?? "").split(":").filter(Boolean)) {
    const candidate = join(dir, "bun");
    if (
      await access(candidate).then(
        () => false,
        () => true,
      )
    )
      continue;
    const target = await realpath(candidate).catch(() => candidate);
    if (!target.includes("mise")) return candidate;
  }
  return process.execPath;
}
const REAL_BUN = await resolveRealBun();

testWithTimeout(
  "removeDir passes the declared disk graveyard explicitly to rip",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "ccc-swap-rip-graveyard-"));
    const target = join(root, "removed");
    const graveyard = join(root, "data/graveyard");
    await mkdir(target);
    await writeFile(
      join(root, "rip"),
      `#!${process.execPath}
import { mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
const [flag, graveyard, target] = process.argv.slice(2);
if (flag !== "--graveyard" || !graveyard || !target) process.exit(2);
mkdirSync(graveyard, { recursive: true });
renameSync(target, join(graveyard, "removed"));
`,
      { mode: 0o755 },
    );
    const prior = process.env["RIP_GRAVEYARD"];
    const priorPath = process.env["PATH"];
    process.env["RIP_GRAVEYARD"] = graveyard;
    process.env["PATH"] = root;

    await removeDir(target).finally(() => {
      if (prior === undefined) delete process.env["RIP_GRAVEYARD"];
      else process.env["RIP_GRAVEYARD"] = prior;
      if (priorPath === undefined) delete process.env["PATH"];
      else process.env["PATH"] = priorPath;
    });

    expect(await pathExists(target)).toBe(false);
    expect((await readdir(graveyard)).length).toBeGreaterThan(0);
    await rm(root, { recursive: true, force: true });
  },
);

// PATH is the one ambient value forwarded: ccc-swap.ts forwards its own env to any `ccc` (here
// fake-ccc.ts) child it spawns, and fake-ccc.ts is invoked via its `#!/usr/bin/env bun` shebang
// — without PATH the OS-level `env bun` lookup fails before the fixture ever runs. Everything
// else ($HOME, COCOINDEX_CODE_DIR, ...) is deliberately NOT inherited — fixtures are isolated
// via --home/--shadow-dir/--ccc-bin instead (Safety rule).
async function runScript(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ out: string; err: string; code: number }> {
  // bounded: ccc-swap.ts bounds its own `ccc` child with AbortSignal.timeout and always exits.
  const proc = Bun.spawn([REAL_BUN, SCRIPT, ...args], {
    env: { PATH: process.env["PATH"] ?? "", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { out, err, code };
}

async function makeHome(): Promise<string> {
  // Canonical (macOS: /var is /private/var): the script canonicalizes home, so the fixture must too.
  return realpath(await mkdtemp(join(tmpdir(), "ccc-swap-home-")));
}

async function makeProjectIndex(
  ccDir: string,
  opts: { dim?: number; chunks?: number } = {},
): Promise<void> {
  await mkdir(ccDir, { recursive: true });
  await writeFile(
    join(ccDir, "settings.yml"),
    "include_patterns: []\nexclude_patterns: []\n",
  );
  const db = new Database(join(ccDir, "target_sqlite.db"), { create: true });
  db.run(
    `CREATE TABLE code_chunks_vec (id INTEGER primary key, embedding float[${opts.dim ?? 768}])`,
  );
  db.run(
    "CREATE TABLE code_chunks_vec_rowids (rowid INTEGER PRIMARY KEY, id INTEGER)",
  );
  for (let i = 0; i < (opts.chunks ?? 5); i += 1) {
    db.run("INSERT INTO code_chunks_vec_rowids (id) VALUES (?)", [i]);
  }
  db.close();
}

async function makeProject(
  root: string,
  opts: { dim?: number; chunks?: number } = {},
): Promise<void> {
  await makeProjectIndex(join(root, ".cocoindex_code"), opts);
}

async function makeGlobalSettings(dir: string, model: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "global_settings.yml"),
    "# CocoIndex Code — global settings (fixture).\n" +
      "# a hand-written comment, to prove replaceEmbeddingModel preserves comments\n" +
      "embedding:\n" +
      "  provider: sentence-transformers\n" +
      `  model: ${model}\n` +
      "  indexing_params: {}\n" +
      "  query_params:\n" +
      "    prompt_name: query\n",
  );
}

async function sha256(path: string): Promise<string> {
  return new Bun.CryptoHasher("sha256")
    .update(await readFile(path))
    .digest("hex");
}

// ---- unit: pure helpers -----------------------------------------------------------------

describe("resolveHome / resolveShadowDir", () => {
  testWithTimeout("resolveHome prefers the flag over $HOME", async () => {
    expect(await resolveHome("/fixture/home")).toBe("/fixture/home");
  });

  testWithTimeout(
    "resolveShadowDir defaults to <home>/.cache/ccc-shadow",
    () => {
      expect(resolveShadowDir("/fixture/home", undefined)).toBe(
        "/fixture/home/.cache/ccc-shadow",
      );
    },
  );
});

describe("discoverProjects", () => {
  testWithTimeout(
    "finds a project and skips node_modules/.git/shadow root",
    async () => {
      const home = await makeHome();
      const projectRoot = join(home, "proj-a");
      await makeProject(projectRoot);
      await makeProject(
        join(home, "proj-a", "node_modules", "should-not-be-found"),
      );
      await makeProject(join(home, ".git", "should-not-be-found"));
      const shadowRoot = join(home, ".cache", "ccc-shadow");
      await makeProject(join(shadowRoot, "db", "should-not-be-found"));

      const found = await discoverProjects(home, {
        excludeAbsolutePaths: [shadowRoot],
      });
      expect(found).toEqual([projectRoot]);
    },
  );

  testWithTimeout(
    "does not miss a project nested several levels deep (no bounded search)",
    async () => {
      const home = await makeHome();
      const deep = join(home, "a", "b", "c", "d", "deep-project");
      await makeProject(deep);
      expect(await discoverProjects(home)).toEqual([deep]);
    },
  );

  // Regression: `--exclude <path>` was routed into excludeDirNames, which only ever compares
  // against a single directory ENTRY NAME — so passing a path pruned nothing and the plan
  // still listed every project. Measured on the real host: 8 planned when 1 was asked for.
  testWithTimeout(
    "a path-shaped exclude prunes that subtree, a bare name still prunes by basename",
    async () => {
      const home = await makeHome();
      const keep = join(home, "ARTS", "keep-me");
      const byPath = join(home, "Workspace", "prune-by-path");
      const byName = join(home, "vendor", "prune-by-name");
      for (const p of [keep, byPath, byName]) await makeProject(p);

      expect(await discoverProjects(home)).toEqual(
        [keep, byPath, byName].toSorted(),
      );

      const found = await discoverProjects(home, {
        excludeDirNames: ["vendor"],
        excludeAbsolutePaths: [join(home, "Workspace")],
      });
      expect(found).toEqual([keep]);
    },
  );
});

describe("computeIndexDimension / countIndexedRows", () => {
  testWithTimeout(
    "reads the embedding dimension out of the real DDL shape",
    async () => {
      const home = await makeHome();
      const ccDir = join(home, "p", ".cocoindex_code");
      await makeProjectIndex(ccDir, { dim: 384, chunks: 7 });
      expect(await computeIndexDimension(join(ccDir, "target_sqlite.db"))).toBe(
        384,
      );
      expect(await countIndexedRows(join(ccDir, "target_sqlite.db"))).toBe(7);
    },
  );

  testWithTimeout("returns null for a missing db, never throws", async () => {
    expect(
      await computeIndexDimension("/does/not/exist/target_sqlite.db"),
    ).toBeNull();
    expect(
      await countIndexedRows("/does/not/exist/target_sqlite.db"),
    ).toBeNull();
  });
});

describe("pickModeDimension", () => {
  testWithTimeout("majority wins, nulls ignored", () => {
    expect(pickModeDimension([768, 768, 384, null])).toBe(768);
  });
  testWithTimeout("no indexed projects -> null", () => {
    expect(pickModeDimension([null, null])).toBeNull();
  });
});

describe("readEmbeddingModel / replaceEmbeddingModel", () => {
  const yaml =
    "# header comment\n" +
    "embedding:\n" +
    "  provider: sentence-transformers\n" +
    "  model: old/model-a\n" +
    "  query_params:\n" +
    "    prompt_name: query\n";

  testWithTimeout("reads the model out of the embedding block", () => {
    expect(readEmbeddingModel(yaml)).toBe("old/model-a");
  });

  testWithTimeout(
    "replaces only the model line and preserves every comment/other line verbatim",
    () => {
      const result = replaceEmbeddingModel(yaml, "new/model-b");
      expect(result.isOk()).toBe(true);
      if (result.isErr()) return;
      const replaced = result.value;
      expect(readEmbeddingModel(replaced)).toBe("new/model-b");
      expect(replaced).toContain("# header comment");
      expect(replaced).toContain("provider: sentence-transformers");
      expect(replaced).toContain("prompt_name: query");
      expect(replaced.split("\n").length).toBe(yaml.split("\n").length);
    },
  );

  testWithTimeout(
    "returns an error when there is no embedding/model block to replace",
    () => {
      const result = replaceEmbeddingModel(
        "daemon:\n  idle_timeout_minutes: 5\n",
        "x/y",
      );
      expect(result.isErr()).toBe(true);
      if (result.isErr())
        expect(result.error).toContain("refusing to guess its shape");
    },
  );
});

describe("parseChunksAndFiles", () => {
  testWithTimeout("parses ccc's own print_index_stats shape", () => {
    const stdout = "Project: /p\n\nIndex stats:\n  Chunks: 42\n  Files:  9\n";
    expect(parseChunksAndFiles(stdout)).toEqual({ chunks: 42, files: 9 });
  });
});

describe("mirrorShadowDbDir / buildDbPathMappingEnv", () => {
  testWithTimeout(
    "mirrors the absolute project path under <shadow>/db, collision-free",
    () => {
      expect(mirrorShadowDbDir("/shadow", "/home/fuyu/dotfiles")).toBe(
        "/shadow/db/home/fuyu/dotfiles",
      );
    },
  );
  testWithTimeout("joins source=target pairs with commas", () => {
    expect(
      buildDbPathMappingEnv([
        { source: "/a", target: "/b" },
        { source: "/c", target: "/d" },
      ]),
    ).toBe("/a=/b,/c=/d");
  });
});

describe("snapshotDir / diffSnapshots", () => {
  testWithTimeout(
    "detects no change when nothing was touched, and reports a changed file when one was",
    async () => {
      const home = await makeHome();
      const dir = join(home, "d");
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "a.txt"), "hello");
      const before = await snapshotDir(dir);
      expect(diffSnapshots(before, await snapshotDir(dir))).toEqual([]);
      await writeFile(join(dir, "a.txt"), "hello world");
      expect(diffSnapshots(before, await snapshotDir(dir))).toEqual(["a.txt"]);
    },
  );
});

describe("dirSizeBytes / humanSize", () => {
  testWithTimeout("sums real file sizes recursively", async () => {
    const home = await makeHome();
    const dir = join(home, "d");
    await mkdir(join(dir, "sub"), { recursive: true });
    await writeFile(join(dir, "a.txt"), "12345"); // 5 bytes
    await writeFile(join(dir, "sub", "b.txt"), "1234567890"); // 10 bytes
    expect(await dirSizeBytes(dir)).toBe(15);
  });
  testWithTimeout("formats human-readable units", () => {
    expect(humanSize(0)).toBe("0B");
    expect(humanSize(2048)).toBe("2.0KB");
  });
});

describe("listPrevGenerations", () => {
  testWithTimeout(
    "finds .cocoindex_code.prev-<ts> siblings of the LIVE DB DIR, newest first",
    async () => {
      const home = await makeHome();
      const root = join(home, "p");
      await mkdir(join(root, ".cocoindex_code.prev-100"), { recursive: true });
      await mkdir(join(root, ".cocoindex_code.prev-200"), { recursive: true });
      await mkdir(join(root, "not-a-generation"), { recursive: true });
      // Unmapped default: the live DB dir IS `<root>/.cocoindex_code`, so its `.prev-<ts>`
      // siblings sit directly under `root` — same fixture shape as before the signature change
      // from projectRoot to liveDbDir (mapped mode parks a generation far outside the project).
      const gens = await listPrevGenerations(join(root, ".cocoindex_code"));
      expect(gens.map((g) => g.timestamp)).toEqual([200, 100]);
    },
  );

  testWithTimeout(
    "mapped: siblings of a DB dir that lives outside the project root entirely",
    async () => {
      const mapTarget = await realpath(
        await mkdtemp(join(tmpdir(), "ccc-swap-maptarget-")),
      );
      const mappedDbDir = join(mapTarget, "p");
      await mkdir(join(mapTarget, "p.prev-300"), { recursive: true });
      await mkdir(mappedDbDir, { recursive: true });
      const gens = await listPrevGenerations(mappedDbDir);
      expect(gens.map((g) => g.timestamp)).toEqual([300]);
    },
  );
});

// ---- CLI-level ----------------------------------------------------------------------------

describe("CLI: flag handling", () => {
  testWithTimeout(
    "Cleye rejects an ordinary command flag with native exit 1 and no execution",
    async () => {
      const home = await makeHome();
      const { code, err, out } = await runScript([
        "discover",
        "--home",
        home,
        "--bogus-flag",
      ]);
      expect(code).toBe(1);
      expect(err).toContain("Error: Unknown flag: --bogus-flag.");
      expect(out).toBe("");
    },
  );

  testWithTimeout(
    "command parser rejects --__proto__ before discover can inspect a home",
    async () => {
      const home = await makeHome();
      const { code, err, out } = await runScript([
        "discover",
        "--home",
        home,
        "--__proto__",
      ]);
      expect(code).toBe(2);
      expect(err).toContain("Unknown option '--__proto__'");
      expect(out).toBe("");
    },
  );

  testWithTimeout("missing/unknown verb exits non-zero", async () => {
    const { code, err } = await runScript(["not-a-verb"]);
    expect(code).toBe(2);
    expect(err).toContain("FATAL");
  });

  testWithTimeout("build without --model exits non-zero", async () => {
    const home = await makeHome();
    const { code, err } = await runScript(["build", "--home", home]);
    expect(code).toBe(2);
    expect(err).toContain("--model");
  });
});

describe("CLI: discover", () => {
  testWithTimeout(
    "finds a fixture project and reports its dimension",
    async () => {
      const home = await makeHome();
      const projectRoot = join(home, "proj-a");
      await makeProject(projectRoot, { dim: 768, chunks: 5 });
      const { out, code } = await runScript(["discover", "--home", home]);
      expect(out).toContain(`PROJECT ${projectRoot}`);
      expect(out).toContain("dim=768");
      expect(out).toContain("chunks=5");
      expect(out).toContain("status=OK");
      expect(code).toBe(0);
    },
  );

  testWithTimeout(
    "flags the minority-dimension project as MISMATCH and exits 1",
    async () => {
      const home = await makeHome();
      await makeProject(join(home, "proj-a"), { dim: 768, chunks: 5 });
      await makeProject(join(home, "proj-b"), { dim: 768, chunks: 5 });
      await makeProject(join(home, "proj-c"), { dim: 384, chunks: 5 }); // stale straggler
      const { out, code } = await runScript(["discover", "--home", home]);
      expect(out).toContain(`PROJECT ${join(home, "proj-c")} `);
      expect(out).toMatch(/proj-c.*status=MISMATCH/u);
      expect(code).toBe(1);
    },
  );
});

describe("CLI: build dry run mutates nothing", () => {
  testWithTimeout("no --yes: no shadow dir is created, exit 0", async () => {
    const home = await makeHome();
    await makeGlobalSettings(join(home, ".cocoindex_code"), "old/model");
    const projectRoot = join(home, "proj-a");
    await makeProject(projectRoot);
    const shadowDir = join(home, ".cache", "ccc-shadow");

    const { out, code } = await runScript([
      "build",
      "--home",
      home,
      "--model",
      "new/model",
      "--ccc-bin",
      FAKE_CCC,
    ]);
    expect(code).toBe(0);
    expect(out).toContain("dry run");
    expect(await pathExists(shadowDir)).toBe(false);
  });
});

describe("CLI: cutover refuses on missing/empty shadow", () => {
  testWithTimeout(
    "refuses (exit 1) when build was never run at all",
    async () => {
      const home = await makeHome();
      await makeGlobalSettings(join(home, ".cocoindex_code"), "old/model");
      await makeProject(join(home, "proj-a"));
      const { out, code } = await runScript([
        "cutover",
        "--home",
        home,
        "--yes",
      ]);
      expect(code).toBe(2); // FATAL: no shadow global_settings.yml at all yet
      expect(out).toBeDefined();
    },
  );

  testWithTimeout(
    "refuses (exit 1) when the shadow index exists but is empty",
    async () => {
      const home = await makeHome();
      await makeGlobalSettings(join(home, ".cocoindex_code"), "old/model");
      const projectRoot = join(home, "proj-a");
      await makeProject(projectRoot, { dim: 768, chunks: 5 });
      const shadowDir = join(home, ".cache", "ccc-shadow");
      await makeGlobalSettings(shadowDir, "new/model");
      // shadow db dir exists but with 0 rows -> "empty"
      await makeProjectIndex(mirrorShadowDbDir(shadowDir, projectRoot), {
        dim: 768,
        chunks: 0,
      });

      const { out, code } = await runScript([
        "cutover",
        "--home",
        home,
        "--yes",
      ]);
      expect(code).toBe(1);
      expect(out).toContain("REFUSE");
      expect(out).toContain("empty");

      // and definitely did not touch the live directory
      expect(
        await pathExists(
          join(projectRoot, ".cocoindex_code", "target_sqlite.db"),
        ),
      ).toBe(true);
    },
  );
});

// ---- full lifecycle against fake-ccc -------------------------------------------------------

describe("CLI: full build -> cutover -> rollback -> gc lifecycle (fake-ccc)", () => {
  testWithTimeout(
    "build proves the live index is untouched (sha256 + mtime, byte for byte)",
    async () => {
      const home = await makeHome();
      await makeGlobalSettings(join(home, ".cocoindex_code"), "old/model-a");
      const projectRoot = join(home, "proj-a");
      await makeProject(projectRoot, { dim: 768, chunks: 5 });

      const liveDb = join(projectRoot, ".cocoindex_code", "target_sqlite.db");
      const liveSettings = join(projectRoot, ".cocoindex_code", "settings.yml");
      const before = {
        dbHash: await sha256(liveDb),
        dbMtime: (await stat(liveDb)).mtimeMs,
        settingsHash: await sha256(liveSettings),
        settingsMtime: (await stat(liveSettings)).mtimeMs,
      };

      const { out, code } = await runScript([
        "build",
        "--home",
        home,
        "--model",
        "new/model-b",
        "--ccc-bin",
        FAKE_CCC,
        "--yes",
      ]);
      expect(code).toBe(0);
      expect(out).toContain("SAFETY: verified");
      expect(out).toContain("1 built, 0 skipped, 0 failed");

      const after = {
        dbHash: await sha256(liveDb),
        dbMtime: (await stat(liveDb)).mtimeMs,
        settingsHash: await sha256(liveSettings),
        settingsMtime: (await stat(liveSettings)).mtimeMs,
      };
      expect(after).toEqual(before);

      // and the shadow copy is a REAL, different build (fake-ccc's fixture model dim vs ours)
      const shadowDb = join(
        mirrorShadowDbDir(join(home, ".cache", "ccc-shadow"), projectRoot),
        "target_sqlite.db",
      );
      expect(await pathExists(shadowDb)).toBe(true);
      expect(await sha256(shadowDb)).not.toBe(before.dbHash);
    },
  );

  testWithTimeout(
    "build reports a per-project failure without aborting the others",
    async () => {
      const home = await makeHome();
      await makeGlobalSettings(join(home, ".cocoindex_code"), "old/model");
      await makeProject(join(home, "proj-ok"));
      await makeProject(join(home, "proj-broken"));

      const { out, code } = await runScript(
        [
          "build",
          "--home",
          home,
          "--model",
          "new/model",
          "--ccc-bin",
          FAKE_CCC,
          "--yes",
        ],
        { FAKE_CCC_FAIL: "proj-broken" },
      );
      expect(code).toBe(1);
      expect(out).toContain(`BUILD ${join(home, "proj-broken")}: FAILED`);
      expect(out).toContain(`BUILD ${join(home, "proj-ok")}: chunks=`);
      expect(out).toContain("1 built, 0 skipped, 1 failed");
    },
  );

  testWithTimeout(
    "build strips COCOINDEX_CODE_DAEMON_SUPERVISED so the shadow daemon can still self-spawn",
    async () => {
      // zsh/zshenv exports this whenever the systemd unit exists, so every real invocation
      // inherits it. The shadow tree has no supervisor: leaked through, it makes each shadow
      // `ccc index` wait out the client's 30s socket timeout and fail. Regression 2026-08-08.
      const home = await makeHome();
      await makeGlobalSettings(join(home, ".cocoindex_code"), "old/model");
      await makeProject(join(home, "proj-a"));

      const { out, code } = await runScript(
        [
          "build",
          "--home",
          home,
          "--model",
          "new/model",
          "--ccc-bin",
          FAKE_CCC,
          "--yes",
        ],
        { COCOINDEX_CODE_DAEMON_SUPERVISED: "1" },
      );
      expect(code).toBe(0);
      expect(out).not.toContain("Daemon did not start in time");
      expect(out).toContain(`BUILD ${join(home, "proj-a")}: chunks=`);
    },
  );

  testWithTimeout(
    "build times out via AbortSignal (not a hang) when ccc index never returns",
    async () => {
      const home = await makeHome();
      await makeGlobalSettings(join(home, ".cocoindex_code"), "old/model");
      await makeProject(join(home, "proj-a"));

      const { out, code } = await runScript(
        [
          "build",
          "--home",
          home,
          "--model",
          "new/model",
          "--ccc-bin",
          FAKE_CCC,
          "--yes",
          "--timeout-ms",
          "300",
        ],
        { FAKE_CCC_HANG: "1" },
      );
      expect(code).toBe(1);
      expect(out).toContain("FAILED (timed out after 300ms)");
    },
  );

  testWithTimeout(
    "full lifecycle: build --yes, cutover --yes, dry runs mutate nothing, rollback restores, gc prunes",
    async () => {
      const home = await makeHome();
      await makeGlobalSettings(join(home, ".cocoindex_code"), "old/model-a");
      const projectRoot = join(home, "proj-a");
      await makeProject(projectRoot, { dim: 768, chunks: 5 });
      const liveCcDir = join(projectRoot, ".cocoindex_code");
      const globalSettingsPath = join(
        home,
        ".cocoindex_code",
        "global_settings.yml",
      );

      const preBuildLiveHash = await sha256(
        join(liveCcDir, "target_sqlite.db"),
      );

      const build = await runScript([
        "build",
        "--home",
        home,
        "--model",
        "new/model-b",
        "--ccc-bin",
        FAKE_CCC,
        "--yes",
      ]);
      expect(build.code).toBe(0);

      // cutover dry run first: must mutate nothing
      const cutoverDry = await runScript(["cutover", "--home", home]);
      expect(cutoverDry.code).toBe(0);
      expect(cutoverDry.out).toContain("dry run");
      expect(await pathExists(liveCcDir)).toBe(true);
      expect(await sha256(join(liveCcDir, "target_sqlite.db"))).toBe(
        preBuildLiveHash,
      );
      expect(
        readEmbeddingModel(await readFile(globalSettingsPath, "utf8")),
      ).toBe("old/model-a");

      // real cutover
      const cutover = await runScript([
        "cutover",
        "--home",
        home,
        "--yes",
        "--ccc-bin",
        FAKE_CCC,
      ]);
      expect(cutover.code).toBe(0);
      expect(cutover.out).toContain("RESULT: cutover complete");
      expect(
        readEmbeddingModel(await readFile(globalSettingsPath, "utf8")),
      ).toBe("new/model-b");
      // the live dir now holds the NEW (fake-ccc-built) index, not the original bytes
      expect(await sha256(join(liveCcDir, "target_sqlite.db"))).not.toBe(
        preBuildLiveHash,
      );
      const gens = await listPrevGenerations(liveCcDir);
      expect(gens.length).toBe(1);
      // the parked prev generation IS the original live content, byte for byte
      const [firstGeneration] = gens;
      if (firstGeneration === undefined) {
        expect(firstGeneration).toBeDefined();
        return;
      }
      expect(await sha256(join(firstGeneration.path, "target_sqlite.db"))).toBe(
        preBuildLiveHash,
      );

      // rollback dry run: must mutate nothing
      const rollbackDry = await runScript(["rollback", "--home", home]);
      expect(rollbackDry.code).toBe(0);
      expect(rollbackDry.out).toContain("dry run");
      expect((await listPrevGenerations(liveCcDir)).length).toBe(1);
      expect(
        readEmbeddingModel(await readFile(globalSettingsPath, "utf8")),
      ).toBe("new/model-b");

      // real rollback
      const rollback = await runScript([
        "rollback",
        "--home",
        home,
        "--yes",
        "--ccc-bin",
        FAKE_CCC,
      ]);
      expect(rollback.code).toBe(0);
      expect(rollback.out).toContain("RESULT: rollback complete");
      expect(
        readEmbeddingModel(await readFile(globalSettingsPath, "utf8")),
      ).toBe("old/model-a");
      expect(await sha256(join(liveCcDir, "target_sqlite.db"))).toBe(
        preBuildLiveHash,
      );
      // rollback itself is undoable: it parked the (post-cutover) state as a new generation while
      // consuming the one it restored from — net count of .prev-* dirs for this project stays 1
      const genAfterRollback = await listPrevGenerations(liveCcDir);
      expect(genAfterRollback.length).toBe(1);
      // and it is NOT the same generation any more — it is the just-parked post-cutover state
      const [parkedPostCutoverGeneration] = genAfterRollback;
      if (parkedPostCutoverGeneration === undefined) {
        expect(parkedPostCutoverGeneration).toBeDefined();
        return;
      }
      expect(
        await sha256(
          join(parkedPostCutoverGeneration.path, "target_sqlite.db"),
        ),
      ).not.toBe(preBuildLiveHash);

      // gc dry run (keep=0, so the one remaining generation IS a deletion candidate): must delete
      // nothing without --yes
      const gcDry = await runScript(["gc", "--home", home, "--keep", "0"]);
      expect(gcDry.code).toBe(0);
      expect(gcDry.out).toContain("dry run");
      expect((await listPrevGenerations(liveCcDir)).length).toBe(1);

      // real gc, keep=0 — deletes the last remaining generation
      const gc = await runScript([
        "gc",
        "--home",
        home,
        "--keep",
        "0",
        "--yes",
      ]);
      expect(gc.code).toBe(0);
      expect(gc.out).toContain("RESULT: gc deleted 1 generation(s)");
      expect((await listPrevGenerations(liveCcDir)).length).toBe(0);
    },
    60_000,
  ); // a dozen CLI runs; 5 s was exceeded under load
});

// ---- relocated layout (COCOINDEX_CODE_DB_PATH_MAPPING) --------------------------------------

async function makeMapTarget(): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), "ccc-swap-maptarget-")));
}

function mapEnvFor(home: string, target: string): Record<string, string> {
  return { [MAPPING_ENV]: `${home}=${target}` };
}

describe("dbArtifactsSizeBytes", () => {
  testWithTimeout(
    "sums only DB_ARTIFACTS by name, recursing into cocoindex.db as a directory",
    async () => {
      const home = await makeHome();
      const dbDir = join(home, "db");
      await mkdir(dbDir, { recursive: true });
      await writeFile(join(dbDir, "target_sqlite.db"), "12345"); // 5 bytes
      await writeFile(join(dbDir, "INDEXED_AT"), "1234567890"); // 10 bytes
      await mkdir(join(dbDir, "cocoindex.db"), { recursive: true });
      await writeFile(join(dbDir, "cocoindex.db", "part"), "123"); // 3 bytes
      // an unrelated file in the same dir must NOT be counted — never size the DB dir as a whole
      await writeFile(join(dbDir, "settings.yml"), "this is 20 bytes!!!");
      expect(await dbArtifactsSizeBytes(dbDir)).toBe(5 + 10 + 3);
    },
  );
});

describe("isLiveDaemonRunning", () => {
  testWithTimeout(
    "false with no socket file, true once one exists",
    async () => {
      const home = await makeHome();
      const liveSettingsDir = join(home, ".cocoindex_code");
      await mkdir(liveSettingsDir, { recursive: true });
      expect(await isLiveDaemonRunning(liveSettingsDir)).toBe(false);
      await writeFile(join(liveSettingsDir, "daemon.sock"), "");
      expect(await isLiveDaemonRunning(liveSettingsDir)).toBe(true);
    },
  );
});

describe("CLI: discover under a DB path mapping", () => {
  testWithTimeout(
    "reads dimension/chunks/size from the MAPPED dir, not the unmapped fallback",
    async () => {
      const home = await makeHome();
      const mapTarget = await makeMapTarget();
      const projectRoot = join(home, "proj-a");
      await mkdir(join(projectRoot, ".cocoindex_code"), { recursive: true });
      await writeFile(
        join(projectRoot, ".cocoindex_code", "settings.yml"),
        "include_patterns: []\nexclude_patterns: []\n",
      );
      await makeProjectIndex(join(mapTarget, "proj-a"), {
        dim: 512,
        chunks: 9,
      });

      const { out, code } = await runScript(
        ["discover", "--home", home],
        mapEnvFor(home, mapTarget),
      );
      expect(code).toBe(0);
      expect(out).toContain(`PROJECT ${projectRoot}`);
      expect(out).toContain("dim=512");
      expect(out).toContain("chunks=9");
      expect(out).toContain("status=OK");
      // never read from the unmapped fallback location — nothing was ever written there
      expect(
        await pathExists(
          join(projectRoot, ".cocoindex_code", "target_sqlite.db"),
        ),
      ).toBe(false);
    },
  );
});

describe("CLI: cutover under a mapping with a nested project (worktree hazard)", () => {
  testWithTimeout(
    "parent cutover never sweeps up the nested child's live artifacts",
    async () => {
      const home = await makeHome();
      const mapTarget = await makeMapTarget();
      const mapEnv = mapEnvFor(home, mapTarget);

      const parentRoot = join(home, "proj-a");
      const childRoot = join(parentRoot, ".claude", "worktrees", "agent-x");
      for (const root of [parentRoot, childRoot]) {
        await mkdir(join(root, ".cocoindex_code"), { recursive: true });
        await writeFile(
          join(root, ".cocoindex_code", "settings.yml"),
          "include_patterns: []\nexclude_patterns: []\n",
        );
      }
      await makeGlobalSettings(join(home, ".cocoindex_code"), "old/model-a");

      const parentLiveDbDir = join(mapTarget, "proj-a");
      const childLiveDbDir = join(
        mapTarget,
        "proj-a",
        ".claude",
        "worktrees",
        "agent-x",
      );
      await makeProjectIndex(parentLiveDbDir, { dim: 768, chunks: 4 });
      await makeProjectIndex(childLiveDbDir, { dim: 768, chunks: 2 });
      const parentPreHash = await sha256(
        join(parentLiveDbDir, "target_sqlite.db"),
      );
      const childPreHash = await sha256(
        join(childLiveDbDir, "target_sqlite.db"),
      );

      const build = await runScript(
        [
          "build",
          "--home",
          home,
          "--model",
          "new/model-b",
          "--ccc-bin",
          FAKE_CCC,
          "--yes",
        ],
        mapEnv,
      );
      expect(build.code).toBe(0);
      expect(build.out).toContain("SAFETY: verified");
      expect(build.out).toContain("2 built, 0 skipped, 0 failed");

      const cutover = await runScript(
        ["cutover", "--home", home, "--yes", "--ccc-bin", FAKE_CCC],
        mapEnv,
      );
      expect(cutover.code).toBe(0);
      expect(cutover.out).toContain(
        "RESULT: cutover complete for 2 project(s)",
      );

      // Both projects landed their OWN new (fake-ccc-built) index.
      expect(await sha256(join(parentLiveDbDir, "target_sqlite.db"))).not.toBe(
        parentPreHash,
      );
      expect(await sha256(join(childLiveDbDir, "target_sqlite.db"))).not.toBe(
        childPreHash,
      );

      // Each project parked its OWN generation, holding ITS OWN pre-cutover bytes.
      const parentGens = await listPrevGenerations(parentLiveDbDir);
      const childGens = await listPrevGenerations(childLiveDbDir);
      expect(parentGens.length).toBe(1);
      expect(childGens.length).toBe(1);
      const [parentGen] = parentGens;
      const [childGen] = childGens;
      if (parentGen === undefined || childGen === undefined) {
        expect(parentGen).toBeDefined();
        expect(childGen).toBeDefined();
        return;
      }
      expect(await sha256(join(parentGen.path, "target_sqlite.db"))).toBe(
        parentPreHash,
      );
      expect(await sha256(join(childGen.path, "target_sqlite.db"))).toBe(
        childPreHash,
      );

      // THE HAZARD CHECK: the parent's parked generation is a SIBLING of parentLiveDbDir
      // (`<mapTarget>/proj-a.prev-<ts>`) and must NOT contain the nested child's subtree — a
      // whole-directory rename/copy of the parent's DB dir would have swept it in.
      expect(await pathExists(join(parentGen.path, ".claude"))).toBe(false);

      // And the child's live artifacts are still correctly nested inside the parent's live dir.
      expect(childLiveDbDir.startsWith(`${parentLiveDbDir}/`)).toBe(true);
      expect(await pathExists(join(childLiveDbDir, "target_sqlite.db"))).toBe(
        true,
      );
    },
    30_000,
  );
});

describe("CLI: relocate", () => {
  testWithTimeout(
    "prints a NOTE and exits 0 when the mapping is unset",
    async () => {
      const home = await makeHome();
      const { out, code } = await runScript(["relocate", "--home", home]);
      expect(code).toBe(0);
      expect(out).toContain("NOTE:");
    },
  );

  testWithTimeout("dry run: plans the move, mutates nothing", async () => {
    const home = await makeHome();
    const mapTarget = await makeMapTarget();
    const projectRoot = join(home, "proj-a");
    await makeProject(projectRoot, { dim: 768, chunks: 5 });
    const to = join(mapTarget, "proj-a");

    const { out, code } = await runScript(
      ["relocate", "--home", home],
      mapEnvFor(home, mapTarget),
    );
    expect(code).toBe(0);
    expect(out).toContain("dry run");
    expect(out).toContain(`PLAN ${projectRoot}: RELOCATE`);
    expect(await pathExists(to)).toBe(false);
    expect(
      await pathExists(
        join(projectRoot, ".cocoindex_code", "target_sqlite.db"),
      ),
    ).toBe(true);
  });

  testWithTimeout(
    "apply: moves artifacts, settings.yml stays, .cocoindex_code/ ends with only settings.yml",
    async () => {
      const home = await makeHome();
      const mapTarget = await makeMapTarget();
      const projectRoot = join(home, "proj-a");
      await makeProject(projectRoot, { dim: 768, chunks: 5 });
      const from = join(projectRoot, ".cocoindex_code");
      const to = join(mapTarget, "proj-a");
      const preHash = await sha256(join(from, "target_sqlite.db"));

      const { out, code } = await runScript(
        ["relocate", "--home", home, "--yes"],
        mapEnvFor(home, mapTarget),
      );
      expect(code).toBe(0);
      expect(out).toContain("RESULT: relocate moved 1 project(s)");
      expect(await pathExists(join(to, "target_sqlite.db"))).toBe(true);
      expect(await sha256(join(to, "target_sqlite.db"))).toBe(preHash);
      expect(await pathExists(join(from, "target_sqlite.db"))).toBe(false);
      expect(await pathExists(join(from, "settings.yml"))).toBe(true);
      expect(await readdir(from)).toEqual(["settings.yml"]);
    },
  );

  testWithTimeout(
    "conflict: refuses when an artifact exists at both ends, touches neither",
    async () => {
      const home = await makeHome();
      const mapTarget = await makeMapTarget();
      const projectRoot = join(home, "proj-a");
      await makeProject(projectRoot, { dim: 768, chunks: 5 });
      const from = join(projectRoot, ".cocoindex_code");
      const to = join(mapTarget, "proj-a");
      await makeProjectIndex(to, { dim: 768, chunks: 1 }); // already present at the target too
      const fromHashBefore = await sha256(join(from, "target_sqlite.db"));
      const toHashBefore = await sha256(join(to, "target_sqlite.db"));

      const { out, code } = await runScript(
        ["relocate", "--home", home, "--yes"],
        mapEnvFor(home, mapTarget),
      );
      expect(code).toBe(1);
      expect(out).toContain("REFUSE");
      expect(await sha256(join(from, "target_sqlite.db"))).toBe(fromHashBefore);
      expect(await sha256(join(to, "target_sqlite.db"))).toBe(toHashBefore);
    },
  );

  testWithTimeout(
    "refuses when the live ccc daemon socket is present, moves nothing",
    async () => {
      const home = await makeHome();
      const mapTarget = await makeMapTarget();
      const projectRoot = join(home, "proj-a");
      await makeProject(projectRoot, { dim: 768, chunks: 5 });
      const liveSettingsDir = join(home, ".cocoindex_code");
      await mkdir(liveSettingsDir, { recursive: true });
      await writeFile(join(liveSettingsDir, "daemon.sock"), "");

      const { out, code } = await runScript(
        ["relocate", "--home", home, "--yes"],
        mapEnvFor(home, mapTarget),
      );
      expect(code).toBe(1);
      expect(out).toContain("REFUSE");
      expect(out.toLowerCase()).toContain("daemon");
      expect(
        await pathExists(join(mapTarget, "proj-a", "target_sqlite.db")),
      ).toBe(false);
      expect(
        await pathExists(
          join(projectRoot, ".cocoindex_code", "target_sqlite.db"),
        ),
      ).toBe(true);
    },
  );
});
