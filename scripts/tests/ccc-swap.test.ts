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
//  2. CLI-level tests that spawn the REAL script as a subprocess (mirrors cache-clean.test.ts's
//     pattern, incl. the mise-bun-shim dodge below).
//  3. A full build -> cutover -> rollback -> gc lifecycle against fake-ccc, including the
//     explicit safety proof: sha256 + mtime of every file under the live `.cocoindex_code`
//     before/after `build --yes`, asserted byte-for-byte and timestamp-for-timestamp identical.
import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import {
  buildDbPathMappingEnv,
  computeIndexDimension,
  countIndexedRows,
  diffSnapshots,
  discoverProjects,
  dirSizeBytes,
  humanSize,
  listPrevGenerations,
  mirrorShadowDbDir,
  parseChunksAndFiles,
  pickModeDimension,
  readEmbeddingModel,
  replaceEmbeddingModel,
  resolveHome,
  resolveShadowDir,
  snapshotDir,
} from "../ccc-swap";

const SCRIPT = join(import.meta.dir, "..", "ccc-swap.ts");
const FAKE_CCC = join(import.meta.dir, "fake-ccc.ts");

// mise ships a `bun` SHIM (a symlink to the mise binary itself, dispatched by argv[0]) ahead of
// the real bun on PATH. Bun.spawnSync's `env` option REPLACES rather than merges the child's
// environment, so a restricted-env subprocess needs an absolute path to the REAL bun binary —
// resolving "bun" via the shim would just re-invoke mise. Same trick as cache-clean.test.ts.
function resolveRealBun(): string {
  for (const dir of (process.env.PATH ?? "").split(":").filter(Boolean)) {
    const candidate = join(dir, "bun");
    if (!existsSync(candidate)) continue;
    if (!realpathSync(candidate).includes("mise")) return candidate;
  }
  throw new Error("no non-mise-shim `bun` found on PATH for the test harness");
}
const REAL_BUN = resolveRealBun();

// PATH is the one ambient value forwarded: ccc-swap.ts forwards its own env to any `ccc` (here
// fake-ccc.ts) child it spawns, and fake-ccc.ts is invoked via its `#!/usr/bin/env bun` shebang
// — without PATH the OS-level `env bun` lookup fails before the fixture ever runs. Everything
// else ($HOME, COCOINDEX_CODE_DIR, ...) is deliberately NOT inherited — fixtures are isolated
// via --home/--shadow-dir/--ccc-bin instead (Safety rule).
function runScript(
  args: string[],
  env: Record<string, string> = {},
): { out: string; err: string; code: number } {
  // bounded: ccc-swap.ts bounds its own `ccc` child with AbortSignal.timeout and always exits.
  const proc = Bun.spawnSync([REAL_BUN, SCRIPT, ...args], {
    env: { PATH: process.env.PATH ?? "", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    out: proc.stdout.toString(),
    err: proc.stderr.toString(),
    code: proc.exitCode ?? -1,
  };
}

function makeHome(): string {
  return mkdtempSync(join(tmpdir(), "ccc-swap-home-"));
}

function makeProjectIndex(
  ccDir: string,
  opts: { dim?: number; chunks?: number } = {},
): void {
  mkdirSync(ccDir, { recursive: true });
  writeFileSync(
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

function makeProject(
  root: string,
  opts: { dim?: number; chunks?: number } = {},
): void {
  makeProjectIndex(join(root, ".cocoindex_code"), opts);
}

function makeGlobalSettings(dir: string, model: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
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

function sha256(path: string): string {
  return new Bun.CryptoHasher("sha256")
    .update(readFileSync(path))
    .digest("hex");
}

// ---- unit: pure helpers -----------------------------------------------------------------

describe("resolveHome / resolveShadowDir", () => {
  test("resolveHome prefers the flag over $HOME", () => {
    expect(resolveHome("/fixture/home")).toBe("/fixture/home");
  });

  test("resolveShadowDir defaults to <home>/.cache/ccc-shadow", () => {
    expect(resolveShadowDir("/fixture/home", undefined)).toBe(
      "/fixture/home/.cache/ccc-shadow",
    );
  });
});

describe("discoverProjects", () => {
  test("finds a project and skips node_modules/.git/shadow root", () => {
    const home = makeHome();
    const projectRoot = join(home, "proj-a");
    makeProject(projectRoot);
    makeProject(join(home, "proj-a", "node_modules", "should-not-be-found"));
    makeProject(join(home, ".git", "should-not-be-found"));
    const shadowRoot = join(home, ".cache", "ccc-shadow");
    makeProject(join(shadowRoot, "db", "should-not-be-found"));

    const found = discoverProjects(home, {
      excludeAbsolutePaths: [shadowRoot],
    });
    expect(found).toEqual([projectRoot]);
  });

  test("does not miss a project nested several levels deep (no bounded search)", () => {
    const home = makeHome();
    const deep = join(home, "a", "b", "c", "d", "deep-project");
    makeProject(deep);
    expect(discoverProjects(home)).toEqual([deep]);
  });

  // Regression: `--exclude <path>` was routed into excludeDirNames, which only ever compares
  // against a single directory ENTRY NAME — so passing a path pruned nothing and the plan
  // still listed every project. Measured on the real host: 8 planned when 1 was asked for.
  test("a path-shaped exclude prunes that subtree, a bare name still prunes by basename", () => {
    const home = makeHome();
    const keep = join(home, "ARTS", "keep-me");
    const byPath = join(home, "Workspace", "prune-by-path");
    const byName = join(home, "vendor", "prune-by-name");
    for (const p of [keep, byPath, byName]) makeProject(p);

    expect(discoverProjects(home)).toEqual([keep, byPath, byName].sort());

    const found = discoverProjects(home, {
      excludeDirNames: ["vendor"],
      excludeAbsolutePaths: [join(home, "Workspace")],
    });
    expect(found).toEqual([keep]);
  });
});

describe("computeIndexDimension / countIndexedRows", () => {
  test("reads the embedding dimension out of the real DDL shape", () => {
    const home = makeHome();
    const ccDir = join(home, "p", ".cocoindex_code");
    makeProjectIndex(ccDir, { dim: 384, chunks: 7 });
    expect(computeIndexDimension(join(ccDir, "target_sqlite.db"))).toBe(384);
    expect(countIndexedRows(join(ccDir, "target_sqlite.db"))).toBe(7);
  });

  test("returns null for a missing db, never throws", () => {
    expect(
      computeIndexDimension("/does/not/exist/target_sqlite.db"),
    ).toBeNull();
    expect(countIndexedRows("/does/not/exist/target_sqlite.db")).toBeNull();
  });
});

describe("pickModeDimension", () => {
  test("majority wins, nulls ignored", () => {
    expect(pickModeDimension([768, 768, 384, null])).toBe(768);
  });
  test("no indexed projects -> null", () => {
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

  test("reads the model out of the embedding block", () => {
    expect(readEmbeddingModel(yaml)).toBe("old/model-a");
  });

  test("replaces only the model line and preserves every comment/other line verbatim", () => {
    const replaced = replaceEmbeddingModel(yaml, "new/model-b");
    expect(readEmbeddingModel(replaced)).toBe("new/model-b");
    expect(replaced).toContain("# header comment");
    expect(replaced).toContain("provider: sentence-transformers");
    expect(replaced).toContain("prompt_name: query");
    expect(replaced.split("\n").length).toBe(yaml.split("\n").length);
  });

  test("throws when there is no embedding/model block to replace", () => {
    expect(() =>
      replaceEmbeddingModel("daemon:\n  idle_timeout_minutes: 5\n", "x/y"),
    ).toThrow();
  });
});

describe("parseChunksAndFiles", () => {
  test("parses ccc's own print_index_stats shape", () => {
    const stdout = "Project: /p\n\nIndex stats:\n  Chunks: 42\n  Files:  9\n";
    expect(parseChunksAndFiles(stdout)).toEqual({ chunks: 42, files: 9 });
  });
});

describe("mirrorShadowDbDir / buildDbPathMappingEnv", () => {
  test("mirrors the absolute project path under <shadow>/db, collision-free", () => {
    expect(mirrorShadowDbDir("/shadow", "/home/fuyu/dotfiles")).toBe(
      "/shadow/db/home/fuyu/dotfiles",
    );
  });
  test("joins source=target pairs with commas", () => {
    expect(
      buildDbPathMappingEnv([
        { source: "/a", target: "/b" },
        { source: "/c", target: "/d" },
      ]),
    ).toBe("/a=/b,/c=/d");
  });
});

describe("snapshotDir / diffSnapshots", () => {
  test("detects no change when nothing was touched, and reports a changed file when one was", () => {
    const home = makeHome();
    const dir = join(home, "d");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "a.txt"), "hello");
    const before = snapshotDir(dir);
    expect(diffSnapshots(before, snapshotDir(dir))).toEqual([]);
    writeFileSync(join(dir, "a.txt"), "hello world");
    expect(diffSnapshots(before, snapshotDir(dir))).toEqual(["a.txt"]);
  });
});

describe("dirSizeBytes / humanSize", () => {
  test("sums real file sizes recursively", () => {
    const home = makeHome();
    const dir = join(home, "d");
    mkdirSync(join(dir, "sub"), { recursive: true });
    writeFileSync(join(dir, "a.txt"), "12345"); // 5 bytes
    writeFileSync(join(dir, "sub", "b.txt"), "1234567890"); // 10 bytes
    expect(dirSizeBytes(dir)).toBe(15);
  });
  test("formats human-readable units", () => {
    expect(humanSize(0)).toBe("0B");
    expect(humanSize(2048)).toBe("2.0KB");
  });
});

describe("listPrevGenerations", () => {
  test("finds .cocoindex_code.prev-<ts> siblings, newest first", () => {
    const home = makeHome();
    const root = join(home, "p");
    mkdirSync(join(root, ".cocoindex_code.prev-100"), { recursive: true });
    mkdirSync(join(root, ".cocoindex_code.prev-200"), { recursive: true });
    mkdirSync(join(root, "not-a-generation"), { recursive: true });
    const gens = listPrevGenerations(root);
    expect(gens.map((g) => g.timestamp)).toEqual([200, 100]);
  });
});

// ---- CLI-level ----------------------------------------------------------------------------

describe("CLI: flag handling", () => {
  test("Cleye rejects an ordinary command flag with native exit 1 and no execution", () => {
    const home = makeHome();
    const { code, err, out } = runScript([
      "discover",
      "--home",
      home,
      "--bogus-flag",
    ]);
    expect(code).toBe(1);
    expect(err).toContain("Error: Unknown flag: --bogus-flag.");
    expect(out).toBe("");
  });

  test("command parser rejects --__proto__ before discover can inspect a home", () => {
    const home = makeHome();
    const { code, err, out } = runScript([
      "discover",
      "--home",
      home,
      "--__proto__",
    ]);
    expect(code).toBe(2);
    expect(err).toContain("Unknown option '--__proto__'");
    expect(out).toBe("");
  });

  test("missing/unknown verb exits non-zero", () => {
    const { code, err } = runScript(["not-a-verb"]);
    expect(code).toBe(2);
    expect(err).toContain("FATAL");
  });

  test("build without --model exits non-zero", () => {
    const home = makeHome();
    const { code, err } = runScript(["build", "--home", home]);
    expect(code).toBe(2);
    expect(err).toContain("--model");
  });
});

describe("CLI: discover", () => {
  test("finds a fixture project and reports its dimension", () => {
    const home = makeHome();
    const projectRoot = join(home, "proj-a");
    makeProject(projectRoot, { dim: 768, chunks: 5 });
    const { out, code } = runScript(["discover", "--home", home]);
    expect(out).toContain(`PROJECT ${projectRoot}`);
    expect(out).toContain("dim=768");
    expect(out).toContain("chunks=5");
    expect(out).toContain("status=OK");
    expect(code).toBe(0);
  });

  test("flags the minority-dimension project as MISMATCH and exits 1", () => {
    const home = makeHome();
    makeProject(join(home, "proj-a"), { dim: 768, chunks: 5 });
    makeProject(join(home, "proj-b"), { dim: 768, chunks: 5 });
    makeProject(join(home, "proj-c"), { dim: 384, chunks: 5 }); // stale straggler
    const { out, code } = runScript(["discover", "--home", home]);
    expect(out).toContain(`PROJECT ${join(home, "proj-c")} `);
    expect(out).toMatch(/proj-c.*status=MISMATCH/);
    expect(code).toBe(1);
  });
});

describe("CLI: build dry run mutates nothing", () => {
  test("no --yes: no shadow dir is created, exit 0", () => {
    const home = makeHome();
    makeGlobalSettings(join(home, ".cocoindex_code"), "old/model");
    const projectRoot = join(home, "proj-a");
    makeProject(projectRoot);
    const shadowDir = join(home, ".cache", "ccc-shadow");

    const { out, code } = runScript([
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
    expect(existsSync(shadowDir)).toBe(false);
  });
});

describe("CLI: cutover refuses on missing/empty shadow", () => {
  test("refuses (exit 1) when build was never run at all", () => {
    const home = makeHome();
    makeGlobalSettings(join(home, ".cocoindex_code"), "old/model");
    makeProject(join(home, "proj-a"));
    const { out, code } = runScript(["cutover", "--home", home, "--yes"]);
    expect(code).toBe(2); // FATAL: no shadow global_settings.yml at all yet
    expect(`${out}`).toBeDefined();
  });

  test("refuses (exit 1) when the shadow index exists but is empty", () => {
    const home = makeHome();
    makeGlobalSettings(join(home, ".cocoindex_code"), "old/model");
    const projectRoot = join(home, "proj-a");
    makeProject(projectRoot, { dim: 768, chunks: 5 });
    const shadowDir = join(home, ".cache", "ccc-shadow");
    makeGlobalSettings(shadowDir, "new/model");
    // shadow db dir exists but with 0 rows -> "empty"
    makeProjectIndex(mirrorShadowDbDir(shadowDir, projectRoot), {
      dim: 768,
      chunks: 0,
    });

    const { out, code } = runScript(["cutover", "--home", home, "--yes"]);
    expect(code).toBe(1);
    expect(out).toContain("REFUSE");
    expect(out).toContain("empty");

    // and definitely did not touch the live directory
    expect(
      existsSync(join(projectRoot, ".cocoindex_code", "target_sqlite.db")),
    ).toBe(true);
  });
});

// ---- full lifecycle against fake-ccc -------------------------------------------------------

describe("CLI: full build -> cutover -> rollback -> gc lifecycle (fake-ccc)", () => {
  test("build proves the live index is untouched (sha256 + mtime, byte for byte)", () => {
    const home = makeHome();
    makeGlobalSettings(join(home, ".cocoindex_code"), "old/model-a");
    const projectRoot = join(home, "proj-a");
    makeProject(projectRoot, { dim: 768, chunks: 5 });

    const liveDb = join(projectRoot, ".cocoindex_code", "target_sqlite.db");
    const liveSettings = join(projectRoot, ".cocoindex_code", "settings.yml");
    const before = {
      dbHash: sha256(liveDb),
      dbMtime: statSync(liveDb).mtimeMs,
      settingsHash: sha256(liveSettings),
      settingsMtime: statSync(liveSettings).mtimeMs,
    };

    const { out, code } = runScript([
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
      dbHash: sha256(liveDb),
      dbMtime: statSync(liveDb).mtimeMs,
      settingsHash: sha256(liveSettings),
      settingsMtime: statSync(liveSettings).mtimeMs,
    };
    expect(after).toEqual(before);

    // and the shadow copy is a REAL, different build (fake-ccc's fixture model dim vs ours)
    const shadowDb = join(
      mirrorShadowDbDir(join(home, ".cache", "ccc-shadow"), projectRoot),
      "target_sqlite.db",
    );
    expect(existsSync(shadowDb)).toBe(true);
    expect(sha256(shadowDb)).not.toBe(before.dbHash);
  });

  test("build reports a per-project failure without aborting the others", () => {
    const home = makeHome();
    makeGlobalSettings(join(home, ".cocoindex_code"), "old/model");
    makeProject(join(home, "proj-ok"));
    makeProject(join(home, "proj-broken"));

    const { out, code } = runScript(
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
  });

  test("build strips COCOINDEX_CODE_DAEMON_SUPERVISED so the shadow daemon can still self-spawn", () => {
    // zsh/zshenv exports this whenever the systemd unit exists, so every real invocation
    // inherits it. The shadow tree has no supervisor: leaked through, it makes each shadow
    // `ccc index` wait out the client's 30s socket timeout and fail. Regression 2026-08-08.
    const home = makeHome();
    makeGlobalSettings(join(home, ".cocoindex_code"), "old/model");
    makeProject(join(home, "proj-a"));

    const { out, code } = runScript(
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
  });

  test("build times out via AbortSignal (not a hang) when ccc index never returns", () => {
    const home = makeHome();
    makeGlobalSettings(join(home, ".cocoindex_code"), "old/model");
    makeProject(join(home, "proj-a"));

    const { out, code } = runScript(
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
  });

  test("full lifecycle: build --yes, cutover --yes, dry runs mutate nothing, rollback restores, gc prunes", () => {
    const home = makeHome();
    makeGlobalSettings(join(home, ".cocoindex_code"), "old/model-a");
    const projectRoot = join(home, "proj-a");
    makeProject(projectRoot, { dim: 768, chunks: 5 });
    const liveCcDir = join(projectRoot, ".cocoindex_code");
    const globalSettingsPath = join(
      home,
      ".cocoindex_code",
      "global_settings.yml",
    );

    const preBuildLiveHash = sha256(join(liveCcDir, "target_sqlite.db"));

    const build = runScript([
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
    const cutoverDry = runScript(["cutover", "--home", home]);
    expect(cutoverDry.code).toBe(0);
    expect(cutoverDry.out).toContain("dry run");
    expect(existsSync(liveCcDir)).toBe(true);
    expect(sha256(join(liveCcDir, "target_sqlite.db"))).toBe(preBuildLiveHash);
    expect(readEmbeddingModel(readFileSync(globalSettingsPath, "utf8"))).toBe(
      "old/model-a",
    );

    // real cutover
    const cutover = runScript([
      "cutover",
      "--home",
      home,
      "--yes",
      "--ccc-bin",
      FAKE_CCC,
    ]);
    expect(cutover.code).toBe(0);
    expect(cutover.out).toContain("RESULT: cutover complete");
    expect(readEmbeddingModel(readFileSync(globalSettingsPath, "utf8"))).toBe(
      "new/model-b",
    );
    // the live dir now holds the NEW (fake-ccc-built) index, not the original bytes
    expect(sha256(join(liveCcDir, "target_sqlite.db"))).not.toBe(
      preBuildLiveHash,
    );
    const gens = listPrevGenerations(projectRoot);
    expect(gens.length).toBe(1);
    // the parked prev generation IS the original live content, byte for byte
    const [firstGeneration] = gens;
    if (firstGeneration === undefined) {
      throw new Error("expected exactly one parked generation");
    }
    expect(sha256(join(firstGeneration.path, "target_sqlite.db"))).toBe(
      preBuildLiveHash,
    );

    // rollback dry run: must mutate nothing
    const rollbackDry = runScript(["rollback", "--home", home]);
    expect(rollbackDry.code).toBe(0);
    expect(rollbackDry.out).toContain("dry run");
    expect(listPrevGenerations(projectRoot).length).toBe(1);
    expect(readEmbeddingModel(readFileSync(globalSettingsPath, "utf8"))).toBe(
      "new/model-b",
    );

    // real rollback
    const rollback = runScript([
      "rollback",
      "--home",
      home,
      "--yes",
      "--ccc-bin",
      FAKE_CCC,
    ]);
    expect(rollback.code).toBe(0);
    expect(rollback.out).toContain("RESULT: rollback complete");
    expect(readEmbeddingModel(readFileSync(globalSettingsPath, "utf8"))).toBe(
      "old/model-a",
    );
    expect(sha256(join(liveCcDir, "target_sqlite.db"))).toBe(preBuildLiveHash);
    // rollback itself is undoable: it parked the (post-cutover) state as a new generation while
    // consuming the one it restored from — net count of .prev-* dirs for this project stays 1
    const genAfterRollback = listPrevGenerations(projectRoot);
    expect(genAfterRollback.length).toBe(1);
    // and it is NOT the same generation any more — it is the just-parked post-cutover state
    const [parkedPostCutoverGeneration] = genAfterRollback;
    if (parkedPostCutoverGeneration === undefined) {
      throw new Error("expected exactly one post-cutover generation");
    }
    expect(
      sha256(join(parkedPostCutoverGeneration.path, "target_sqlite.db")),
    ).not.toBe(preBuildLiveHash);

    // gc dry run (keep=0, so the one remaining generation IS a deletion candidate): must delete
    // nothing without --yes
    const gcDry = runScript(["gc", "--home", home, "--keep", "0"]);
    expect(gcDry.code).toBe(0);
    expect(gcDry.out).toContain("dry run");
    expect(listPrevGenerations(projectRoot).length).toBe(1);

    // real gc, keep=0 — deletes the last remaining generation
    const gc = runScript(["gc", "--home", home, "--keep", "0", "--yes"]);
    expect(gc.code).toBe(0);
    expect(gc.out).toContain("RESULT: gc deleted 1 generation(s)");
    expect(listPrevGenerations(projectRoot).length).toBe(0);
  });
});
