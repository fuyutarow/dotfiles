import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, setDefaultTimeout, test } from "bun:test";

// Each case starts a Bun router child; the live case also waits for the ccc daemon.
setDefaultTimeout(60_000);

const ROUTER = join(import.meta.dir, "..", "src", "repo-retrieve.ts");
// The indexed ccc root the workspace is a worktree of; the workspace itself is not indexed.
const INDEXED_ROOT = join(userInfo().homedir, "dotfiles");
const DB_ROOT_DECLARATION = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "cocoindex",
  "db-root",
);

// Environment for a search against the live daemon.
//  - bunfig.toml's test preload points HOME at a throwaway directory, but ccc finds its daemon
//    through HOME, so the real one is restored (otherwise ccc waits for a daemon that is not
//    there and may start a second, unmanaged one).
//  - The index DB, and with it the INDEXED_AT freshness watermark, lives where the one
//    declaration cocoindex/db-root says (zsh/zshenv exports it for interactive clients). A
//    verify environment without zshenv has no mapping and would look for the watermark inside
//    the repo, report NO_INDEX (exit 3) and ask for a reindex of the shared root; so the mapping
//    is derived from the declaration here, exactly as zsh/zshenv does.
function liveEnv(): Record<string, string | undefined> {
  const home = userInfo().homedir;
  const root = readFileSync(DB_ROOT_DECLARATION, "utf8").trim();
  return {
    ...process.env,
    HOME: home,
    COCOINDEX_CODE_DB_PATH_MAPPING: `${home}=${join(home, root)}`,
  };
}

function tempDir(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

// A fake `ccc` that owns the language partition: it holds one hit per language and applies
// `--lang` ITSELF, the way ccc's vec0 partition does. The router therefore passes a filter only
// by handing the flag to ccc; filtering ccc's output afterwards could not change what this prints.
// ccc lowercases `grep --lang` but not `search --lang`; the fake keeps both verbatim.
function fakeCcc(): { bin: string; log: string } {
  const bin = tempDir("rr-lang-bin-");
  const log = join(bin, "calls.log");
  writeFileSync(
    join(bin, "ccc"),
    `#!/bin/sh
# // dotfiles:ccc-index-entry
printf 'ccc %s\\n' "$*" >> "$FAKE_LANG_LOG"
if [ "$1" = daemon ] && [ "$2" = status ]; then
  printf 'Projects:\\n%s [idle]\\n' "$PWD"
  exit 0
fi
mode="$1"
langs=""
shift
while [ $# -gt 0 ]; do
  if [ "$1" = --lang ]; then langs="$langs $2"; shift; fi
  shift
done
hit() {
  case "$langs" in
    "") return 0 ;;
    *" $1"*) return 0 ;;
  esac
  return 1
}
n=0
if [ "$mode" = search ]; then
  for pair in README.md:markdown src/a.ts:typescript src/b.py:python; do
    file="\${pair%%:*}"; lang="\${pair##*:}"
    if hit "$lang"; then
      n=$((n + 1))
      printf -- '--- Result %s (score: 0.9) ---\\nFile: %s:1-1 [%s]\\nhit\\n\\n' "$n" "$file" "$lang"
    fi
  done
  exit 0
fi
if [ "$mode" = grep ]; then
  for pair in README.md:markdown src/a.ts:typescript src/b.py:python; do
    file="\${pair%%:*}"; lang="\${pair##*:}"
    if hit "$lang"; then n=$((n + 1)); printf '%s\\n 1| hit\\n' "$file"; fi
  done
  if [ "$n" = 0 ]; then printf 'No matches found.\\n'; fi
  exit 0
fi
exit 0
`,
  );
  chmodSync(join(bin, "ccc"), 0o755);
  return { bin, log };
}

function git(dir: string, args: string[]): string {
  const result = spawnSync(
    "git",
    ["-C", dir, "-c", "commit.gpgsign=false", ...args],
    { encoding: "utf8" },
  );
  expect(result.status).toBe(0);
  return result.stdout;
}

// A registered git project whose index watermark is fresh at HEAD, so the freshness gate passes
// and the route reaches `ccc search`.
function freshProject(): string {
  const dir = tempDir("rr-lang-project-");
  mkdirSync(join(dir, ".cocoindex_code"), { recursive: true });
  writeFileSync(
    join(dir, ".cocoindex_code", "settings.yml"),
    "include_patterns: []\n",
  );
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.email", "rr-lang-filter@example.com"]);
  git(dir, ["config", "user.name", "rr-lang-filter"]);
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "init"]);
  const head = git(dir, ["rev-parse", "HEAD"]).trim();
  writeFileSync(join(dir, ".cocoindex_code", "fake_target.db"), "fake index");
  writeFileSync(
    join(dir, ".cocoindex_code", "INDEXED_AT"),
    `${JSON.stringify({
      indexedAt: Temporal.Now.instant().toString({ fractionalSecondDigits: 3 }),
      source: "index",
      head,
    })}\n`,
  );
  return dir;
}

function route(
  args: string[],
  extraEnv: Record<string, string> = {},
): { code: number | null; stdout: string; stderr: string; calls: string[] } {
  const project = freshProject();
  const tools = fakeCcc();
  const result = spawnSync(process.execPath, [ROUTER, ...args], {
    cwd: project,
    encoding: "utf8",
    timeout: 30_000,
    env: {
      ...process.env,
      PATH: `${tools.bin}:${process.env["PATH"] ?? ""}`,
      FAKE_LANG_LOG: tools.log,
      COCOINDEX_CODE_DB_PATH_MAPPING: "",
      REPO_RETRIEVE_AUTO_INDEX: "0",
      REPO_RETRIEVE_INDEX_WORKER: "0",
      XDG_STATE_HOME: join(tools.bin, "state"),
      XDG_RUNTIME_DIR: join(tools.bin, "runtime"),
      ...extraEnv,
    },
  });
  const calls = existsSync(tools.log)
    ? readFileSync(tools.log, "utf8").split("\n").filter(Boolean)
    : [];
  return {
    code: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    calls,
  };
}

const queryCalls = (calls: string[], mode: "search" | "grep"): string[] =>
  calls.filter((call) => call.startsWith(`ccc ${mode} `));

const resultLanguages = (stdout: string): string[] =>
  [...stdout.matchAll(/^File: \S+ \[([^\]]+)\]$/gmu)].map(
    (match) => match[1] ?? "",
  );

describe("--lang reaches ccc search on about and absent", () => {
  test("about passes --lang to ccc search and ccc narrows the hits", () => {
    const result = route(["about", "retry policy", "--lang", "markdown"]);

    expect(result.code).toBe(0);
    const [call] = queryCalls(result.calls, "search");
    expect(call).toContain("--lang markdown");
    expect(resultLanguages(result.stdout)).toEqual(["markdown"]);
  });

  test("absent passes --lang to every ccc search of the battery", () => {
    const result = route([
      "absent",
      "-q",
      "retry policy",
      "-q",
      "backoff",
      "-q",
      "再試行",
      "--lang",
      "python",
    ]);

    expect(result.code).toBe(0);
    const calls = queryCalls(result.calls, "search");
    expect(calls).toHaveLength(3);
    for (const call of calls) expect(call).toContain("--lang python");
    expect(resultLanguages(result.stdout)).toEqual([
      "python",
      "python",
      "python",
    ]);
  });

  test("repeated --lang values are each handed to ccc, which unions them", () => {
    const result = route([
      "about",
      "retry policy",
      "--lang",
      "markdown",
      "--lang",
      "python",
    ]);

    expect(result.code).toBe(0);
    const [call] = queryCalls(result.calls, "search");
    expect(call).toContain("--lang markdown --lang python");
    expect(resultLanguages(result.stdout)).toEqual(["markdown", "python"]);
  });

  test("a language name is passed to ccc unchanged, not normalised or checked", () => {
    const result = route(["about", "retry policy", "--lang", "Markdown"]);

    const [call] = queryCalls(result.calls, "search");
    expect(call).toContain("--lang Markdown");
    expect(call).not.toContain("--lang markdown");
  });

  test("the language filter composes with --path", () => {
    const result = route([
      "about",
      "retry policy",
      "--path",
      "src/**",
      "--lang",
      "typescript",
    ]);

    const [call] = queryCalls(result.calls, "search");
    expect(call).toContain("--path src/**");
    expect(call).toContain("--lang typescript");
  });
});

describe("--lang reaches ccc grep on shape", () => {
  test("shape passes --lang to ccc grep and ccc narrows the files", () => {
    const result = route(["shape", "foo(\\(ARGS*\\))", "--lang", "python"]);

    expect(result.code).toBe(0);
    const [call] = queryCalls(result.calls, "grep");
    expect(call).toContain("--lang python");
    expect(result.stdout).toContain("src/b.py");
    expect(result.stdout).not.toContain("src/a.ts");
    expect(result.stdout).not.toContain("README.md");
  });

  test("repeated --lang values reach ccc grep", () => {
    const result = route([
      "shape",
      "foo(\\(ARGS*\\))",
      "--lang",
      "python",
      "--lang",
      "typescript",
    ]);

    const [call] = queryCalls(result.calls, "grep");
    expect(call).toContain("--lang python --lang typescript");
    expect(result.stdout).toContain("src/a.ts");
    expect(result.stdout).toContain("src/b.py");
    expect(result.stdout).not.toContain("README.md");
  });

  test("a language ccc matches nothing in is an ordinary NO_MATCH", () => {
    const result = route(["shape", "foo(\\(ARGS*\\))", "--lang", "cobol"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("RESULT: NO_MATCH route=structural");
  });
});

describe("a route without --lang behaves as before", () => {
  test("about hands ccc no --lang and returns every language", () => {
    const result = route(["about", "retry policy"]);

    expect(result.code).toBe(0);
    const [call] = queryCalls(result.calls, "search");
    expect(call).not.toContain("--lang");
    expect(resultLanguages(result.stdout)).toEqual([
      "markdown",
      "typescript",
      "python",
    ]);
  });

  test("shape hands ccc no --lang and returns every file", () => {
    const result = route(["shape", "foo(\\(ARGS*\\))"]);

    expect(result.code).toBe(0);
    const [call] = queryCalls(result.calls, "grep");
    expect(call).not.toContain("--lang");
    expect(result.stdout).toContain("README.md");
    expect(result.stdout).toContain("src/a.ts");
    expect(result.stdout).toContain("src/b.py");
  });
});

describe("--lang input is validated", () => {
  test("an empty --lang value is refused before ccc runs", () => {
    const result = route(["about", "retry policy", "--lang", ""]);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("--lang requires a value");
    expect(queryCalls(result.calls, "search")).toEqual([]);
  });

  test("a missing --lang value is refused rather than eating the next flag", () => {
    const result = route(["about", "retry policy", "--lang", "--limit", "3"]);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("--lang requires a value");
    expect(queryCalls(result.calls, "search")).toEqual([]);
  });

  test("the lexical routes do not accept --lang", () => {
    const result = route(["text", "needle", "--lang", "markdown"]);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("Unknown flag: --lang");
  });
});

describe("a real search through this workspace's entry in the indexed root", () => {
  test("rr about --lang markdown returns only Markdown hits", () => {
    const result = spawnSync(
      process.execPath,
      [
        ROUTER,
        "about",
        "language filter for semantic search",
        "--lang",
        "markdown",
        "--limit",
        "5",
      ],
      {
        cwd: INDEXED_ROOT,
        encoding: "utf8",
        timeout: 50_000,
        env: liveEnv(),
      },
    );

    // Exit 3 is NO_INDEX (stale index); the stderr is shown so a busy or stale daemon is
    // reported, never skipped.
    expect({ status: result.status, stderr: result.stderr }).toMatchObject({
      status: 0,
    });
    const languages = resultLanguages(result.stdout ?? "");
    expect(languages.length).toBeGreaterThan(0);
    expect(new Set(languages)).toEqual(new Set(["markdown"]));
    expect(result.stdout).toContain("RESULT: PASS route=concept engine=ccc");
  });
});
