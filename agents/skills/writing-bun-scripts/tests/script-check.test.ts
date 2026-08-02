// bun test for the writing-bun-scripts floor (BG4 self-application: the skill that demands
// tested floors ships a tested floor). Each case is a red/green regression of a detector,
// including the evasions found by the 2026-07-23 verification fleet.
// NOTE: this file embeds known-bad fixture SOURCE STRINGS — running the floor over this
// test file flags them by design; the floor's targets are scripts, not tests.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cli } from "cleye";
import { typeFlag } from "type-flag";

const FLOOR = new URL("../scripts/script-check.ts", import.meta.url).pathname;

function runFloor(
  content: string,
  filename = "fixture.ts",
  dependencies?: Record<string, string>,
): { out: string; code: number } {
  const dir = mkdtempSync(join(tmpdir(), "floor-"));
  const file = join(dir, filename);
  writeFileSync(file, content);
  if (dependencies !== undefined) {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies }));
    writeFileSync(join(dir, "bun.lock"), "{}\n");
  }
  // bounded: one-shot floor run over a tiny fixture; maxBuffer caps runaway output
  const proc = Bun.spawnSync(["bun", FLOOR, file], { maxBuffer: 1024 * 1024 });
  rmSync(dir, { recursive: true, force: true });
  return {
    out: proc.stdout.toString() + proc.stderr.toString(),
    code: proc.exitCode ?? -1,
  };
}

function templateExpression(expression: string): string {
  return `\`\${${expression}}\``;
}

function interpolatedFixture(expression: string): string {
  return `const hidden = ${templateExpression(expression)};`;
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
      `const name = pick();\nconst m = await import(\`pkg-\${name}\`);\n`,
    );
    expect(out).toContain("computed specifier");
    expect(code).toBe(0);
  });

  test("a regex literal that names bunx is not mistaken for a subprocess call", () => {
    const { out, code } = runFloor(
      String.raw`const runtime = /(^|\\s)bunx?\\b/; process.stdout.write(String(runtime));`,
    );
    expect(out).not.toContain("bunx call with no visible");
    expect(out).toContain("FAIL=0 WARN=0");
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

  test("the floor exposes Cleye help and a deliberate spread positional schema", () => {
    // bounded: the local CLI's framework-owned help path exits immediately
    const proc = Bun.spawnSync(["bun", FLOOR, "--help"], {
      maxBuffer: 1024 * 1024,
    });
    const output = proc.stdout.toString();
    expect(output).toContain("script-check [flags...] <file...>");
    expect(output).toContain("Show help");
    expect(proc.exitCode).toBe(0);
  });

  test("the floor rejects ordinary unknown flags and __proto__ before mutation", () => {
    // bounded: both one-shot argument-error paths return before the floor walks a file
    const unknown = Bun.spawnSync(["bun", FLOOR, "--unknown", FLOOR], {
      maxBuffer: 1024 * 1024,
    });
    expect(unknown.stderr.toString()).toContain("Unknown flag: --unknown");
    expect(unknown.exitCode).toBe(1);

    const prototype = Bun.spawnSync(["bun", FLOOR, "--__proto__", FLOOR], {
      maxBuffer: 1024 * 1024,
    });
    expect(prototype.stderr.toString()).toContain("prototype-mutating option");
    expect(prototype.exitCode).toBe(2);
  });
});

describe("script-check floor — Cleye argv boundary (F5/F8, BG1)", () => {
  test("node:util parseArgs FAILs even when strict", () => {
    const { out, code } = runFloor(`
      import { parseArgs } from "node:util";
      parseArgs({ args: Bun.argv.slice(2), strict: true });
    `);
    expect(out).toContain("node:util parseArgs is forbidden");
    expect(code).toBe(1);
  });

  test("raw Bun.argv parsing without Cleye FAILs", () => {
    const { out, code } = runFloor(`
      const files = Bun.argv.slice(2);
      process.stdout.write(files.join("\\n"));
    `);
    expect(out).toContain("without a Cleye boundary");
    expect(code).toBe(1);
  });

  test("raw process.argv parsing without Cleye FAILs", () => {
    const { out, code } = runFloor(`
      const files = process.argv.slice(2);
      process.stdout.write(files.join("\\n"));
    `);
    expect(out).toContain("without a Cleye boundary");
    expect(code).toBe(1);
  });

  test("an unrelated local cli helper with no argv PASSes", () => {
    const { out, code } = runFloor(`
      function cli(message: string): void {
        process.stdout.write(message);
      }
      cli("domain operation");
    `);
    expect(out).toContain("FAIL=0");
    expect(code).toBe(0);
  });

  test("an unrelated imported cli helper with no argv PASSes", () => {
    const { out, code } = runFloor(`
      import { cli } from "./domain.ts";
      cli("domain operation");
    `);
    expect(out).toContain("FAIL=0");
    expect(code).toBe(0);
  });

  test("an unrelated cli helper does not license raw Bun.argv", () => {
    const { out, code } = runFloor(`
      import { cli } from "./domain.ts";
      cli(Bun.argv.slice(2));
    `);
    expect(out).toContain("without a Cleye boundary");
    expect(code).toBe(1);
  });

  test("an aliased Cleye cli import FAILs the exact-binding policy", () => {
    const { out, code } = runFloor(
      `
      import { cli as cleyeCli } from "cleye";
      cleyeCli({ name: "fixture", parameters: ["<file...>"], strictFlags: true });
    `,
      "fixture.ts",
      { cleye: "2.6.0" },
    );
    expect(out).toContain("import Cleye cli with its exact `cli` binding");
    expect(code).toBe(1);
  });

  test("ordinary Cleye cli with strict/prototype guard and deliberate spread PASSes", () => {
    const { out, code } = runFloor(
      `
      import { cli } from "cleye";
      function rejectPrototypeFlag(
        type: "known-flag" | "unknown-flag" | "argument",
        flag: string,
      ): void {
        if (type === "unknown-flag" && flag === "__proto__") throw new Error("prototype");
      }
      const parsed = cli({
        name: "fixture",
        parameters: ["<file...>"],
        strictFlags: true,
        ignoreArgv: rejectPrototypeFlag,
      }, undefined, Bun.argv.slice(2));
      process.stdout.write(parsed._.file.join("\\n"));
    `,
      "fixture.ts",
      { cleye: "2.6.0" },
    );
    expect(out).toContain("FAIL=0");
    expect(code).toBe(0);
  });

  test("Cleye boundary without strictFlags FAILs", () => {
    const { out, code } = runFloor(
      `
      import { cli } from "cleye";
      function rejectPrototypeFlag() {}
      cli({ name: "fixture", parameters: ["<file...>"], ignoreArgv: rejectPrototypeFlag }, undefined, Bun.argv.slice(2));
    `,
      "fixture.ts",
      { cleye: "2.6.0" },
    );
    expect(out).toContain("strictFlags: true");
    expect(code).toBe(1);
  });

  test("Cleye boundary without the prototype guard FAILs", () => {
    const { out, code } = runFloor(
      `
      import { cli } from "cleye";
      cli({ name: "fixture", parameters: ["<file...>"], strictFlags: true }, undefined, Bun.argv.slice(2));
    `,
      "fixture.ts",
      { cleye: "2.6.0" },
    );
    expect(out).toContain("ignoreArgv: rejectPrototypeFlag");
    expect(code).toBe(1);
  });

  test("Cleye requires an explicit parameters schema", () => {
    const { out, code } = runFloor(
      `
      import { cli } from "cleye";
      function rejectPrototypeFlag() {}
      cli({ name: "fixture", strictFlags: true, ignoreArgv: rejectPrototypeFlag }, undefined, Bun.argv.slice(2));
    `,
      "fixture.ts",
      { cleye: "2.6.0" },
    );
    expect(out).toContain("parameters: declaration");
    expect(code).toBe(1);
  });

  test("flag-only Cleye CLI makes excess-positional refusal visible", () => {
    const { out, code } = runFloor(
      `
      import { cli } from "cleye";
      function rejectPrototypeFlag() {}
      const parsed = cli({ name: "fixture", parameters: [], strictFlags: true, ignoreArgv: rejectPrototypeFlag }, undefined, Bun.argv.slice(2));
      if (parsed._.length > 0) throw new Error("unexpected positional");
    `,
      "fixture.ts",
      { cleye: "2.6.0" },
    );
    expect(out).toContain("FAIL=0");
    expect(code).toBe(0);
  });

  test("the established rejectUnexpectedArguments excess refusal PASSes", () => {
    const { out, code } = runFloor(
      `
      import { cli } from "cleye";
      function rejectPrototypeFlag() {}
      function rejectUnexpectedArguments(unknownFlags: object, positionals: readonly string[]) {
        if (Object.keys(unknownFlags).length > 0 || positionals.length > 0) throw new Error("unexpected");
      }
      const parsed = cli({ name: "fixture", parameters: [], strictFlags: true, ignoreArgv: rejectPrototypeFlag }, undefined, Bun.argv.slice(2));
      rejectUnexpectedArguments(parsed.unknownFlags, parsed._);
    `,
      "fixture.ts",
      { cleye: "2.6.0" },
    );
    expect(out).toContain("FAIL=0");
    expect(code).toBe(0);
  });

  test("Cleye commands each require strict/prototype guard and a schema", () => {
    const { out, code } = runFloor(
      `
      import { cli, command } from "cleye";
      function rejectPrototypeFlag() {}
      const run = command({
        name: "run",
        parameters: [],
        strictFlags: true,
        ignoreArgv: rejectPrototypeFlag,
      });
      const parsed = cli({
        name: "fixture",
        commands: [run],
        parameters: [],
        strictFlags: true,
        ignoreArgv: rejectPrototypeFlag,
      }, undefined, Bun.argv.slice(2));
      if (parsed._.length > 0) throw new Error("unexpected positional");
    `,
      "fixture.ts",
      { cleye: "2.6.0" },
    );
    expect(out).toContain("FAIL=0");
    expect(code).toBe(0);
  });

  test("an unguarded Cleye command FAILs even when its parent is guarded", () => {
    const { out, code } = runFloor(
      `
      import { cli, command } from "cleye";
      function rejectPrototypeFlag() {}
      const run = command({ name: "run", parameters: [], strictFlags: true });
      const parsed = cli({ name: "fixture", commands: [run], parameters: [], strictFlags: true, ignoreArgv: rejectPrototypeFlag }, undefined, Bun.argv.slice(2));
      if (parsed._.length > 0) throw new Error("unexpected positional");
    `,
      "fixture.ts",
      { cleye: "2.6.0" },
    );
    expect(out).toContain("ignoreArgv: rejectPrototypeFlag");
    expect(code).toBe(1);
  });

  test("an unrelated command helper is not counted as a Cleye command boundary", () => {
    const { out, code } = runFloor(
      `
      import { cli } from "cleye";
      import { command } from "./lib.ts";
      function rejectPrototypeFlag() {}
      const parsed = cli({ name: "fixture", parameters: [], strictFlags: true, ignoreArgv: rejectPrototypeFlag }, undefined, Bun.argv.slice(2));
      command("persist", parsed);
      if (parsed._.length > 0) throw new Error("unexpected positional");
    `,
      "fixture.ts",
      { cleye: "2.6.0" },
    );
    expect(out).toContain("FAIL=0");
    expect(code).toBe(0);
  });

  test("unmarked direct type-flag FAILs", () => {
    const { out, code } = runFloor(`
      const args = Bun.argv.slice(2);
      const parsed = typeFlag({}, args, { ignore: () => true });
      process.stdout.write(parsed._.join("\\n"));
    `);
    expect(out).toContain(
      "direct type-flag needs an exact argv-forwarding marker",
    );
    expect(code).toBe(1);
  });

  test("the exact forwarding marker permits a real type-flag boundary", () => {
    const { out, code } = runFloor(`
      // argv-forwarding: textlint
      const args = Bun.argv.slice(2);
      const parsed = typeFlag({}, [...args], {
        ignore: (type) => type === "unknown-flag" || type === "argument",
      });
      if (Object.keys(parsed.unknownFlags).length > 0) throw new Error("invariant");
      process.stdout.write(args.join("\\n"));
    `);
    expect(out).toContain("FAIL=0");
    expect(code).toBe(0);
  });

  test("comments, strings, and templates that mention parser APIs do not fire", () => {
    const { out, code } = runFloor(`
      // Bun.argv.slice(2); parseArgs({ strict: true }); cli({}); typeFlag({});
      const example = "process.argv.slice(2); parseArgs({ strict: true }); cli({}); typeFlag({})";
      const template = \`Bun.argv.slice(2); cli({}); typeFlag({})\`;
      process.stdout.write(example);
    `);
    expect(out).toContain("FAIL=0");
    expect(code).toBe(0);
  });

  test("template interpolation cannot hide raw argv or parser boundaries", () => {
    const rawArgv = runFloor(
      interpolatedFixture("({ value: Bun.argv.slice(2) }).value"),
    );
    expect(rawArgv.out).toContain("without a Cleye boundary");
    expect(rawArgv.code).toBe(1);

    const unguardedCleye = runFloor(
      `import { cli } from "cleye"; ${interpolatedFixture(
        'cli({ name: "fixture" }, undefined, Bun.argv.slice(2))',
      )}`,
      "fixture.ts",
      { cleye: "2.6.0" },
    );
    expect(unguardedCleye.out).toContain("strictFlags: true");
    expect(unguardedCleye.code).toBe(1);

    const directTypeFlag = runFloor(
      interpolatedFixture("typeFlag({}, Bun.argv.slice(2))"),
    );
    expect(directTypeFlag.out).toContain(
      "direct type-flag needs an exact argv-forwarding marker",
    );
    expect(directTypeFlag.code).toBe(1);

    const nestedTemplate = runFloor(
      interpolatedFixture(templateExpression("Bun.argv.slice(2)")),
    );
    expect(nestedTemplate.out).toContain("without a Cleye boundary");
    expect(nestedTemplate.code).toBe(1);

    const benignExpression = runFloor(
      `${interpolatedFixture(
        JSON.stringify("Bun.argv.slice(2); cli({}); typeFlag({})"),
      )} process.stdout.write(hidden);`,
    );
    expect(benignExpression.out).toContain("FAIL=0");
    expect(benignExpression.code).toBe(0);
  });

  test("Cleye maps declared positional schemas and the local guard rejects __proto__ before mutation", () => {
    function rejectPrototypeFlag(
      type: "known-flag" | "unknown-flag" | "argument",
      flag: string,
    ): void {
      if (type === "unknown-flag" && flag === "__proto__") {
        throw new Error("prototype");
      }
    }
    const parsed = cli(
      {
        name: "fixture",
        parameters: ["<file...>"],
        strictFlags: true,
        ignoreArgv: rejectPrototypeFlag,
        help: false,
      },
      undefined,
      ["first.ts", "second.ts"],
    );
    expect(parsed._.file).toEqual(["first.ts", "second.ts"]);

    const prototypeArgv = ["--__proto__"];
    expect(() =>
      cli(
        {
          name: "fixture",
          parameters: [],
          strictFlags: true,
          ignoreArgv: rejectPrototypeFlag,
          help: false,
        },
        undefined,
        prototypeArgv,
      ),
    ).toThrow("prototype");
    expect(prototypeArgv).toEqual(["--__proto__"]);
  });

  test("the forwarding recipe leaves downstream token order and -- untouched", () => {
    const downstreamArgv = [
      "--textlint-rule",
      "value",
      "--",
      "file.md",
      "--literal",
    ];
    const parseCopy = [...downstreamArgv];
    const parsed = typeFlag({}, parseCopy, {
      ignore: (type) => type === "unknown-flag" || type === "argument",
    });
    expect(Object.keys(parsed.unknownFlags)).toEqual([]);
    expect(downstreamArgv).toEqual([
      "--textlint-rule",
      "value",
      "--",
      "file.md",
      "--literal",
    ]);
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
