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

function runFloor(
  content: string,
  filename = "fixture.ts",
): { out: string; code: number } {
  const dir = mkdtempSync(join(tmpdir(), "floor-"));
  const file = join(dir, filename);
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
      ["// boundedRegion = { x: 1 }", "", 'const b = Bun.spawn(["cli"]);'].join(
        "\n",
      ),
    );
    expect(out).toContain("spawn call(s) without timeout:/signal:");
  });

  test("shorthand AbortSignal property (`signal,`) counts as W5 evidence", () => {
    const { out, code } = runFloor(
      [
        "const signal = AbortSignal.timeout(1000);",
        'const b = Bun.spawn(["cli"], { stdin: "ignore", signal, killSignal: "SIGTERM" });',
      ].join("\n"),
    );
    expect(out).toContain("FAIL=0 WARN=0");
    expect(code).toBe(0);
  });

  test("a real `// bounded: <reason>` beside the call silences W5", () => {
    const { out, code } = runFloor(
      [
        "// bounded: version probe, exits fast",
        'const b = Bun.spawn(["cli", "--version"]);',
      ].join("\n"),
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
    const { out, code } = runFloor(
      "#!/usr/bin/env bun\nexport const ok = 1;\n",
    );
    expect(out).toContain("binary-substituted fixture");
    expect(code).toBe(0);
  });

  test("the floor passes over its own source", () => {
    // bounded: one-shot self-run
    const proc = Bun.spawnSync(["bun", FLOOR, FLOOR], {
      maxBuffer: 1024 * 1024,
    });
    expect(proc.stdout.toString()).toContain("FAIL=0 WARN=0");
    expect(proc.exitCode).toBe(0);
  });
});

describe("script-check floor — typed argv boundary (F8, BG1)", () => {
  test("node:util parseArgs FAILs even when strict", () => {
    const { out, code } = runFloor(`
      import { parseArgs } from "node:util";
      parseArgs({ args: Bun.argv.slice(2), strict: true });
    `);
    expect(out).toContain("node:util parseArgs is forbidden");
    expect(code).toBe(1);
  });

  test("raw Bun.argv parsing without an approved typed parser FAILs", () => {
    const { out, code } = runFloor(`
      const files = Bun.argv.slice(2);
      process.stdout.write(files.join("\\n"));
    `);
    expect(out).toContain("without the typeFlag() boundary");
    expect(code).toBe(1);
  });

  test("raw process.argv parsing without an approved typed parser FAILs", () => {
    const { out, code } = runFloor(`
      const files = process.argv.slice(2);
      process.stdout.write(files.join("\\n"));
    `);
    expect(out).toContain("without the typeFlag() boundary");
    expect(code).toBe(1);
  });

  test("typeFlag with an early unknown interceptor and parsed positionals PASSes", () => {
    const { out, code } = runFloor(`
      function rejectUnknownFlag(
        type: "known-flag" | "unknown-flag" | "argument",
        flag: string,
      ): void {
        if (type === "unknown-flag") throw new Error("unknown option");
      }
      const parsed = typeFlag({}, Bun.argv.slice(2), { ignore: rejectUnknownFlag });
      if (Object.keys(parsed.unknownFlags).length > 0) throw new Error("unknown");
      process.stdout.write(parsed._.join("\\n"));
    `);
    expect(out).toContain("FAIL=0");
    expect(code).toBe(0);
  });

  test("typeFlag without the early unknown interceptor FAILs", () => {
    const { out, code } = runFloor(`
      const parsed = typeFlag({}, Bun.argv.slice(2));
      if (Object.keys(parsed.unknownFlags).length > 0) throw new Error("unknown");
      process.stdout.write(parsed._.join("\\n"));
    `);
    expect(out).toContain(
      "without an early `ignore: rejectUnknownFlag` interceptor",
    );
    expect(code).toBe(1);
  });

  test("an imported Cleye boundary FAILs: house argv parsing is exceptionless type-flag", () => {
    const { out, code } = runFloor(`
      import { cli } from "cleye";
      const parsed = cli({}, undefined, Bun.argv.slice(2));
      process.stdout.write(parsed._.join("\\n"));
    `);
    expect(out).toContain("Cleye is outside the house argv boundary");
    expect(code).toBe(1);
  });

  test("a second raw argv read is not licensed by one typeFlag call", () => {
    const { out, code } = runFloor(`
      function rejectUnknownFlag(
        type: "known-flag" | "unknown-flag" | "argument",
        flag: string,
      ): void {
        if (type === "unknown-flag") throw new Error(flag);
      }
      const parsed = typeFlag({}, Bun.argv.slice(2), { ignore: rejectUnknownFlag });
      if (Object.keys(parsed.unknownFlags).length > 0) throw new Error("unknown");
      const bypass = process.argv.slice(2);
      process.stdout.write(parsed._.concat(bypass).join("\\n"));
    `);
    expect(out).toContain("more argv reads than typeFlag() calls");
    expect(code).toBe(1);
  });

  test("raw String flag parsers FAIL because a present value may be empty", () => {
    const { out, code } = runFloor(`
      function rejectUnknownFlag(
        type: "known-flag" | "unknown-flag" | "argument",
        flag: string,
      ): void {
        if (type === "unknown-flag") throw new Error(flag);
      }
      const parsed = typeFlag({ name: String }, Bun.argv.slice(2), {
        ignore: rejectUnknownFlag,
      });
      if (Object.keys(parsed.unknownFlags).length > 0) throw new Error("unknown");
      process.stdout.write(parsed.flags.name ?? "");
    `);
    expect(out).toContain("raw String flag parser");
    expect(code).toBe(1);
  });

  test("a throwing non-empty string parser PASSes", () => {
    const { out, code } = runFloor(`
      function rejectUnknownFlag(
        type: "known-flag" | "unknown-flag" | "argument",
        flag: string,
      ): void {
        if (type === "unknown-flag") throw new Error(flag);
      }
      function nonEmptyString(value: string | undefined): string {
        if (value === undefined || value.length === 0) throw new Error("missing");
        return value;
      }
      const parsed = typeFlag({ name: nonEmptyString }, Bun.argv.slice(2), {
        ignore: rejectUnknownFlag,
      });
      if (Object.keys(parsed.unknownFlags).length > 0) throw new Error("unknown");
      process.stdout.write(parsed.flags.name ?? "");
    `);
    expect(out).toContain("FAIL=0");
    expect(code).toBe(0);
  });

  test("an explicit forwarding wrapper may preserve downstream unknown flags", () => {
    const { out, code } = runFloor(`
      // argv-forwarding: downstream-tool
      const args = Bun.argv.slice(2);
      const parsed = typeFlag({}, [...args], {
        ignore: (type) => type === "unknown-flag",
      });
      if (Object.keys(parsed.unknownFlags).length > 0) throw new Error("invariant");
      process.stdout.write(parsed._.join("\\n"));
    `);
    expect(out).toContain("FAIL=0");
    expect(code).toBe(0);
  });

  test("argv and parseArgs examples inside comments and strings do not fire", () => {
    const { out, code } = runFloor(`
      // Bun.argv.slice(2); parseArgs({ strict: true });
      const example = "process.argv.slice(2); parseArgs({ strict: true })";
      process.stdout.write(example);
    `);
    expect(out).toContain("FAIL=0");
    expect(code).toBe(0);
  });
});

// BG0 F7 — the `# shim: <class>` marker required on any surviving `.sh` (2026-07-30).
describe("script-check floor — .sh shim marker (F7, BG0)", () => {
  test(".sh with no shim marker FAILs, exit 1 (red case)", () => {
    const { out, code } = runFloor("#!/bin/sh\necho hi\n", "fixture.sh");
    expect(out).toContain(
      "no `# shim: <bootstrap|hook-entry|exec-wrapper|vendored>` marker",
    );
    expect(code).toBe(1);
  });

  test(".sh with a declared shim class PASSes (green case)", () => {
    const { out, code } = runFloor(
      "#!/bin/sh\n# shim: hook-entry\necho hi\n",
      "fixture.sh",
    );
    expect(out).toContain("FAIL=0 WARN=0");
    expect(code).toBe(0);
  });

  test(".sh with an undeclared shim class FAILs, naming the bad value", () => {
    const { out, code } = runFloor(
      "#!/bin/sh\n# shim: made-up-class\necho hi\n",
      "fixture.sh",
    );
    expect(out).toContain("'# shim: made-up-class' is not a declared class");
    expect(code).toBe(1);
  });

  test(".sh with no marker but a vendor header is exempt — WARN, not FAIL", () => {
    const { out, code } = runFloor(
      "#!/bin/sh\n# managed by some-tool; reinstalling overwrites this file.\necho hi\n",
      "fixture.sh",
    );
    expect(out).toContain("vendored exemption");
    expect(out).toContain("FAIL=0 WARN=1");
    expect(code).toBe(0);
  });

  test("the vendored exemption is read from content, not a path — a random filename still exempts", () => {
    const { out, code } = runFloor(
      "#!/bin/sh\n# auto-generated by some-tool; do not edit.\necho hi\n",
      "unrelated-name.sh",
    );
    expect(out).toContain("vendored exemption");
    expect(code).toBe(0);
  });

  test(".sh skips every TS-only check — no false-positive F2/F4 on shell syntax", () => {
    const { out, code } = runFloor(
      "#!/bin/sh\n# shim: exec-wrapper\nrequire('x')\nexec date\n",
      "fixture.sh",
    );
    expect(out).toContain("FAIL=0 WARN=0");
    expect(code).toBe(0);
  });
});
