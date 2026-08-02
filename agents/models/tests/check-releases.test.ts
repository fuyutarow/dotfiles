import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "check-releases.ts");

function run(args: string[] = []): { code: number; out: string } {
  const p = Bun.spawnSync(["bun", SCRIPT, ...args], {
    cwd: join(import.meta.dir, "..", "..", ".."),
  });
  return {
    code: p.exitCode,
    out: p.stdout.toString() + p.stderr.toString(),
  };
}

describe("check-releases floor", () => {
  test("passes on the real SSOT at its sweep date", () => {
    const r = run(["--today", "2026-07-25"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("0 FAIL");
  });

  test("counts every vendor and model in the SSOT", () => {
    const r = run(["--today", "2026-07-25"]);
    expect(r.out).toMatch(/checked \d+ models across 4 vendors/);
  });

  // F1 — a stale sweep is the same defect as a stale catalog, in one file.
  test("FAILs once the sweep ages past max_age_days", () => {
    const r = run(["--today", "2026-10-01"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("days old");
  });

  test("warns in the week before the sweep is due", () => {
    // max_age_days = 45 from 2026-07-25 -> due 2026-09-08; 41 days in = warning band.
    // Exit is 1 at this date for an UNRELATED and correct reason: claude-opus-4-1's
    // retirement (2026-08-05) has passed while its row still says "deprecated", so the
    // SSOT enforces its own upkeep. Assert the warning text, not the code.
    const r = run(["--today", "2026-09-04"]);
    expect(r.out).toContain("sweep due in");
  });

  test("a passed retirement date with a stale status FAILs", () => {
    const r = run(["--today", "2026-09-04"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("passed its retirement date");
  });

  // F2 — a retirement nobody references is a note, not a red floor.
  test("a near retirement with no references only WARNs", () => {
    const r = run(["--today", "2026-07-25"]);
    expect(r.out).toContain("claude-opus-4-1 retires in 11 days");
    expect(r.out).toContain("nothing in agents/skills references it");
    expect(r.code).toBe(0);
  });

  // F3 — discouraged slugs surfaced wherever guidance prose names them.
  test("flags a retired slug named in a driving-* catalog", () => {
    const r = run(["--today", "2026-07-25"]);
    expect(r.out).toContain("grok-code-fast-1");
    expect(r.out).toContain("retired");
  });

  test("does not flag slugs inside history files (ledgers keep provenance)", () => {
    const r = run(["--today", "2026-07-25"]);
    expect(r.out).not.toContain("forge-verification-ledger");
  });

  test("rejects a malformed --today rather than guessing", () => {
    const r = run(["--today", "not-a-date"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("not YYYY-MM-DD");
  });

  test("--quiet suppresses WARN lines but keeps the exit code", () => {
    const r = run(["--today", "2026-07-25", "--quiet"]);
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("WARN");
  });

  test("rejects an unknown flag", () => {
    const r = run(["--wat"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("Error: Unknown flag: --wat.");
  });

  test("rejects --__proto__ before checking the release corpus", () => {
    const r = run(["--__proto__"]);
    expect(r.code).toBe(2);
    expect(r.out).toContain("unknown option '--__proto__'");
    expect(r.out).not.toContain("checked ");
  });

  test("rejects a stray positional", () => {
    const r = run(["stray"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("unexpected positional argument 'stray'");
  });

  test("rejects --today with no value", () => {
    const r = run(["--today"]);
    expect(r.code).toBe(2);
    expect(r.out).toContain("--today requires a value");
  });
});
