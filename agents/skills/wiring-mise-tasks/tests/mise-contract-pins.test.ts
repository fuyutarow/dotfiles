import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// C-C MINOR-PINNED: bun must equal the house minor (the dotfiles mise.toml); any other tool pinned
// to a patch warns.
const script = resolve(import.meta.dir, "../scripts/mise-contract.ts");
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function repo(tools: string): string {
  const d = mkdtempSync(join(tmpdir(), "mise-pins-"));
  dirs.push(d);
  // A task is needed: without one the contract is "not adopted" and the pin check never runs.
  writeFileSync(
    join(d, "mise.toml"),
    `[tools]\n${tools}\n\n[tasks.check]\nrun = "true"\n`,
  );
  return d;
}
function run(dir: string): string {
  const p = Bun.spawnSync(["bun", script, dir], { timeout: 30_000 });
  return p.stdout.toString();
}

describe("mise-contract pins", () => {
  test.each([['"1.4.0"'], ['"1.2.22"'], ['"1.3"']])(
    "bun = %s is a FAIL naming the house pin",
    (pin) => {
      expect(run(repo(`bun = ${pin}`))).toContain(
        `FAIL  pin: bun = ${pin} — the house pin is bun = "1.4"`,
      );
    },
  );

  test('bun = "1.4" passes', () => {
    expect(run(repo('bun = "1.4"'))).not.toContain("pin:");
  });

  test("another tool pinned to a patch warns with the minor to write; a minor pin is silent", () => {
    const out = run(repo('bun = "1.4"\njulia = "1.12.6"\nrust = "1.98"'));
    expect(out).toContain(
      'WARN  pin: julia = "1.12.6" is a patch pin — it is never bumped and mise auto_install reinstalls it; pin the minor ("1.12")',
    );
    expect(out).not.toContain("rust");
  });
});
