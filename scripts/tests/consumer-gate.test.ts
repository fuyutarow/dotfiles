import { afterEach, expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runConsumerGates, sharedSurfaces } from "../consumer-gate.ts";

const temporary: string[] = [];
afterEach(async () => {
  for (const path of temporary.splice(0))
    await rm(path, { recursive: true, force: true });
});

async function fixture(
  options: {
    compliant?: boolean;
    gate?: string;
    timeout?: number;
    surface?: string;
  } = {},
) {
  const temp = await mkdtemp(join(tmpdir(), "consumer-gate-test-"));
  temporary.push(temp);
  const root = join(temp, "dotfiles");
  const consumer = join(temp, "original");
  await mkdir(join(root, "presets/src"), { recursive: true });
  await mkdir(join(root, "presets/demo"), { recursive: true });
  await mkdir(consumer);
  await writeFile(
    join(root, "presets/demo/preset.toml"),
    'files = [{source = "rule", destination = "rule"}]',
  );
  await writeFile(join(root, "package.json"), "{}");
  await writeFile(join(root, "presets/demo/rule"), "strict");
  // A fixture preset executable applies a real candidate rule to the copied consumer.
  await writeFile(
    join(root, "presets/src/cli.ts"),
    `import { join } from 'node:path';\nawait Bun.write(join(Bun.argv.at(-1), 'rule'), await Bun.file(join(import.meta.dir, '../demo/rule')).text());\n`,
  );
  await writeFile(
    join(consumer, "code.ts"),
    options.compliant === true ? "compliant" : "legacy",
  );
  await writeFile(
    join(consumer, "gate.ts"),
    options.gate ??
      `
const rule = await Bun.file('rule').text();
const code = await Bun.file('code.ts').text();
const proc = Bun.spawn(['git', 'diff', '--cached', '--name-only'], { stdout: 'pipe' });
const staged = await new Response(proc.stdout).text();
if (await proc.exited !== 0 || !staged.includes('code.ts')) process.exit(8);
await Bun.write('gate-ran', 'only scratch');
if (rule === 'strict' && code === 'legacy') { process.stderr.write('lint:fixture: strict rule rejected code.ts\\n'); process.exit(7); }
`,
  );
  const registry = `[[consumers]]\nname = "fixture-consumer"\nroot = ${JSON.stringify(consumer)}\nsurfaces = [${JSON.stringify(options.surface ?? "presets/demo")}]\ncommand = [${JSON.stringify(process.execPath)}, "gate.ts"]\ntimeout_ms = ${options.timeout ?? 10000}\n`;
  await writeFile(join(root, "presets/consumers.toml"), registry);
  return { root, consumer, temp };
}

test("strict preset refuses the named consumer with task diagnostics and never changes the source", async () => {
  const f = await fixture();
  const before = await readFile(join(f.consumer, "code.ts"), "utf8");
  const result = await runConsumerGates(f.root, ["presets/demo/rule"]);
  expect(result.ok).toBe(false);
  expect(result.checked).toBe(1);
  expect(result.lines.join("\n")).toContain("FAIL fixture-consumer");
  expect(result.lines.join("\n")).toContain(
    "lint:fixture: strict rule rejected code.ts",
  );
  expect(await readFile(join(f.consumer, "code.ts"), "utf8")).toBe(before);
  expect(await Bun.file(join(f.consumer, "gate-ran")).exists()).toBe(false);
  expect(await Bun.file(join(f.consumer, ".git/index")).exists()).toBe(false);
});

test("the same preset passes when consumer code is compliant", async () => {
  const f = await fixture({ compliant: true });
  const result = await runConsumerGates(f.root, ["presets/demo/rule"]);
  expect(result).toMatchObject({ ok: true, checked: 1 });
  expect(result.lines[0]).toContain("PASS fixture-consumer");
});

test("no shared surface skips without even loading the registry", async () => {
  const result = await runConsumerGates("/does-not-exist", [
    "README",
    "scripts/unrelated.ts",
  ]);
  expect(result).toMatchObject({ ok: true, checked: 0 });
  expect(result.lines[0]).toContain("SKIP");
});

test("unrelated consumers skip; missing registered consumer fails closed", async () => {
  const f = await fixture();
  expect(
    (await runConsumerGates(f.root, ["presets/python/config"])).checked,
  ).toBe(0);
  await rm(f.consumer, { recursive: true });
  const result = await runConsumerGates(f.root, ["presets/demo/rule"]);
  expect(result.ok).toBe(false);
  expect(result.lines[0]).toContain("fixture-consumer");
});

test("hung gates are red and report the timeout", async () => {
  const f = await fixture({ gate: "await Bun.sleep(30000);", timeout: 150 });
  const result = await runConsumerGates(f.root, ["presets/demo/rule"]);
  expect(result.ok).toBe(false);
  expect(result.lines.join("\n")).toContain("timeout after 150ms");
});

test("absolute paths cannot write the real consumer or an external symlink target", async () => {
  const f = await fixture({ compliant: true });
  const outside = join(f.temp, "outside");
  await writeFile(outside, "unchanged");
  await symlink(outside, join(f.consumer, "linked"));
  await writeFile(
    join(f.consumer, "gate.ts"),
    `await Bun.write(${JSON.stringify(outside)}, 'corrupted');`,
  );
  const result = await runConsumerGates(f.root, ["presets/demo/rule"]);
  expect(result.ok).toBe(false);
  expect(await readFile(outside, "utf8")).toBe("unchanged");
});

test("hooks and package bins run consumers against candidate implementations", async () => {
  const f = await fixture({
    surface: "package-bins",
    gate: "const p = Bun.spawn(['fixture-bin'], {stdout:'pipe'}); const text = await new Response(p.stdout).text(); if (await p.exited !== 0 || text.trim() !== 'candidate') process.exit(4);",
  });
  await mkdir(join(f.root, "tools/fixture"), { recursive: true });
  const bin = join(f.root, "tools/fixture/main.ts");
  await writeFile(
    bin,
    "#!/usr/bin/env bun\nprocess.stdout.write('candidate');",
  );
  await chmod(bin, 0o755);
  await writeFile(
    join(f.root, "package.json"),
    JSON.stringify({ bin: { "fixture-bin": "tools/fixture/main.ts" } }),
  );
  const result = await runConsumerGates(f.root, ["tools/fixture/main.ts"]);
  expect(result).toMatchObject({ ok: true, checked: 1 });
  expect(sharedSurfaces(["agents/hooks/test.ts"])).toContain("hooks");
});

test("invalid or missing registry cannot approve shared changes", async () => {
  const f = await fixture();
  await writeFile(
    join(f.root, "presets/consumers.toml"),
    'consumers = "invalid"',
  );
  expect((await runConsumerGates(f.root, ["presets/demo/rule"])).ok).toBe(
    false,
  );
});
