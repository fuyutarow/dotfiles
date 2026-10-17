import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// Each regression runs the real scanner repeatedly; its subprocess guard is 60s.
// Set this file's integration budget explicitly (preload defaults do not cover every file).
setDefaultTimeout(30_000);

const REPO = join(import.meta.dir, "..", "..");
const SCRIPT = join(REPO, "scripts", "lint-no-sync.ts");
const NO_DISABLE = join(REPO, "scripts", "lint-ts-no-disable.ts");
const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** A fixture repo outside the workspace, using the root scanner settings and test exclusions. */
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "lint-no-sync-"));
  cleanups.push(() => {
    rmSync(root, { recursive: true, force: true });
  });
  write(
    root,
    ".oxlintrc.json",
    readFileSync(join(REPO, ".oxlintrc.json"), "utf8"),
  );
  write(root, "keep.ts", "export const keep = 1;\n");
  for (const [path, text] of Object.entries(files)) write(root, path, text);
  return root;
}

function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function run(args: string[], cwd: string, script = SCRIPT) {
  const result = Bun.spawnSync(["bun", script, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  });
  return {
    code: result.exitCode ?? 1,
    out: result.stdout.toString() + result.stderr.toString(),
  };
}

const read = (name: string, call = 'readFileSync("x", "utf8")'): string =>
  `import { readFileSync } from "node:fs";\nexport function ${name}(): string {\n  return ${call};\n}\n`;
const exempted = (name: string, reason: string): string =>
  `import { readFileSync } from "node:fs";\nexport function ${name}(): string {\n  // sync-ok: ${reason}\n  return readFileSync("x", "utf8");\n}\n`;

describe("lint-no-sync.ts", () => {
  test("reads root-level options from standard config instead of a scanner default", () => {
    const root = fixture({});
    const source = read("load");
    write(
      root,
      "root.ts",
      source
        .replace(
          "export function load(): string {\n  return ",
          "export const loaded = ",
        )
        .replace(";\n}\n", ";\n"),
    );
    expect(run(["--init"], root).code).toBe(0);
    write(
      root,
      ".oxlintrc.json",
      readFileSync(join(root, ".oxlintrc.json"), "utf8").replace(
        '"allowAtRootLevel": true',
        '"allowAtRootLevel": false',
      ),
    );
    const failed = run([], root);
    expect(failed.code).toBe(1);
    expect(failed.out).toContain("root.ts: 1 sync call(s)");
  });

  test("missing configured rule fails closed", () => {
    const root = fixture({});
    write(root, ".oxlintrc.json", '{"ignorePatterns":[]}\n');
    const failed = run(["--init"], root);
    expect(failed.code).toBe(2);
    expect(failed.out).toContain(".oxlintrc.json");
  });

  test("a new sync call in a clean non-test file fails; the same call with a reason passes", () => {
    const root = fixture({ "lib/clean.ts": "export const n = 1;\n" });
    expect(run(["--init"], root).code).toBe(0);
    expect(run([], root).code).toBe(0);

    write(root, "lib/new.ts", read("load"));
    const failed = run([], root);
    expect(failed.code).toBe(1);
    expect(failed.out).toContain("lib/new.ts");

    write(
      root,
      "lib/new.ts",
      exempted("load", "fsync must finish before exit"),
    );
    expect(run([], root).code).toBe(0);
  });

  test("an exempted function keeps passing when it moves to another file", () => {
    const root = fixture({
      "lib/a.ts": exempted("load", "durable write needs the sync call"),
    });
    expect(run(["--init"], root).code).toBe(0);
    write(root, "lib/a.ts", "export const n = 1;\n");
    write(
      root,
      "lib/moved/b.ts",
      exempted("load", "durable write needs the sync call"),
    );
    expect(run([], root).code).toBe(0);
  });

  test("an exemption without a reason is not recognised", () => {
    const root = fixture({});
    expect(run(["--init"], root).code).toBe(0);
    write(
      root,
      "lib/bare.ts",
      'import { readFileSync } from "node:fs";\n// sync-ok:\nexport const t = (): string => readFileSync("x", "utf8");\n',
    );
    expect(run([], root).code).toBe(1);
  });

  test("test files are not checked", () => {
    const root = fixture({});
    expect(run(["--init"], root).code).toBe(0);
    write(root, "lib/a.test.ts", read("load"));
    write(root, "lib/tests/helper.ts", read("load"));
    expect(run([], root).code).toBe(0);
  });

  test("a blanket lint-suppression comment still fails the no-disable check", () => {
    const root = fixture({
      "lib/d.ts": ["// oxlint-", "disable node/no-sync\n", read("load")].join(
        "",
      ),
    });
    expect(Bun.spawnSync(["git", "init", "-q"], { cwd: root }).exitCode).toBe(
      0,
    );
    expect(Bun.spawnSync(["git", "add", "-A"], { cwd: root }).exitCode).toBe(0);
    expect(run([], root, NO_DISABLE).code).toBe(1);
  });

  test("converting a site and regenerating lowers the baseline; growth is refused", () => {
    const root = fixture({});
    write(
      root,
      "lib/a.ts",
      'import { readFileSync } from "node:fs";\nexport const one = (): string => readFileSync("x", "utf8");\nexport const two = (): string => readFileSync("y", "utf8");\n',
    );
    expect(run(["--init"], root).code).toBe(0);
    const baseline = (): string =>
      readFileSync(join(root, "lint", "no-sync-baseline.tsv"), "utf8");
    expect(baseline()).toContain("2\tlib/a.ts");

    write(
      root,
      "lib/a.ts",
      'import { readFileSync } from "node:fs";\nexport const one = (): string => readFileSync("x", "utf8");\nexport const two = (): number => 2;\n',
    );
    expect(run([], root).code).toBe(0);
    const stale = run(["--strict"], root);
    expect(stale.code).toBe(1);
    expect(stale.out).toContain("stale");
    expect(run(["--write"], root).code).toBe(0);
    expect(run(["--strict"], root).code).toBe(0);
    expect(baseline()).toContain("1\tlib/a.ts");

    write(
      root,
      "lib/a.ts",
      'import { readFileSync } from "node:fs";\nexport const one = (): string => readFileSync("x", "utf8");\nexport const two = (): string => readFileSync("y", "utf8");\n',
    );
    expect(run([], root).code).toBe(1);
    expect(run(["--write"], root).code).toBe(1);
    expect(run([], root).code).toBe(1);
    expect(baseline()).toContain("1\tlib/a.ts");
  });
});
