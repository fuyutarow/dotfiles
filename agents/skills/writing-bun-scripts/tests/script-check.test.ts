// bun test for the writing-bun-scripts floor (BG4 self-application: the skill that demands
// tested floors ships a tested floor). Each case is a red/green regression of a detector,
// including the evasions found by the 2026-07-23 verification fleet.
// NOTE: this file embeds known-bad fixture SOURCE STRINGS — running the floor over this
// test file flags them by design; the floor's targets are scripts, not tests.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FLOOR = new URL("../scripts/script-check.ts", import.meta.url).pathname;

function runFloor(content: string): { out: string; code: number } {
  const dir = mkdtempSync(join(tmpdir(), "floor-"));
  const file = join(dir, "fixture.ts");
  writeFileSync(file, content);
  // bounded: one-shot floor run over a tiny fixture; maxBuffer caps runaway output
  const proc = Bun.spawnSync(["bun", FLOOR, file], { maxBuffer: 1024 * 1024 });
  rmSync(dir, { recursive: true, force: true });
  return {
    out: proc.stdout.toString() + proc.stderr.toString(),
    code: proc.exitCode ?? -1,
  };
}

describe("script-check floor", () => {
  test("classic bad fixture: every FAIL detector fires, exit 1", () => {
    const { out, code } = runFloor(
      [
        "#!/usr/bin/env node",
        'import yaml from "js-yaml";',
        'import { z } from "zod@3.0.0";',
        'const cp = require("node:child_process");',
        'cp.execSync("date");',
      ].join("\n"),
    );
    expect(out).toContain("shebang names node");
    expect(out).toContain("unpinned external dependency 'js-yaml'");
    expect(out).toContain("pinned inline dependency 'zod@3.0.0'");
    expect(out).toContain("CommonJS require");
    expect(out).toContain("exec/execSync");
    expect(code).toBe(1);
  });

  test("backtick dynamic import no longer evades F3 (fleet finding)", () => {
    const { out, code } = runFloor("const m = await import(`left-pad`);\n");
    expect(out).toContain("unpinned external dependency 'left-pad'");
    expect(code).toBe(1);
  });

  test("computed dynamic import warns for hand review", () => {
    const { out, code } = runFloor(
      "const name = pick();\nconst m = await import(`pkg-${name}`);\n",
    );
    expect(out).toContain("computed specifier");
    expect(code).toBe(0);
  });

  test("a bounded call does not silence a hangable one (fleet finding)", () => {
    const { out } = runFloor(
      [
        'const b = Bun.spawn(["some-llm", "--wait"]);',
        "const pad = `x`;",
        'const a = Bun.spawn(["true"], { timeout: 50 });',
      ].join("\n"),
    );
    expect(out).toContain("1 spawn call(s) without timeout:/signal:");
  });

  test("an unrelated boundedRegion comment does not silence W5 (fleet finding)", () => {
    const { out } = runFloor(
      ["// boundedRegion = { x: 1 }", "", 'const b = Bun.spawn(["cli"]);'].join("\n"),
    );
    expect(out).toContain("spawn call(s) without timeout:/signal:");
  });

  test("a real `// bounded: <reason>` beside the call silences W5", () => {
    const { out, code } = runFloor(
      ["// bounded: version probe, exits fast", 'const b = Bun.spawn(["cli", "--version"]);'].join(
        "\n",
      ),
    );
    expect(out).toContain("FAIL=0 WARN=0");
    expect(code).toBe(0);
  });

  test("block-comment interiors are not scanned as code (fleet finding)", () => {
    const { out, code } = runFloor(
      [
        "/*",
        'const cp = require("node:child_process");',
        'import bad from "some-bare-package";',
        "*/",
        "export const ok = 1;",
      ].join("\n"),
    );
    expect(out).toContain("FAIL=0");
    expect(code).toBe(0);
  });

  test("bun shebang on an ordinary script warns (BG1 fixture-only rule)", () => {
    const { out, code } = runFloor("#!/usr/bin/env bun\nexport const ok = 1;\n");
    expect(out).toContain("binary-substituted fixture");
    expect(code).toBe(0);
  });

  test("the floor passes over its own source", () => {
    // bounded: one-shot self-run
    const proc = Bun.spawnSync(["bun", FLOOR, FLOOR], { maxBuffer: 1024 * 1024 });
    expect(proc.stdout.toString()).toContain("FAIL=0 WARN=0");
    expect(proc.exitCode).toBe(0);
  });
});
