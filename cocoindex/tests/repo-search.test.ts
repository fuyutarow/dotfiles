import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "bun:test";

const ROUTER = join(import.meta.dir, "..", "repo-search.ts");
const COMPATIBILITY_PATH = join(
  import.meta.dir,
  "..",
  "..",
  "agents",
  "claude",
  "hooks",
  "repo-search.ts",
);

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function registerProject(): string {
  const dir = tempDir("repo-search-project-");
  mkdirSync(join(dir, ".cocoindex_code"), { recursive: true });
  writeFileSync(
    join(dir, ".cocoindex_code", "settings.yml"),
    "include_patterns: []\n",
  );
  return dir;
}

function gitCmd(dir: string, args: string[]): string {
  const result = spawnSync(
    "git",
    ["-C", dir, "-c", "commit.gpgsign=false", ...args],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

// A registered project that is ALSO a real git repo with one commit — the freshness watermark
// gate compares against `git rev-parse HEAD`, which registerProject() alone cannot exercise
// (it never runs `git init`, so gitHead() returns null).
function registerGitProject(): { dir: string; head: string } {
  const dir = registerProject();
  gitCmd(dir, ["init", "-q"]);
  gitCmd(dir, ["config", "user.email", "repo-search-test@example.com"]);
  gitCmd(dir, ["config", "user.name", "repo-search-test"]);
  gitCmd(dir, ["add", "-A"]);
  gitCmd(dir, ["commit", "-q", "-m", "init"]);
  return { dir, head: gitCmd(dir, ["rev-parse", "HEAD"]).trim() };
}

function watermarkFilePath(dir: string): string {
  return join(dir, ".cocoindex_code", "INDEXED_AT");
}

function writeWatermarkFile(
  dir: string,
  value: {
    head: string | null;
    indexedAt?: string;
    source?: string;
  },
): void {
  writeFileSync(
    watermarkFilePath(dir),
    `${JSON.stringify(
      {
        indexedAt: new Date().toISOString(),
        source: "index",
        ...value,
      },
      null,
      2,
    )}\n`,
  );
}

// A git project whose watermark is ALREADY fresh at its current HEAD — the setup most tests below
// actually want (they are exercising something else: a flag, a timeout, an error path) and would
// otherwise trip on the freshness gate before ever reaching it. Only tests that are exercising the
// freshness gate ITSELF use registerGitProject()/registerProject() directly.
function registerFreshGitProject(): { dir: string; head: string } {
  const { dir, head } = registerGitProject();
  plantIndexArtifact(dir);
  writeWatermarkFile(dir, { head });
  return { dir, head };
}

// Plants a real, non-empty file under .cocoindex_code/ that hasIndexArtifacts() (in
// repo-search.ts) will see as "an index exists" — the filesystem-level stand-in for a real `ccc
// index` run. Needed by any test that hand-writes a watermark via writeWatermarkFile() instead of
// going through the real `index` route (whose fake `ccc index` in fakeTools() below plants its
// own artifact), since checkIndexFreshness now refuses a matching watermark with nothing backing
// it on disk.
function plantIndexArtifact(dir: string): void {
  writeFileSync(
    join(dir, ".cocoindex_code", "fake_target.db"),
    "fake index bytes",
  );
}

function fakeTools(): { bin: string; log: string } {
  const bin = tempDir("repo-search-bin-");
  const log = join(tmpdir(), `repo-search-${crypto.randomUUID()}.log`);
  for (const name of ["ccc", "rg"]) {
    const path = join(bin, name);
    writeFileSync(
      path,
      `#!/bin/sh
printf '%s\\n' '${name} '"$*" >> "$FAKE_SEARCH_LOG"
if [ "${name}" = ccc ] && [ "$1" = daemon ] && [ "$2" = status ]; then
if [ "\${FAKE_CCC_INDEXING:-0}" = 1 ]; then
    printf 'Projects:\\n%s [indexing]\\n' "$PWD"
  else
    printf 'Projects:\\n%s [idle]\\n' "$PWD"
  fi
  exit 0
fi
if [ "${name}" = ccc ] && [ "$1" = index ] && [ "\${FAKE_CCC_MUTATE_GIT_DURING_INDEX:-0}" = 1 ]; then
  git -C "$PWD" -c commit.gpgsign=false commit --allow-empty -q -m "raced structural mutation" >/dev/null 2>&1
fi
if [ "${name}" = ccc ] && [ "$1" = index ]; then
  # Stand-in for the real artifacts a genuine ccc index writes under .cocoindex_code -- lets
  # hasIndexArtifacts() (repo-search.ts) see a project the router just indexed as non-empty.
  touch "$PWD/.cocoindex_code/fake_target.db" 2>/dev/null || true
fi
if [ "${name}" = ccc ] && [ "\${FAKE_CCC_SLEEP:-0}" = 1 ]; then exec sleep 2; fi
if [ "${name}" = ccc ] && [ "\${FAKE_SEARCH_NOISE:-0}" = 1 ]; then printf '%s\\n' 'Indexing: 10 files listed | error: 0'; fi
if [ "${name}" = ccc ] && [ "$1" = grep ]; then
  if [ "\${FAKE_SEARCH_EMPTY:-0}" = 1 ]; then
    if [ "\${FAKE_CCC_GREP_BLANK:-0}" = 1 ]; then
      : # print nothing at all -- the defensive, not-observed-on-real-ccc empty-stdout branch
    else
      printf '%s\\n' 'No matches found.'
    fi
  elif [ "\${FAKE_CCC_GREP_SPOOF:-0}" = 1 ]; then
    printf '%s\\n' 'decoy.js' '1| const msg = "No matches found.";'
  else
    printf '%s\\n' 'fake_match.ts'
    printf '%s\\n' ' 1| fake matched line'
  fi
  exit "\${FAKE_SEARCH_EXIT:-0}"
fi
if [ "${name}" = ccc ] && [ "\${FAKE_SEARCH_EMPTY:-0}" != 1 ]; then printf '%s\\n' '--- Result 1 (score: 0.9) ---'; fi
exit "\${FAKE_SEARCH_EXIT:-0}"
`,
    );
    chmodSync(path, 0o755);
  }
  return { bin, log };
}

function run(
  cwd: string,
  args: string[],
  env: Record<string, string> = {},
): { code: number | null; stdout: string; stderr: string; log: string } {
  const tools = fakeTools();
  const result = spawnSync(process.execPath, [ROUTER, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 5_000,
    env: {
      ...process.env,
      PATH: `${tools.bin}:${process.env.PATH ?? ""}`,
      FAKE_SEARCH_LOG: tools.log,
      ...env,
    },
  });
  let log = "";
  try {
    log = readFileSync(tools.log, "utf8");
  } catch {
    // A rejected invocation need not create the child log.
  }
  return {
    code: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    log,
  };
}

describe("repo-search route contract", () => {
  test("cocoindex owns the executable router and the old hook path resolves to it", () => {
    expect(existsSync(ROUTER)).toBe(true);
    expect(statSync(ROUTER).mode & 0o111).not.toBe(0);
    expect(realpathSync(COMPATIBILITY_PATH)).toBe(realpathSync(ROUTER));
  });

  test("concept routes to ccc search without an implicit refresh", () => {
    const { dir } = registerFreshGitProject();
    const result = run(dir, [
      "concept",
      "--query",
      "where authorization is enforced",
      "--path",
      "src/**/*.ts",
      "--limit",
      "5",
    ]);

    expect(result.code).toBe(0);
    expect(result.log).toContain("ccc search where authorization is enforced");
    expect(result.log).toContain("--limit 5");
    expect(result.log).toContain("--path src/**/*.ts");
    expect(result.log).not.toContain("--refresh");
    expect(result.stdout).toContain("RESULT: PASS route=concept engine=ccc");
  });

  test("an exit-zero empty ccc result is not reported as PASS", () => {
    const { dir } = registerFreshGitProject();
    const result = run(dir, ["concept", "--query", "known positive control"], {
      FAKE_SEARCH_EMPTY: "1",
      FAKE_SEARCH_NOISE: "1",
    });

    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("RESULT: PASS");
    expect(result.stderr).toContain("RESULT: NO_MATCH");
  });

  test("battery requires at least three queries", () => {
    const result = run(registerProject(), [
      "battery",
      "--query",
      "first",
      "--query",
      "second",
    ]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("at least 3");
    expect(result.log).toBe("");
  });

  test("battery runs every query without an implicit refresh", () => {
    const { dir } = registerFreshGitProject();
    const result = run(dir, [
      "battery",
      "--query",
      "first mechanism",
      "--query",
      "second vocabulary",
      "--query",
      "third Japanese query",
    ]);
    const calls = result.log
      .trim()
      .split("\n")
      .filter((call) => call.startsWith("ccc search"));

    expect(result.code).toBe(0);
    expect(calls).toHaveLength(3);
    expect(calls[0]).not.toContain("--refresh");
    expect(calls[1]).not.toContain("--refresh");
    expect(calls[2]).not.toContain("--refresh");
    expect(result.stdout).toContain("queries=3");
  });

  test("concept refreshes only when explicitly requested", () => {
    const { dir } = registerFreshGitProject();
    const result = run(dir, [
      "concept",
      "--query",
      "where authorization is enforced",
      "--refresh",
    ]);

    expect(result.code).toBe(0);
    expect(result.log).toContain("ccc search where authorization is enforced");
    expect(result.log).toContain("--refresh");
  });

  test("concept fails fast while its ccc project is indexing", () => {
    const { dir } = registerFreshGitProject();
    const result = run(
      dir,
      ["concept", "--query", "semantic request", "--timeout-ms", "30"],
      { FAKE_CCC_INDEXING: "1" },
    );

    expect(result.code).toBe(75);
    expect(result.log).toContain("ccc daemon status");
    expect(result.log).not.toContain("ccc search");
    expect(result.stderr).toContain("RESULT: INDEXING");
  });

  test("a fresh watermark matching current HEAD lets concept search proceed", () => {
    const { dir, head } = registerGitProject();
    plantIndexArtifact(dir);
    writeWatermarkFile(dir, { head });

    const result = run(dir, [
      "concept",
      "--query",
      "where authorization is enforced",
    ]);

    expect(result.code).toBe(0);
    expect(result.log).toContain("ccc search where authorization is enforced");
    expect(result.stdout).toContain("RESULT: PASS route=concept engine=ccc");
  });

  test("a watermark built at a different HEAD is refused as NO_INDEX, naming both HEADs and the remedy", () => {
    const { dir, head } = registerGitProject();
    const staleHead = "a".repeat(40);
    writeWatermarkFile(dir, { head: staleHead });

    const result = run(dir, [
      "concept",
      "--query",
      "where authorization is enforced",
    ]);

    expect(result.code).toBe(3);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "RESULT: NO_INDEX route=concept engine=ccc",
    );
    expect(result.stderr).toContain(`index was built at HEAD=${staleHead}`);
    expect(result.stderr).toContain(`working tree is now at HEAD=${head}`);
    expect(result.stderr).toContain("Remedy: run 'repo-search index'");
    // The gate refuses BEFORE the child ever runs — no ccc invocation reaches the log.
    expect(result.log).toBe("");
  });

  test("battery is refused as NO_INDEX before any query runs, not partway through", () => {
    const { dir } = registerGitProject();
    writeWatermarkFile(dir, { head: "b".repeat(40) });

    const result = run(dir, [
      "battery",
      "--query",
      "first",
      "--query",
      "second",
      "--query",
      "third",
    ]);

    expect(result.code).toBe(3);
    expect(result.stderr).toContain(
      "RESULT: NO_INDEX route=battery engine=ccc",
    );
    expect(result.log).toBe("");
  });

  test("a missing watermark file is treated as stale, never as fresh", () => {
    const { dir, head } = registerGitProject();
    // No watermark written at all — this is the state of EVERY ccc project on the machine
    // before this gate existed; treating it as fresh would make the gate a no-op on day one.

    const result = run(dir, [
      "concept",
      "--query",
      "where authorization is enforced",
    ]);

    expect(result.code).toBe(3);
    expect(result.stderr).toContain(
      "RESULT: NO_INDEX route=concept engine=ccc",
    );
    expect(result.stderr).toContain("no freshness watermark at");
    expect(result.stderr).toContain(`current HEAD=${head}`);
    expect(result.log).toBe("");
  });

  test("a corrupt watermark file is treated as stale, never as fresh", () => {
    const { dir } = registerGitProject();
    writeFileSync(watermarkFilePath(dir), "not valid json{{{");

    const result = run(dir, [
      "concept",
      "--query",
      "where authorization is enforced",
    ]);

    expect(result.code).toBe(3);
    expect(result.stderr).toContain(
      "RESULT: NO_INDEX route=concept engine=ccc",
    );
    expect(result.stderr).toContain("unreadable/corrupt");
    expect(result.log).toBe("");
  });

  // --- Item 1 regressions: a project with no git HEAD is a RECORDABLE fact that only `index` may
  // write, never a fact the read side infers from silence. ---------------------------------------

  test("a never-indexed project with no git HEAD at all is refused as NO_INDEX, not warned-and-proceed", () => {
    // registerProject() alone (no git init) models a ccc-registered directory that either isn't
    // a git repo or has no commits yet — a real, if rare, state. BEFORE THE FIX this fell through
    // a warn-and-proceed branch straight to a served `RESULT: PASS` on stdout with exit 0 --
    // byte-for-byte indistinguishable, to a caller reading only stdout+exit code, from a
    // genuinely verified answer. Reproduced live: a non-git ccc project was indexed once, its
    // indexed file was then rewritten without reindexing, and the stale content still came back
    // as PASS. AFTER THE FIX it gets exactly the same refusal any other unindexed project gets.
    const dir = registerProject();

    const result = run(dir, [
      "concept",
      "--query",
      "where authorization is enforced",
    ]);

    expect(result.code).toBe(3);
    expect(result.stdout).toBe("");
    expect(result.stdout).not.toContain("RESULT: PASS");
    expect(result.stderr).not.toContain("WARNING:");
    expect(result.stderr).toContain(
      "RESULT: NO_INDEX route=concept engine=ccc",
    );
    expect(result.stderr).toContain("current HEAD=(none");
    expect(result.log).toBe("");
  });

  // (Coverage for "indexing a no-git project records a verified head:null watermark, and search
  // then passes" lives below, under "index records a verified head:null watermark for a project
  // with no git HEAD" -- it exercises the same null-HEAD path through the surviving `index`
  // command, so it is not duplicated here.)

  test("a no-git watermark stops matching the instant the project gains a git HEAD", () => {
    const dir = registerProject();
    run(dir, ["index"]); // records head: null

    gitCmd(dir, ["init", "-q"]);
    gitCmd(dir, ["config", "user.email", "repo-search-test@example.com"]);
    gitCmd(dir, ["config", "user.name", "repo-search-test"]);
    gitCmd(dir, ["add", "-A"]);
    gitCmd(dir, [
      "commit",
      "-q",
      "-m",
      "gained a HEAD after being indexed as headless",
    ]);

    const result = run(dir, ["concept", "--query", "x"]);
    expect(result.code).toBe(3);
    expect(result.stderr).toContain(
      "RESULT: NO_INDEX route=concept engine=ccc",
    );
  });

  test("a stale watermark does not block the literal rg route", () => {
    const { dir } = registerGitProject();
    writeWatermarkFile(dir, { head: "c".repeat(40) });

    const result = run(dir, ["literal", "--query", "TODO"]);

    expect(result.code).toBe(0);
    expect(result.log).toContain("rg --fixed-strings");
    expect(result.stdout).toContain("RESULT: PASS route=literal engine=rg");
  });

  test("a stale watermark does not block the structural ccc-grep route", () => {
    const { dir } = registerGitProject();
    writeWatermarkFile(dir, { head: "d".repeat(40) });

    const result = run(dir, ["structural", "--query", "foo(\\(ARGS*\\))"]);

    expect(result.code).toBe(0);
    expect(result.log).toContain("ccc grep foo(\\(ARGS*\\))");
    expect(result.stdout).toContain(
      "RESULT: PASS route=structural engine=ccc-grep",
    );
  });

  // --- `stamp` deletion regressions: the subcommand asserted freshness without ever running an
  // indexer, and was defeated live by `GIT_COMMITTER_DATE`/`git commit --date=` — one standard
  // git flag backdated a commit, `stamp` certified the (now stale) index as fresh at that commit,
  // and the stale content came back as RESULT: PASS exit 0 with no race required. It was deleted
  // rather than patched again; a leftover watermark it already wrote must still be refused. ------

  test('a leftover source:"stamp" watermark is refused, never silently trusted', () => {
    const { dir, head } = registerGitProject();
    plantIndexArtifact(dir);
    writeWatermarkFile(dir, { head, source: "stamp" }); // as the deleted subcommand used to write

    const result = run(dir, [
      "concept",
      "--query",
      "where authorization is enforced",
    ]);

    expect(result.code).toBe(3);
    expect(result.stdout).toBe("");
    expect(result.stdout).not.toContain("RESULT: PASS");
    expect(result.stderr).toContain(
      "RESULT: NO_INDEX route=concept engine=ccc",
    );
    expect(result.stderr).toContain('source="stamp"');
    expect(result.stderr).toContain("Remedy: run 'repo-search index'");
    // The gate refuses BEFORE the child ever runs — no ccc invocation reaches the log.
    expect(result.log).toBe("");
  });

  test("a watermark matching current HEAD with no ccc index artifacts on disk is refused, not served as PASS", () => {
    // The read side used to trust head-equality alone. A hand-written watermark in a directory
    // `ccc index` never touched — the exact defect a verifier reproduced — must not pass either.
    const { dir, head } = registerGitProject();
    writeWatermarkFile(dir, { head }); // no plantIndexArtifact(dir): .cocoindex_code has only settings.yml

    const result = run(dir, [
      "concept",
      "--query",
      "where authorization is enforced",
    ]);

    expect(result.code).toBe(3);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "RESULT: NO_INDEX route=concept engine=ccc",
    );
    expect(result.stderr).toContain("no ccc index artifacts exist");
    expect(result.stderr).toContain("Remedy: run 'repo-search index'");
    expect(result.log).toBe("");
  });

  test("an index-sourced watermark backed by a real index artifact is served at full confidence", () => {
    const { dir, head } = registerGitProject();
    plantIndexArtifact(dir);
    writeWatermarkFile(dir, { head }); // helper defaults source: "index"

    const result = run(dir, [
      "concept",
      "--query",
      "where authorization is enforced",
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("confidence=verified(index)");
    expect(result.stdout).not.toContain("operator-asserted");
  });

  test("index runs ccc index then records the watermark at the resulting HEAD, labelled verified", () => {
    const { dir, head } = registerGitProject();

    const result = run(dir, ["index"]);

    expect(result.code).toBe(0);
    expect(result.log).toContain("ccc index");
    expect(result.stdout).toContain(
      `RESULT: INDEXED project=${dir} head=${head}`,
    );
    expect(result.stdout).toContain("confidence=verified(index)");
    const written = JSON.parse(readFileSync(watermarkFilePath(dir), "utf8"));
    expect(written.head).toBe(head);
    expect(written.source).toBe("index");

    const search = run(dir, ["concept", "--query", "x"]);
    expect(search.code).toBe(0);
    expect(search.stdout).toContain("confidence=verified(index)");
  });

  test("a plain 'ccc index' run by hand does not permanently stick the watermark stale — the wrapper both reindexes and records the watermark in one step", () => {
    const { dir, head: firstHead } = registerGitProject();
    run(dir, ["index"]);
    gitCmd(dir, ["commit", "--allow-empty", "-q", "-m", "second"]);
    const secondHead = gitCmd(dir, ["rev-parse", "HEAD"]).trim();
    expect(secondHead).not.toBe(firstHead);

    // Before re-indexing, the watermark from the first commit is now stale for the new HEAD.
    const stale = run(dir, ["concept", "--query", "x"]);
    expect(stale.code).toBe(3);

    // repo-search index closes the gap in one step: reindex + record the watermark at the
    // CURRENT head.
    const result = run(dir, ["index"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      `RESULT: INDEXED project=${dir} head=${secondHead}`,
    );

    const fresh = run(dir, ["concept", "--query", "x"]);
    expect(fresh.code).toBe(0);
  });

  test("index leaves the watermark unchanged when ccc index itself fails", () => {
    const { dir, head } = registerGitProject();
    run(dir, ["index"]); // establish a known-good watermark first
    const before = readFileSync(watermarkFilePath(dir), "utf8");

    const result = run(dir, ["index"], { FAKE_SEARCH_EXIT: "1" });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("FATAL: ccc index failed");
    expect(readFileSync(watermarkFilePath(dir), "utf8")).toBe(before);
  });

  test("index records a verified head:null watermark for a project with no git HEAD, and search then passes", () => {
    const dir = registerProject();

    const result = run(dir, ["index"]);

    expect(result.code).toBe(0);
    expect(result.stderr).toContain("NOTE:");
    expect(result.stderr).toContain("not inside a git repository");
    expect(result.stdout).toContain("RESULT: INDEXED");
    const written = JSON.parse(readFileSync(watermarkFilePath(dir), "utf8"));
    expect(written.head).toBeNull();
    expect(written.source).toBe("index");

    const search = run(dir, ["concept", "--query", "x"]);
    expect(search.code).toBe(0);
  });

  // --- Item 5 regression: a structural git mutation landing DURING an in-flight `ccc index`. --

  test("index refuses to certify the watermark when HEAD moves mid-scan (the race the audit named)", () => {
    const { dir, head: headBefore } = registerGitProject();

    const result = run(dir, ["index"], {
      FAKE_CCC_MUTATE_GIT_DURING_INDEX: "1",
    });

    const headAfter = gitCmd(dir, ["rev-parse", "HEAD"]).trim();
    expect(headAfter).not.toBe(headBefore); // the fake really did mutate git mid-run

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("FATAL: HEAD moved during 'ccc index'");
    expect(result.stderr).toContain(headBefore);
    expect(result.stderr).toContain(headAfter);
    expect(existsSync(watermarkFilePath(dir))).toBe(false);
  });

  test("literal routes to fixed-string rg even in a ccc project", () => {
    const result = run(registerProject(), [
      "literal",
      "--query",
      "TODO",
      "--path",
      "src",
      "--glob",
      "*.ts",
    ]);

    expect(result.code).toBe(0);
    expect(result.log).toContain("rg --fixed-strings");
    expect(result.log).toContain("--glob *.ts");
    expect(result.log).toContain("-- TODO src");
    expect(result.stdout).toContain("RESULT: PASS route=literal engine=rg");
  });

  test("exhaustive routes the regex to rg without fixed-string mode", () => {
    const result = run(registerProject(), [
      "exhaustive",
      "--query",
      "TODO|FIXME",
    ]);

    expect(result.code).toBe(0);
    expect(result.log).toContain("rg --line-number");
    expect(result.log).not.toContain("--fixed-strings");
    expect(result.log).toContain("-- TODO|FIXME .");
  });

  test("files routes to rg --files without a query", () => {
    const result = run(registerProject(), [
      "files",
      "--path",
      "agents",
      "--glob",
      "*.ts",
    ]);

    expect(result.code).toBe(0);
    expect(result.log).toContain("rg --files");
    expect(result.log).toContain("--glob *.ts");
    expect(result.log).toContain("agents");
  });

  test("structural routes to ccc grep without requiring registration", () => {
    const result = run(tempDir("repo-search-unregistered-"), [
      "structural",
      "--query",
      "foo(\\(ARGS*\\))",
      "--path",
      "src/**/*.ts",
    ]);

    expect(result.code).toBe(0);
    expect(result.log).toContain("ccc grep foo(\\(ARGS*\\))");
    expect(result.log).toContain("--path src/**/*.ts");
    expect(result.stdout).toContain(
      "RESULT: PASS route=structural engine=ccc-grep",
    );
  });

  // --- Item 3 regressions: `ccc grep`'s real "No matches found." sentinel, not an idealized
  // empty stdout the tool never actually produces, must be read as NO_MATCH. This is THE defect:
  // real `ccc grep` (v0.2.41) exits 0 and prints exactly that sentence on a genuine no-match, so
  // the old check (`stdout.trim() === ""`) was never true and structural could never report
  // NO_MATCH — reproduced live against this repo with a guaranteed-absent by-example pattern. ---

  test("ccc grep's own literal 'No matches found.' sentinel is read as NO_MATCH, never PASS", () => {
    const result = run(
      tempDir("repo-search-unregistered-"),
      ["structural", "--query", "foo(\\(ARGS*\\))"],
      { FAKE_SEARCH_EMPTY: "1" },
    );

    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("RESULT: PASS");
    expect(result.stderr).toContain(
      "RESULT: NO_MATCH route=structural engine=ccc-grep",
    );
    expect(result.stderr).toContain("ccc reported no matches");
  });

  test("structural is not spoofed by a real match whose own content contains the no-match sentence", () => {
    // A file containing the literal text "No matches found." (e.g. a string constant) must still
    // be reported as a real match when ccc grep actually matches it — a plain substring test on
    // the whole output would misreport this as NO_MATCH; exact whole-output equality does not,
    // because a real match's output always leads with a "path\nline| content" block.
    const result = run(
      tempDir("repo-search-unregistered-"),
      ["structural", "--query", "foo(\\(ARGS*\\))"],
      { FAKE_CCC_GREP_SPOOF: "1" },
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      "RESULT: PASS route=structural engine=ccc-grep",
    );
  });

  test("a genuinely empty ccc grep stdout is also read as NO_MATCH (defensive branch, not observed on real ccc)", () => {
    const result = run(
      tempDir("repo-search-unregistered-"),
      ["structural", "--query", "foo(\\(ARGS*\\))"],
      { FAKE_SEARCH_EMPTY: "1", FAKE_CCC_GREP_BLANK: "1" },
    );

    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("RESULT: PASS");
    expect(result.stderr).toContain(
      "RESULT: NO_MATCH route=structural engine=ccc-grep",
    );
    expect(result.stderr).toContain("empty output is not PASS");
  });

  test("concept never degrades silently to rg outside a ccc project", () => {
    const result = run(tempDir("repo-search-unregistered-"), [
      "concept",
      "--query",
      "semantic request",
    ]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("not ccc-registered");
    expect(result.log).toBe("");
  });

  test("symbol routes to Serena instead of pretending the shell can do it", () => {
    const result = run(registerProject(), [
      "symbol",
      "--query",
      "UserService.authorize",
    ]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Serena");
    expect(result.log).toBe("");
  });

  test("a hung ccc query exits 124", () => {
    const { dir } = registerFreshGitProject();
    const result = run(
      dir,
      ["concept", "--query", "semantic request", "--timeout-ms", "30"],
      { FAKE_CCC_SLEEP: "1" },
    );

    expect(result.code).toBe(124);
    expect(result.stderr).toContain("timed out");
  });

  test("Cleye strictFlags owns ordinary unknowns", () => {
    const result = run(registerProject(), [
      "literal",
      "--query",
      "needle",
      "--wat",
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Error: Unknown flag: --wat.");
  });

  test("the __proto__ unknown-flag edge cannot bypass rejection", () => {
    const result = run(registerProject(), [
      "literal",
      "--query",
      "needle",
      "--__proto__",
    ]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("unknown option '--__proto__'");
    expect(result.log).toBe("");
  });

  test("root help declares the complete route surface, and no longer lists the deleted stamp command", () => {
    const result = run(registerProject(), ["--help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("concept");
    expect(result.stdout).toContain("battery");
    expect(result.stdout).toContain("structural");
    expect(result.stdout).toContain("index");
    expect(result.stdout).not.toMatch(/\bstamp\b/);
    expect(result.log).toBe("");
  });

  test("the deleted stamp command is now an unknown route, not a usage form", () => {
    const result = run(registerProject(), ["stamp"]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("unknown route 'stamp'");
  });

  test("route-qualified help remains non-executing", () => {
    const result = run(registerProject(), ["literal", "--help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("--query");
    expect(result.stdout).toContain("--glob");
    expect(result.stdout).toContain("--timeout-ms");
    expect(result.log).toBe("");
  });

  test("Cleye help precedes ordinary strict-flag reporting", () => {
    const result = run(registerProject(), ["literal", "--help", "--wat"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.log).toBe("");
  });

  test("framework help bypasses positional execution", () => {
    const result = run(registerProject(), ["literal", "extra", "--help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.log).toBe("");
  });

  for (const args of [
    ["literal", "--query", "   ", "--help"],
    ["literal", "-q", "first", "-q", "second", "--help"],
    ["battery", "-q", "first", "-q", "second", "--help"],
    ["concept", "-q", "needle", "-p", "src", "-p", "tests", "--help"],
    [
      "literal",
      "--query",
      "needle",
      "--count",
      "--files-with-matches",
      "--help",
    ],
  ] as const) {
    test("framework help bypasses route semantic execution", () => {
      const result = run(registerProject(), [...args]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Usage:");
      expect(result.log).toBe("");
    });
  }

  test("a flag belonging to another route is rejected", () => {
    // `--limit` moved from concept/battery-only to also cover literal/exhaustive
    // (2026-09-02, 0a's report: a broad regex on a large repo had no cap). `files` still
    // has no notion of a match count, so it stays the negative case here.
    const result = run(registerProject(), [
      "files",
      "--path",
      "cocoindex",
      "--limit",
      "3",
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Error: Unknown flag: --limit.");
    expect(result.log).toBe("");
  });

  test("**literal/exhaustive now accept `--limit`**——rg の -m/--max-count へ渡す", () => {
    // WHY (2026-09-02、腕 0a の報告): concept/battery は最初から --limit を持つのに、
    //   語彙 route だけ rg の -m を露出していなかった。広い正規表現が大きな repo で
    //   無制限に一致を返しうる。
    const result = run(registerProject(), [
      "literal",
      "--query",
      "needle",
      "--limit",
      "3",
    ]);
    expect(result.stderr).not.toContain("Unknown flag");
  });

  test("files rejects search-result modifiers that would change rg mode", () => {
    const result = run(registerProject(), [
      "files",
      "--path",
      "cocoindex",
      "--count",
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Error: Unknown flag: --count.");
    expect(result.log).toBe("");
  });

  test("an explicitly false ordinary unknown still reaches strictFlags", () => {
    const result = run(registerProject(), [
      "files",
      "--path",
      "cocoindex",
      "--count=false",
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Error: Unknown flag: --count.");
    expect(result.log).toBe("");
  });

  for (const args of [
    ["concept", "--query", "needle", "--hidden=false", "--help"],
    ["--help", "--count=false"],
  ]) {
    test("Cleye help precedes explicitly false ordinary unknowns", () => {
      const result = run(registerProject(), args);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Usage:");
      expect(result.log).toBe("");
    });
  }

  test("files still permits inventory-relevant hidden-file traversal", () => {
    const result = run(registerProject(), [
      "files",
      "--path",
      "cocoindex",
      "--hidden",
    ]);

    expect(result.code).toBe(0);
    expect(result.log).toContain("rg --files --color never --hidden cocoindex");
  });

  test("short aliases collect repeatable queries, paths, and globs", () => {
    const result = run(registerProject(), [
      "literal",
      "-q",
      "needle",
      "-p",
      "src",
      "-p",
      "tests",
      "-g",
      "*.ts",
    ]);

    expect(result.code).toBe(0);
    expect(result.log).toContain("--glob *.ts");
    expect(result.log).toContain("-- needle src tests");
  });

  for (const [route, flag, value] of [
    ["concept", "--limit", "0"],
    ["literal", "--timeout-ms", "NaN"],
    ["literal", "--context", "-1"],
  ]) {
    test(`${flag} rejects a non-positive or malformed integer`, () => {
      const result = run(registerProject(), [
        route,
        "--query",
        "needle",
        flag,
        value,
      ]);

      expect(result.code).toBe(2);
      expect(result.stderr).toContain(`${flag} must be a positive integer`);
      expect(result.log).toBe("");
    });
  }

  for (const [route, args, flag] of [
    ["literal", ["--query", "--help"], "--query"],
    ["literal", ["--query", "needle", "--path"], "--path"],
    ["files", ["--glob"], "--glob"],
  ] as const) {
    test(`${flag} rejects a missing value before help or execution`, () => {
      const result = run(registerProject(), [route, ...args]);

      expect(result.code).toBe(2);
      expect(result.stderr).toContain(`${flag} requires a value`);
      expect(result.log).toBe("");
    });
  }

  test("unexpected positionals are usage errors", () => {
    const result = run(registerProject(), [
      "literal",
      "extra",
      "--query",
      "needle",
    ]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("unexpected positional arguments: extra");
    expect(result.log).toBe("");
  });

  test("camelCase schema keys keep the kebab-case CLI spelling", () => {
    const result = run(registerProject(), [
      "literal",
      "--query",
      "needle",
      "--timeoutMs",
      "30",
    ]);

    expect(result.code).toBe(0);
    expect(result.log).toContain("rg --fixed-strings");
  });
});
