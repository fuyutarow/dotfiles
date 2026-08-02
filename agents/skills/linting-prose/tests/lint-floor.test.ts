// bun test characterizing CURRENT behavior of lint-floor.ts (small-trio family:
// skill-check.ts / mise-contract.ts / lint-floor.ts). This file pins the exact
// refusal text, exit codes, and passthrough semantics as the bracket for the
// upcoming refactor.
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FLOOR = new URL("../scripts/lint-floor.ts", import.meta.url).pathname;
const REFUSAL =
  "REFUSED: --fix is banned on the prose floor (detect-only; prh replacements are guidance, not text).\n" +
  "See references/machine-floor.md — the anti-auto-substitution rule.\n";

function run(
  args: string[],
  env?: Record<string, string>,
): { out: string; err: string; code: number } {
  // bounded: one-shot textlint invocation over a tiny fixture, no watch mode
  const proc = Bun.spawnSync(["bun", FLOOR, ...args], {
    env: env === undefined ? undefined : { ...process.env, ...env },
    maxBuffer: 4 * 1024 * 1024,
  });
  return {
    out: proc.stdout.toString(),
    err: proc.stderr.toString(),
    code: proc.exitCode ?? -1,
  };
}

describe("lint-floor --fix refusal", () => {
  test("--fix is refused: exact stderr text, empty stdout, exit 2", () => {
    const { out, err, code } = run(["--fix"]);
    expect(out).toBe("");
    expect(err).toBe(REFUSAL);
    expect(code).toBe(2);
  });

  test("--fix-dry-run is refused identically to --fix", () => {
    const { out, err, code } = run(["--fix-dry-run"]);
    expect(out).toBe("");
    expect(err).toBe(REFUSAL);
    expect(code).toBe(2);
  });

  test("the ban fires wherever --fix appears in argv, not only as argv[0]", () => {
    const { out, err, code } = run(["some-file.md", "--fix", "--rule", "foo"]);
    expect(out).toBe("");
    expect(err).toBe(REFUSAL);
    expect(code).toBe(2);
  });

  test("refusal short-circuits before textlint spawns: fires even with a bogus config path", () => {
    const { err, code } = run(["--fix"], {
      LINT_PROSE_CONFIG: "/nonexistent/path/textlintrc.json",
    });
    expect(err).toBe(REFUSAL);
    expect(code).toBe(2);
  });
});

describe("lint-floor passthrough (no --fix)", () => {
  test("magic-looking unknown flags are forwarded byte-for-byte, not lost in unknownFlags", () => {
    const dir = mkdtempSync(join(tmpdir(), "lint-floor-bunx-"));
    const fakeBunx = join(dir, "bunx");
    writeFileSync(
      fakeBunx,
      "#!/usr/bin/env bun\nprocess.stdout.write(JSON.stringify(Bun.argv.slice(2)));\n",
    );
    chmodSync(fakeBunx, 0o755);
    try {
      const { out, err, code } = run(["--__proto__", "target.md"], {
        PATH: `${dir}:${process.env.PATH ?? ""}`,
      });
      const relayed = JSON.parse(out) as string[];
      expect(relayed.slice(-2)).toEqual(["--__proto__", "target.md"]);
      expect(err).toBe("");
      expect(code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("preserves a downstream -- separator and token order", () => {
    const dir = mkdtempSync(join(tmpdir(), "lint-floor-bunx-"));
    const fakeBunx = join(dir, "bunx");
    writeFileSync(
      fakeBunx,
      "#!/usr/bin/env bun\nprocess.stdout.write(JSON.stringify(Bun.argv.slice(2)));\n",
    );
    chmodSync(fakeBunx, 0o755);
    try {
      const { out, err, code } = run(
        ["--version", "--", "--downstream-only", "target.md"],
        { PATH: `${dir}:${process.env.PATH ?? ""}` },
      );
      const relayed = JSON.parse(out) as string[];
      expect(relayed.slice(-4)).toEqual([
        "--version",
        "--",
        "--downstream-only",
        "target.md",
      ]);
      expect(err).toBe("");
      expect(code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("exit code passes through cleanly: --version", () => {
    const { code } = run(["--version"]);
    expect(code).toBe(0);
  });

  test("LINT_PROSE_CONFIG env override is honored by the spawned textlint", () => {
    // A config path that resolves to nothing makes textlint report "no rules
    // found" against a real target file instead of running the house rules —
    // proof the override reached the child process, not the default asset.
    const dir = mkdtempSync(join(tmpdir(), "lint-floor-"));
    const target = join(dir, "probe.md");
    writeFileSync(target, "This is a test sentence for lint floor probing.\n");
    const { out, code } = run([target], {
      LINT_PROSE_CONFIG: "/nonexistent/path/textlintrc.json",
    });
    expect(out).toContain("No rules found");
    expect(code).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  test("default config resolves relative to the script, not the caller's cwd", () => {
    const dir = mkdtempSync(join(tmpdir(), "lint-floor-cwd-"));
    const target = join(dir, "probe.md");
    writeFileSync(target, "This is a test sentence for lint floor probing.\n");
    const proc = Bun.spawnSync(["bun", FLOOR, target], {
      cwd: dir,
      maxBuffer: 4 * 1024 * 1024,
    });
    // With the real default config resolved, textlint runs the house rules
    // (not "no rules found") regardless of which directory invoked it from.
    expect(proc.stdout.toString() + proc.stderr.toString()).not.toContain(
      "No rules found",
    );
    rmSync(dir, { recursive: true, force: true });
  });
});
