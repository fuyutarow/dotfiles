import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConsumerRegistry,
  runConsumerGates,
  sharedSurfaces,
} from "../consumer-gate.ts";

// Real exports, PATH capture and nested sandboxes can exceed Bun's five seconds.
// Individual consumer-command deadlines (including the timeout test) stay short.
setDefaultTimeout(60_000);

async function snapshot(cwd: string) {
  for (const argv of [
    ["git", "init", "-q", "-b", "alpha"],
    ["git", "add", "--all"],
    [
      "git",
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "-qm",
      "fixture",
    ],
    existsSync(join(cwd, ".jj"))
      ? ["jj", "--ignore-working-copy", "git", "import"]
      : ["jj", "git", "init", "--colocate"],
  ]) {
    const p = Bun.spawn(argv, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      signal: AbortSignal.timeout(10000),
    });
    const [out, err, exit] = await Promise.all([
      new Response(p.stdout).text(),
      new Response(p.stderr).text(),
      p.exited,
    ]);
    expect(exit, out + err).toBe(0);
  }
}

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
if (await proc.exited !== 0 || !staged.includes('rule')) process.exit(8);
await Bun.write('gate-ran', 'only scratch');
if (rule === 'strict' && code === 'legacy') { process.stderr.write('lint:fixture: strict rule rejected code.ts\\n'); process.exit(7); }
`,
  );
  await snapshot(consumer);
  const registry = `[[consumers]]\nname = "fixture-consumer"\nroot = ${JSON.stringify(consumer)}\ntrunk = "alpha"\nsetup = ["true"]\nsurfaces = [${JSON.stringify(options.surface ?? "presets/demo")}]\ncommand = [${JSON.stringify(process.execPath)}, "gate.ts"]\ntimeout_ms = ${options.timeout ?? 10000}\n`;
  await writeFile(join(root, "presets/consumers.toml"), registry);
  return { root, consumer, temp };
}

test("strict preset refuses the named consumer with task diagnostics and never changes the source", async () => {
  const f = await fixture();
  const before = await readFile(join(f.consumer, "code.ts"), "utf8");
  const index = await readFile(join(f.consumer, ".git/index"));
  const result = await runConsumerGates(f.root, ["presets/demo/rule"]);
  expect(result.ok).toBe(false);
  expect(result.checked).toBe(1);
  expect(result.lines.join("\n")).toContain("FAIL fixture-consumer");
  expect(result.lines.join("\n")).toContain(
    "lint:fixture: strict rule rejected code.ts",
  );
  expect(await readFile(join(f.consumer, "code.ts"), "utf8")).toBe(before);
  expect(await Bun.file(join(f.consumer, "gate-ran")).exists()).toBe(false);
  expect(await readFile(join(f.consumer, ".git/index"))).toEqual(index);
});

test("the same preset passes when consumer code is compliant", async () => {
  const f = await fixture({ compliant: true });
  const result = await runConsumerGates(f.root, ["presets/demo/rule"]);
  expect(result).toMatchObject({ ok: true, checked: 1 });
  expect(result.lines[0]).toContain("PASS fixture-consumer");
});

test("omitted setup still runs the consumer check and rejects noncompliant code", async () => {
  for (const compliant of [true, false]) {
    const f = await fixture({ compliant });
    const registry = join(f.root, "presets/consumers.toml");
    await writeFile(
      registry,
      (await readFile(registry, "utf8")).replace('setup = ["true"]\n', ""),
    );
    const result = await runConsumerGates(f.root, ["presets/demo/rule"]);
    expect(result.ok, result.lines.join("\n")).toBe(compliant);
    expect(result.checked).toBe(1);
    expect(result.lines.join("\n")).not.toContain(": setup ");
    expect(result.lines.join("\n")).toContain(
      compliant ? "exit 0" : "lint:fixture: strict rule rejected code.ts",
    );
    expect(await Bun.file(join(f.consumer, "gate-ran")).exists()).toBe(false);
  }
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
  await snapshot(f.consumer);
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

test("captured declared Bun bin retains sibling and transitive imports inside isolation", async () => {
  const f = await fixture({ compliant: true });
  // Uncommitted source is absent from the trunk export mounted over the live consumer.
  const directory = join(f.consumer, "tools/import-bin");
  await mkdir(directory, { recursive: true });
  const entry = join(directory, "main.ts");
  await writeFile(
    join(directory, "value.ts"),
    "export const value = 'captured-graph';",
  );
  await writeFile(
    join(directory, "sibling.ts"),
    "export {value} from './value.ts';",
  );
  await writeFile(
    entry,
    `#!/usr/bin/env bun
import {value} from './sibling.ts';
if (!import.meta.main || !import.meta.dir.endsWith('/runtime-bin')) throw new Error('capture bypassed');
if (await Bun.file(${JSON.stringify(entry)}).exists()) throw new Error('live source visible');
if (value !== 'captured-graph' || Bun.argv.at(-1) !== 'argument') throw new Error('graph or argv changed');
process.stdout.write(value);
`,
  );
  await chmod(entry, 0o755);
  await writeFile(
    join(f.consumer, "package.json"),
    JSON.stringify({ bin: { "import-bin": "tools/import-bin/main.ts" } }),
  );
  const registry = join(f.root, "presets/consumers.toml");
  await writeFile(
    registry,
    (await Bun.file(registry).text()).replace(
      `command = [${JSON.stringify(process.execPath)}, "gate.ts"]`,
      `command = [${JSON.stringify(entry)}, "argument"]`,
    ),
  );
  const result = await runConsumerGates(f.root, ["presets/demo/rule"]);
  expect(result.ok, result.lines.join("\n")).toBe(true);
  expect(result.checked).toBe(1);
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

test("committed trunk wins over working copy and setup precedes the gate", async () => {
  const f = await fixture({
    compliant: true,
    gate: `if (await Bun.file('setup-ran').text() !== 'ready') process.exit(9);`,
  });
  const registry = join(f.root, "presets/consumers.toml");
  await writeFile(
    registry,
    (await readFile(registry, "utf8")).replace(
      'setup = ["true"]',
      `setup = [${JSON.stringify(process.execPath)}, "-e", ${JSON.stringify("await Bun.write('setup-ran', 'ready')")}]`,
    ),
  );
  await writeFile(join(f.consumer, "gate.ts"), "process.exit(99);");
  const result = await runConsumerGates(f.root, ["presets/demo/rule"]);
  expect(result.ok).toBe(true);
  expect(result.lines.join("\n")).toContain("exit 0");
  expect(await Bun.file(join(f.consumer, "setup-ran")).exists()).toBe(false);
});

test("committed relative, dangling and external symlinks keep their text", async () => {
  const f = await fixture({
    gate: `import {readlink} from 'node:fs/promises';
if (await readlink('relative') !== 'code.ts' || await readlink('dangling') !== 'absent' || await readlink('external') !== '/unavailable/consumer-link') process.exit(9);`,
  });
  await symlink("code.ts", join(f.consumer, "relative"));
  await symlink("absent", join(f.consumer, "dangling"));
  await symlink("/unavailable/consumer-link", join(f.consumer, "external"));
  await snapshot(f.consumer);
  const result = await runConsumerGates(f.root, ["presets/demo/rule"]);
  expect(result.ok).toBe(true);
});

test("missing trunk is distinct from copy and gate failures", async () => {
  const f = await fixture();
  const registry = join(f.root, "presets/consumers.toml");
  await writeFile(
    registry,
    (await readFile(registry, "utf8")).replace(
      'trunk = "alpha"',
      'trunk = "absent"',
    ),
  );
  const result = await runConsumerGates(f.root, ["presets/demo/rule"]);
  expect(result.lines.join("\n")).toContain(
    "FAIL fixture-consumer: no trunk (absent)",
  );
  expect(result.lines.join("\n")).not.toContain("consumer copy failed");
});

test("owner declarations select only the declared shared surfaces", async () => {
  const parsed = ConsumerRegistry.safeParse(
    Bun.TOML.parse(
      await Bun.file(
        new URL("../../presets/consumers.toml", import.meta.url),
      ).text(),
    ),
  );
  expect(parsed.success).toBe(true);
  if (!parsed.success) return;
  const declarations = [
    ...parsed.data.consumers,
    ...parsed.data.pending,
  ].toSorted(
    (a, b) =>
      ["retrospectives", "firedancer", "polysearch-v1"].indexOf(a.name) -
      ["retrospectives", "firedancer", "polysearch-v1"].indexOf(b.name),
  );
  expect(declarations).toHaveLength(3);
  expect(declarations.map((row: { name: string }) => row.name)).toEqual([
    "retrospectives",
    "firedancer",
    "polysearch-v1",
  ]);
  expect(declarations[0]).toMatchObject({
    trunk: "alpha",
    command: ["mise-contract"],
    surfaces: ["package-bins"],
    bins: ["mise-contract"],
  });
  expect(declarations[0]?.setup).toBeUndefined();
  expect(declarations[0]?.preset_dirs).toBeUndefined();
  expect(declarations[1]?.command).toEqual(["mise", "run", "lint:ts"]);
  expect(
    declarations.slice(2).map((row: { surfaces: string[] }) => row.surfaces),
  ).toEqual([["package-bins"]]);
  expect(declarations[2]?.full_gate_rule).toContain("CLI or manifest schema");
  expect(declarations[2]?.trunk).toBeUndefined();
  expect(parsed.data.pending).toHaveLength(0);
  expect(declarations[2]?.command).toEqual([
    "sh",
    "-c",
    "jj-commit --help >/dev/null && jj-push --help >/dev/null && fmt-staged --help >/dev/null && mise-contract && bun scripts/spec-lint.ts",
  ]);
  expect(declarations[2]?.notify).toEqual([
    {
      paths: ["tools/agent-resource-run/**"],
      contact: "polysearch-v1-agt_f24v",
      check: "RUSTC_WRAPPER= mise run hook:pre-commit",
    },
  ]);
});

async function typescriptFixture(directory?: string, missing = false) {
  const target = directory ?? ".";
  const f = await fixture({
    surface: "presets/typescript",
    gate: `
if (await Bun.file(${JSON.stringify(`${target}/.oxlintrc.json`)}).text() !== 'candidate-policy') process.exit(4);
if (${JSON.stringify(target)} !== '.' && await Bun.file('.oxlintrc.json').exists()) process.exit(5);
`,
  });
  await mkdir(join(f.root, "presets/typescript"), { recursive: true });
  await mkdir(join(f.root, "scripts"));
  await writeFile(
    join(f.root, "presets/typescript/preset.toml"),
    'files = [{source=".oxlintrc.json",destination=".oxlintrc.json"}]',
  );
  await writeFile(
    join(f.root, "presets/typescript/.oxlintrc.json"),
    "candidate-policy",
  );
  if (!missing) {
    await mkdir(join(f.consumer, target), { recursive: true });
    await writeFile(join(f.consumer, target, ".oxlintrc.json"), "old-policy");
  }
  if (!missing) await snapshot(f.consumer);
  if (directory !== undefined) {
    const registry = join(f.root, "presets/consumers.toml");
    await writeFile(
      registry,
      `${await Bun.file(registry).text()}\npreset_dirs = { typescript = ${JSON.stringify(directory)} }\n`,
    );
  }
  return f;
}

test("declared TypeScript directory receives the candidate config and its gate passes", async () => {
  const f = await typescriptFixture("tools");
  const result = await runConsumerGates(f.root, [
    "presets/typescript/.oxlintrc.json",
  ]);
  expect(result.ok, result.lines.join("\n")).toBe(true);
  expect(result.checked).toBe(1);
  expect(await Bun.file(join(f.consumer, "tools/.oxlintrc.json")).text()).toBe(
    "old-policy",
  );
});

test("omitted preset_dirs copies TypeScript at the consumer root", async () => {
  const f = await typescriptFixture();
  const result = await runConsumerGates(f.root, [
    "presets/typescript/.oxlintrc.json",
  ]);
  expect(result.ok, result.lines.join("\n")).toBe(true);
});

test("missing config file in a declared directory fails naming consumer and path", async () => {
  const f = await typescriptFixture("tools", true);
  // A root config must never satisfy a declaration for tools/.
  await mkdir(join(f.consumer, "tools"));
  await writeFile(join(f.consumer, ".oxlintrc.json"), "wrong-directory");
  await snapshot(f.consumer);
  const result = await runConsumerGates(f.root, [
    "presets/typescript/.oxlintrc.json",
  ]);
  expect(result.ok).toBe(false);
  expect(result.lines.join("\n")).toContain(
    "FAIL fixture-consumer: apply presets/typescript: declared preset directory tools has no config file tools/.oxlintrc.json",
  );
});

test("preset directory paths cannot escape the consumer", () => {
  const base = {
    name: "fixture",
    root: "/unused",
    setup: ["true"],
    surfaces: ["presets/typescript"],
    command: ["true"],
    timeout_ms: 1000,
  };
  for (const directory of [
    "../outside",
    "/outside",
    "tools/../../outside",
    "tools\\..\\outside",
    "",
  ]) {
    expect(
      ConsumerRegistry.safeParse({
        consumers: [{ ...base, preset_dirs: { typescript: directory } }],
      }).success,
    ).toBe(false);
  }
});

test("matching candidate paths emit one NOTICE with the owner contact and unavailable check", async () => {
  const f = await fixture({ surface: "package-bins", gate: "" });
  const registry = join(f.root, "presets/consumers.toml");
  await writeFile(
    registry,
    `${await Bun.file(registry).text()}\nnotify = [{ paths = ["tools/agent-resource-run/**"], contact = "polysearch-v1-agt_f24v", check = "RUSTC_WRAPPER= mise run hook:pre-commit" }]\n`,
  );
  const result = await runConsumerGates(f.root, [
    "tools/agent-resource-run/src/main.ts",
    "tools/agent-resource-run/package.json",
  ]);
  expect(result.ok, result.lines.join("\n")).toBe(true);
  expect(result.checked).toBe(1);
  expect(result.lines.filter((line) => line.startsWith("NOTICE"))).toEqual([
    "NOTICE fixture-consumer: contact polysearch-v1-agt_f24v; gate cannot run check: RUSTC_WRAPPER= mise run hook:pre-commit",
  ]);
  const unrelated = await runConsumerGates(f.root, ["tools/other/main.ts"]);
  expect(unrelated.lines.some((line) => line.startsWith("NOTICE"))).toBe(false);
});

test("omitted trunk uses the consumer repository's trunk() revset", async () => {
  const f = await fixture({ compliant: true });
  await writeFile(
    join(f.consumer, ".jj/repo/config.toml"),
    '[revset-aliases]\n"trunk()" = "alpha"\n',
  );
  const registry = join(f.root, "presets/consumers.toml");
  await writeFile(
    registry,
    (await readFile(registry, "utf8")).replace('trunk = "alpha"\n', ""),
  );
  await writeFile(join(f.consumer, "gate.ts"), "process.exit(99);");
  const result = await runConsumerGates(f.root, ["presets/demo/rule"]);
  expect(result).toMatchObject({ ok: true, checked: 1 });
});

test("a trunk revset resolving to the synthetic root reports no trunk", async () => {
  const f = await fixture();
  const registry = join(f.root, "presets/consumers.toml");
  await writeFile(
    registry,
    (await readFile(registry, "utf8")).replace(
      'trunk = "alpha"',
      'trunk = "root()"',
    ),
  );
  const result = await runConsumerGates(f.root, ["presets/demo/rule"]);
  expect(result.ok).toBe(false);
  expect(result.lines.join("\n")).toContain(
    "FAIL fixture-consumer: no trunk (root())",
  );
  expect(result.lines.join("\n")).not.toContain("consumer copy failed");
});

test("pending entries are reported without executing setup or gate", async () => {
  const f = await fixture({ gate: "process.exit(99);" });
  const registry = join(f.root, "presets/consumers.toml");
  const declaration = await readFile(registry, "utf8");
  await writeFile(
    registry,
    "consumers = []\n" +
      declaration.replace(
        "[[consumers]]",
        '[[pending]]\nreason = "owner must declare trunk"',
      ),
  );
  const result = await runConsumerGates(f.root, ["presets/demo/rule"]);
  expect(result).toMatchObject({ ok: true, checked: 0 });
  expect(result.lines).toContain(
    "pending fixture-consumer: owner must declare trunk",
  );
  expect(result.lines.join("\n")).not.toContain("setup true");
});

test("Bun link dependencies resolve to isolated candidate workspaces during setup", async () => {
  const f = await fixture({
    gate: "import {value} from 'fixture-link'; if(value !== 'candidate') process.exit(4);",
  });
  await mkdir(join(f.root, "tools/pkg"), { recursive: true });
  await writeFile(
    join(f.root, "package.json"),
    JSON.stringify({ workspaces: ["tools/pkg"] }),
  );
  await writeFile(
    join(f.root, "tools/pkg/package.json"),
    JSON.stringify({
      name: "fixture-link",
      version: "1.0.0",
      exports: "./index.ts",
    }),
  );
  await writeFile(
    join(f.root, "tools/pkg/index.ts"),
    "export const value = 'candidate';",
  );
  await writeFile(
    join(f.consumer, "package.json"),
    JSON.stringify({ dependencies: { "fixture-link": "link:fixture-link" } }),
  );
  await snapshot(f.consumer);
  const registry = join(f.root, "presets/consumers.toml");
  await writeFile(
    registry,
    (await readFile(registry, "utf8")).replace(
      'setup = ["true"]',
      `setup = [${JSON.stringify(process.execPath)}, "install", "--ignore-scripts"]`,
    ),
  );
  const result = await runConsumerGates(f.root, ["presets/demo/rule"]);
  expect(result.ok, result.lines.join("\n")).toBe(true);
  expect(await Bun.file(join(f.consumer, "bun.lock")).exists()).toBe(false);
});

test("jj consumer linters compare the candidate overlay with a private trunk baseline", async () => {
  const f = await fixture({
    gate: `
const snapshot = Bun.spawn(['jj', 'log', '-r', '@', '--no-graph', '-T', 'commit_id'], {stdout:'pipe', stderr:'pipe'});
const [id, diagnostic, status] = await Promise.all([new Response(snapshot.stdout).text(), new Response(snapshot.stderr).text(), snapshot.exited]);
if (status !== 0) { process.stderr.write(diagnostic); process.exit(4); }
const diff = Bun.spawn(['jj', '--ignore-working-copy', 'diff', '--from', id.trim()+'-', '--to', id.trim(), '--name-only'], {stdout:'pipe', stderr:'pipe'});
const [paths, errors, exit] = await Promise.all([new Response(diff.stdout).text(), new Response(diff.stderr).text(), diff.exited]);
if (exit !== 0 || !paths.includes('rule') || paths.includes('code.ts')) {process.stderr.write(errors+paths); process.exit(5);}
`,
  });
  const result = await runConsumerGates(f.root, ["presets/demo/rule"]);
  expect(result.ok, result.lines.join("\n")).toBe(true);
  expect(await Bun.file(join(f.consumer, "rule")).exists()).toBe(false);
});

test("consumer checks resolve the named origin trunk to the private baseline without setup", async () => {
  const f = await fixture({
    gate: `
const child = Bun.spawn(['jj', 'log', '-r', 'alpha@origin', '--no-graph', '-T', 'commit_id'], {stdout:'pipe', stderr:'pipe'});
const [id, diagnostic, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
if (exit !== 0) { process.stderr.write(diagnostic); process.exit(4); }
const baseline = Bun.spawn(['jj', 'file', 'show', '-r', id.trim(), 'rule'], {stdout:'pipe', stderr:'pipe'});
await Promise.all([new Response(baseline.stdout).text(), new Response(baseline.stderr).text()]);
if (await baseline.exited === 0 || await Bun.file('rule').text() !== 'strict') process.exit(5);
`,
  });
  const registry = join(f.root, "presets/consumers.toml");
  await writeFile(
    registry,
    (await readFile(registry, "utf8")).replace('setup = ["true"]\n', ""),
  );
  const result = await runConsumerGates(f.root, ["presets/demo/rule"]);
  expect(result.ok, result.lines.join("\n")).toBe(true);
  expect(result.checked).toBe(1);
  expect(await Bun.file(join(f.consumer, "rule")).exists()).toBe(false);
});

test("land-style outer sandbox preserves setup executable reached through a shadowed symlink chain", async () => {
  if (process.platform !== "linux") return;
  const f = await fixture({ compliant: true });
  await mkdir(join(f.consumer, "bin"));
  const executable = join(f.consumer, "bin/mise");
  await symlink("mise", executable);
  await snapshot(f.consumer);
  await rm(executable);
  const chain = join(f.temp, "toolchain-link");
  await symlink("/usr/bin/true", chain);
  await symlink(chain, executable);
  const registry = join(f.root, "presets/consumers.toml");
  await writeFile(
    registry,
    (await readFile(registry, "utf8")).replace(
      'setup = ["true"]',
      'setup = ["mise"]',
    ),
  );
  const runner = join(f.temp, "land-consumer-probe.ts");
  await writeFile(
    runner,
    `import {runConsumerGates} from ${JSON.stringify(join(import.meta.dir, "../consumer-gate.ts"))}; const r=await runConsumerGates(${JSON.stringify(f.root)}, ['presets/demo/rule']); process.stdout.write(JSON.stringify(r)); process.exitCode=r.ok?0:1;`,
  );
  const child = Bun.spawn(
    [
      "bwrap",
      "--die-with-parent",
      "--ro-bind",
      "/",
      "/",
      "--dev",
      "/dev",
      "--proc",
      "/proc",
      "--bind",
      f.temp,
      f.temp,
      "--",
      process.execPath,
      runner,
    ],
    {
      env: {
        ...process.env,
        TMPDIR: f.temp,
        PATH: `${join(f.consumer, "bin")}:${process.env.PATH ?? ""}`,
      },
      stdout: "pipe",
      stderr: "pipe",
      signal: AbortSignal.timeout(15000),
    },
  );
  const [out, err, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(exit, out + err).toBe(0);
  expect(out).toContain("PASS fixture-consumer: setup mise exit 0");
});

test("setup failures carry the last forty combined output lines indented", async () => {
  const f = await fixture();
  const registry = join(f.root, "presets/consumers.toml");
  const setup =
    "for(let i=0;i<60;i++)process.stdout.write('out'+i+'\\n'); for(let i=0;i<10;i++)process.stderr.write('err'+i+'\\n'); process.exit(6);";
  await writeFile(
    registry,
    (await readFile(registry, "utf8")).replace(
      'setup = ["true"]',
      `setup = [${JSON.stringify(process.execPath)}, "-e", ${JSON.stringify(setup)}]`,
    ),
  );
  const result = await runConsumerGates(f.root, ["presets/demo/rule"]);
  expect(result.ok).toBe(false);
  const report = result.lines.join("\n");
  expect(report).toContain("exit 6\n  out30\n");
  expect(report).toContain("\n  err9");
  expect(report).not.toContain("\n  out29\n");
  expect(result.lines[0]?.split("\n")).toHaveLength(41);
});

test("gate stderr is retained and indented under the failure", async () => {
  const f = await fixture({
    gate: "for(let i=0;i<55;i++)process.stderr.write('failure'+i+'\\n'); process.exit(7);",
  });
  const result = await runConsumerGates(f.root, ["presets/demo/rule"]);
  const failure = result.lines.find((line) => line.startsWith("FAIL"));
  expect(failure).toContain("exit 7\n  failure15\n");
  expect(failure?.split("\n")).toHaveLength(41);
  expect(failure).toContain("\n  failure54");
});

test("silent failures explicitly report that no command output was captured", async () => {
  const f = await fixture({ gate: "process.exit(3);" });
  const result = await runConsumerGates(f.root, ["presets/demo/rule"]);
  expect(result.lines.join("\n")).toContain(
    "exit 3\n  (command emitted no stdout or stderr)",
  );
});

test("tasks can spawn sh by name through a symlinked bin in nested sandboxes", async () => {
  if (process.platform !== "linux") return;
  const f = await fixture({ compliant: true });
  await mkdir(join(f.consumer, "shell-tools"));
  await symlink("shell-tools", join(f.consumer, "bin"));
  const shell = join(f.consumer, "shell-tools/sh");
  await symlink("sh", shell);
  await writeFile(
    join(f.consumer, "mise.toml"),
    '[tasks.setup]\nrun = "printf child-shell-ok"\n',
  );
  await snapshot(f.consumer);
  await rm(shell);
  const chain = join(f.temp, "shell-link");
  await symlink("/bin/sh", chain);
  await symlink(chain, shell);
  const registry = join(f.root, "presets/consumers.toml");
  await writeFile(
    registry,
    (await readFile(registry, "utf8")).replace(
      'setup = ["true"]',
      'setup = ["mise", "run", "setup"]',
    ),
  );
  const runner = join(f.temp, "land-child-shell-probe.ts");
  await writeFile(
    runner,
    `import {runConsumerGates} from ${JSON.stringify(join(import.meta.dir, "../consumer-gate.ts"))}; const r=await runConsumerGates(${JSON.stringify(f.root)}, ['presets/demo/rule']); process.stdout.write(JSON.stringify(r)); process.exitCode=r.ok?0:1;`,
  );
  const p = Bun.spawn(
    [
      "bwrap",
      "--die-with-parent",
      "--ro-bind",
      "/",
      "/",
      "--dev",
      "/dev",
      "--proc",
      "/proc",
      "--bind",
      f.temp,
      f.temp,
      "--",
      process.execPath,
      runner,
    ],
    {
      env: {
        ...process.env,
        TMPDIR: f.temp,
        PATH: `${join(f.consumer, "bin")}:${process.env.PATH ?? ""}`,
      },
      stdout: "pipe",
      stderr: "pipe",
      signal: AbortSignal.timeout(20000),
    },
  );
  const [out, err, exit] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  expect(exit, out + err).toBe(0);
  expect(out).toContain("child-shell-ok");
});

test("direct CLI runs candidate gates and returns their diagnostics and status", async () => {
  const f = await fixture();
  const child = Bun.spawn(
    [
      process.execPath,
      join(import.meta.dir, "../consumer-gate.ts"),
      "--root",
      f.root,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 60_000,
    },
  );
  const [out, err, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(exit, err).toBe(1);
  expect(out).toContain("FAIL fixture-consumer");
  expect(out).toContain("lint:fixture: strict rule rejected code.ts");
});
