import { expect, test } from "bun:test";
import {
  cpSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { skillFiles } from "../skills-declaration.ts";
import {
  prepareSkillCopy,
  skillEntries,
  unresolvedSkillImports,
} from "../skills-copy.ts";

const root = resolve(import.meta.dir, "../..");

test("every bundled skill entry resolves in isolated Claude and Codex homes", async () => {
  const home = mkdtempSync(join(tmpdir(), "skill-copy-imports-"));
  using _home = {
    [Symbol.dispose]: () => {
      rmSync(home, { recursive: true, force: true });
    },
  };
  let count = 0;
  for (const { path } of skillFiles(join(root, "agents/skills"))) {
    const source = dirname(path);
    const prepared = join(home, "prepared", basename(source));
    const built = await prepareSkillCopy(source, prepared);
    expect(built.isOk(), built.isErr() ? built.error : "prepared copy").toBe(
      true,
    );
    for (const base of [".claude/skills", ".agents/skills"]) {
      const target = join(home, base, basename(source));
      cpSync(prepared, target, { recursive: true });
      expect(lstatSync(target).isSymbolicLink()).toBe(false);
      expect(await unresolvedSkillImports(target)).toEqual([]);
      count += (await skillEntries(target)).length;
    }
  }
  expect(count).toBeGreaterThan(0);
  process.stdout.write(
    `PASS: ${count} bundled entries; zero unresolved imports across both homes\n`,
  );
}, 120_000);

test("the gate rejects an unbundled 2026-10-24 hooks/zod.ts copy", async () => {
  const home = mkdtempSync(join(tmpdir(), "skill-copy-regression-"));
  using _home = {
    [Symbol.dispose]: () => {
      rmSync(home, { recursive: true, force: true });
    },
  };
  const source = join(root, "agents/skills/driving-grok");
  for (const base of [".claude/skills", ".agents/skills"]) {
    const target = join(home, base, "driving-grok");
    expect((await prepareSkillCopy(source, target)).isOk()).toBe(true);
    const file = join(target, "scripts/probe-models.ts");
    // Model a copy that bypassed bundling and restored the missing shared hook dependency.
    writeFileSync(
      file,
      'import { z } from "../../../hooks/zod.ts";\nexport { z };\n',
    );
    const failures = await unresolvedSkillImports(target);
    expect(
      failures.some(
        (failure) =>
          failure.includes("probe-models.ts") &&
          failure.includes("../../../hooks/zod.ts"),
      ),
    ).toBe(true);
    process.stdout.write(`EXPECTED FAIL: ${failures.join("\n")}\n`);
  }
  // Repository tests are resources, not deployment entries: their imports stay unchanged.
  expect(
    readFileSync(join(source, "tests/probe-models.test.ts"), "utf8"),
  ).toContain("bun:test");
});
