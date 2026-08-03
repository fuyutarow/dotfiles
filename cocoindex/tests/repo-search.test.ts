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

function fakeTools(): { bin: string; log: string } {
  const bin = tempDir("repo-search-bin-");
  const log = join(tmpdir(), `repo-search-${crypto.randomUUID()}.log`);
  for (const name of ["ccc", "rg"]) {
    const path = join(bin, name);
    writeFileSync(
      path,
      `#!/bin/sh
printf '%s\\n' '${name} '"$*" >> "$FAKE_SEARCH_LOG"
if [ "${name}" = ccc ] && [ "\${FAKE_CCC_SLEEP:-0}" = 1 ]; then exec sleep 2; fi
if [ "${name}" = ccc ] && [ "\${FAKE_SEARCH_NOISE:-0}" = 1 ]; then printf '%s\\n' 'Indexing: 10 files listed | error: 0'; fi
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

  test("concept routes to ccc search with freshness", () => {
    const result = run(registerProject(), [
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
    expect(result.log).toContain("--refresh");
    expect(result.stdout).toContain("RESULT: PASS route=concept engine=ccc");
  });

  test("an exit-zero empty ccc result is not reported as PASS", () => {
    const result = run(
      registerProject(),
      ["concept", "--query", "known positive control"],
      { FAKE_SEARCH_EMPTY: "1", FAKE_SEARCH_NOISE: "1" },
    );

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

  test("battery runs every query and refreshes only the first", () => {
    const result = run(registerProject(), [
      "battery",
      "--query",
      "first mechanism",
      "--query",
      "second vocabulary",
      "--query",
      "third Japanese query",
    ]);
    const calls = result.log.trim().split("\n");

    expect(result.code).toBe(0);
    expect(calls).toHaveLength(3);
    expect(calls[0]).toContain("--refresh");
    expect(calls[1]).not.toContain("--refresh");
    expect(calls[2]).not.toContain("--refresh");
    expect(result.stdout).toContain("queries=3");
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
  });

  test("an exit-zero empty structural result is not reported as PASS", () => {
    const result = run(
      tempDir("repo-search-unregistered-"),
      ["structural", "--query", "foo(\\(ARGS*\\))"],
      { FAKE_SEARCH_EMPTY: "1" },
    );

    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("RESULT: PASS");
    expect(result.stderr).toContain("RESULT: NO_MATCH");
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
    const result = run(
      registerProject(),
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

  test("root help declares the complete route surface", () => {
    const result = run(registerProject(), ["--help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("concept");
    expect(result.stdout).toContain("battery");
    expect(result.stdout).toContain("structural");
    expect(result.log).toBe("");
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
    const result = run(registerProject(), [
      "literal",
      "--query",
      "needle",
      "--limit",
      "3",
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Error: Unknown flag: --limit.");
    expect(result.log).toBe("");
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
