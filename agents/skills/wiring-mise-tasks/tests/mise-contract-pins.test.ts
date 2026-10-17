import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// C-C HOUSE-PINNED: bun matches the exact house pin, with a temporary previous-house warning.
const script = resolve(import.meta.dir, "../scripts/mise-contract.ts");
const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});
async function repo(tools: string): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), "mise-pins-"));
  dirs.push(d);
  // A task is needed: without one the contract is "not adopted" and the pin check never runs.
  await writeFile(
    join(d, "mise.toml"),
    `[tools]\n${tools}\n\n${["fmt", "f", "fmt:check", "lint", "test", "up", "check"].map((name) => `[tasks."${name}"]\nrun = "true"`).join("\n")}\n`,
  );
  return d;
}
async function run(dir: string): Promise<{ output: string; exit: number }> {
  const p = Bun.spawn([process.execPath, script, dir], {
    timeout: 30_000,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  return { output: stdout + stderr, exit };
}

describe("mise-contract pins", () => {
  test.each([['"1.4.2"'], ['"1.4.4"'], ['"1.4.0"'], ['"1.2.22"'], ['"1.3"']])(
    "bun = %s is a FAIL naming the house pin",
    async (pin) => {
      const result = await run(await repo(`bun = ${pin}`));
      expect(result.exit).toBe(1);
      expect(result.output).toContain(
        `FAIL  pin: bun = ${pin} — the house pin is bun = "1.4.3"`,
      );
      expect(result.output).toContain(
        'edit mise.toml [tools] to bun = "1.4.3"',
      );
    },
  );

  test('previous house bun = "1.4" warns with the new pin and edit path during migration', async () => {
    const result = await run(await repo('bun = "1.4"'));
    expect(result.exit).toBe(0);
    expect(result.output).toContain(
      'WARN  pin: bun = "1.4" — the house pin is bun = "1.4.3"',
    );
    expect(result.output).toContain('edit mise.toml [tools] to bun = "1.4.3"');
    expect(result.output).toContain(
      "previous house pin temporarily accepted during migration",
    );
    expect(result.output).not.toContain("FAIL");
  });

  test('bun = "1.4.3" passes without a patch-pin warning', async () => {
    const result = await run(await repo('bun = "1.4.3"'));
    expect(result.exit).toBe(0);
    expect(result.output).not.toContain("pin:");
  });

  test("another tool pinned to a patch warns with the minor to write; a minor pin is silent", async () => {
    const result = await run(
      await repo('bun = "1.4.3"\njulia = "1.12.6"\nrust = "1.98"'),
    );
    expect(result.exit).toBe(0);
    expect(result.output).toContain(
      'WARN  pin: julia = "1.12.6" is a patch pin — it is never bumped and mise auto_install reinstalls it; pin the minor ("1.12")',
    );
    expect(result.output).not.toContain("rust");
  });
});
