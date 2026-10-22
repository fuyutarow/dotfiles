import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  checkTools,
  commandFindings,
  sourceFindings,
} from "../scripts/mise-contract.ts";
import templateCounterexample from "./fixtures/template-interpolation-counterexample.json";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
const allowed = new Set(["bun", "bunx", "mise", "sui", "fnox", "oxfmt"]);
test("reference checker template interpolation counterexample", () => {
  expect(sourceFindings(templateCounterexample.source, allowed)).toEqual(
    templateCounterexample.toolsContract,
  );
});
test.each([
  'tag`result: ${Bun.spawn(["rogue"])}`;',
  'const text = `result: ${format(nested(Bun.spawn(["rogue"])))}`;',
  'const text = `outer ${`inner ${Bun.spawn(["rogue"])}`}`;',
  'const text = `result: ${({ value: Bun.spawn({cmd: ["rogue"]}) }).value}`;',
  'const text = `result: ${/}/.test(value) ? Bun.spawn(["rogue"]) : ""}`;',
  'const text = `result: ${/* } */ Bun.spawn(["rogue"]) // }\n}`;',
  'const text = `result: ${"}" + Bun.spawn(["rogue"])}`;',
  "const text = `result: ${$`rogue`}`;",
  'Bun.spawn([`result: ${Bun.spawn(["rogue"])}`]);',
])("template expression authority: %s", (source) => {
  expect(sourceFindings(source, allowed)).toEqual(["undeclared command rogue"]);
});
test("template boundaries keep data and dynamic argv out of command positions", () => {
  expect(
    sourceFindings(
      [
        'const text = `Bun.spawn(["rogue"])`;',
        'const text = `escaped \\${Bun.spawn(["rogue"])}`;',
        'const text = `value ${"Bun.spawn([\\"rogue\\"])"}`;',
        'const text = `value ${/Bun.spawn(["rogue"])/}`;',
        'const text = `value ${/* Bun.spawn(["rogue"]) */ 1}`;',
        'Bun.spawn([`bun${suffix}`, "rogue"]);',
        'Bun.spawn([`bun${"rogue"}`]);',
        'const text = `value ${Bun.spawn}(["rogue"])`;',
      ].join("\n"),
      allowed,
    ),
  ).toEqual([]);
});
test("interpolations preserve outer shell tags, argv and findings after the template", () => {
  expect(
    sourceFindings(
      'Bun.$`rogue ${Bun.spawn(["inner"])} ${`nested ${Bun.spawn(["deep"])}`}`; Bun.spawn(["after"]);',
      allowed,
    ),
  ).toEqual([
    "undeclared command rogue",
    "undeclared command inner",
    "undeclared command deep",
    "undeclared command after",
  ]);
  expect(sourceFindings('Bun.spawn([`sh`, "-c", `rogue`]);', allowed)).toEqual([
    "undeclared command rogue",
  ]);
});
for (const source of [
  'Bun.spawn(["rogue"]);',
  'Bun.spawn({cmd: ["rogue", "arg"]});',
  'Bun.spawnSync(["rogue"]);',
  'Bun["spawn"](["rogue"]);',
  'spawnSync("rogue", []);',
  'execFile("rogue", []);',
  'execSync("bun --version && rogue");',
  "$`bun --version | rogue`;",
  "Bun.$`rogue ${argument}`;",
  'Bun.spawn(["sh", "-c", "rogue"]);',
  "$.quiet()`rogue`;",
  'cp.execFile("sh", ["-c", "rogue"]);',
])
  test(`literal source authority: ${source}`, () => {
    expect(sourceFindings(source, allowed)).toContain(
      "undeclared command rogue",
    );
  });
for (const command of [
  "rogue --version",
  "bun --version && rogue",
  "bun --version | rogue",
  "VALUE=$(rogue) bun script.ts",
  'VALUE="$(rogue)" bun script.ts',
  "fnox exec -- env KEY=value rogue",
  'sh -c "rogue"',
  "if true; then rogue; fi",
  "bun --version # comment\nrogue",
  "bun --version `rogue`",
])
  test(`literal task authority: ${command}`, () => {
    expect(commandFindings(command, allowed)).toContain(
      "undeclared command rogue",
    );
  });
test("data, regexes, comments and dynamic commands are not literal executions", () => {
  expect(
    sourceFindings(
      `// Bun.spawn(["rogue"])
const text = 'Bun.spawn(["rogue"])';
const regex = /^- \u0060(\\S+)\u0060 — (.+)$/u;
fail(\u0060malformed \${kind}\u0060);
const msg = \u0060template \${items.map(x => \u0060\${x}\u0060)}\u0060;
Bun.spawn([process.execPath]);
const run = Bun.spawn; run(["rogue"]);
client.exec("rogue");`,
      allowed,
    ),
  ).toEqual([]);
});
test("npm execution is lock-only and data in shell quotes stays data", () => {
  expect(commandFindings("bunx oxfmt", allowed)).toContain(
    "npm execution must use --no-install",
  );
  expect(commandFindings("bun x --no-install rogue", allowed)).toContain(
    "undeclared npm command rogue",
  );
  expect(commandFindings("bun x --no-install --bun oxfmt", allowed)).toEqual(
    [],
  );
  expect(
    commandFindings(
      `ID=$(bun -e 'import x from "x"; console.log(x)') fnox exec -- bun script.ts`,
      allowed,
    ),
  ).toEqual([]);
});
const policy = {
  taskDirectory: "mise/tasks",
  requirePinned: true,
  requireNpmLock: true,
  requireAggressive: true,
  requireMinVersion: true,
};
async function fixture(
  change: {
    command?: string;
    includes?: string[];
    tool?: string;
    dependency?: string;
    lockVersion?: string;
    duplicate?: boolean;
    aggressive?: boolean;
    rootTask?: boolean;
    source?: string;
  } = {},
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mise-tools-"));
  roots.push(root);
  await mkdir(join(root, "mise/tasks"), { recursive: true });
  await mkdir(join(root, "scripts/tests"), { recursive: true });
  await Bun.write(
    join(root, "mise.toml"),
    `min_version = "2026.10.7"
[settings]
activate_aggressive = ${change.aggressive ?? true}
[tools]
bun = "${change.tool ?? "1.4"}"
${change.duplicate === true ? 'oxfmt = "0.67.0"' : ""}
[task_config]
includes = ${JSON.stringify(change.includes ?? ["mise/tasks"])}
${change.rootTask === true ? '[tasks.probe]\nrun = "bun --version"' : ""}`,
  );
  const version = change.dependency ?? "0.67.0";
  const locked = change.lockVersion ?? version;
  await Bun.write(
    join(root, "package.json"),
    JSON.stringify({ devDependencies: { oxfmt: version } }),
  );
  await Bun.write(
    join(root, "bun.lock"),
    `// Bun JSONC lock\n${JSON.stringify({ workspaces: { "": { devDependencies: { oxfmt: locked } } }, packages: { oxfmt: [`oxfmt@${locked}`, "", { bin: { oxfmt: "bin.js" } }] } })}`,
  );
  await Bun.write(
    join(root, "mise/tasks/check.toml"),
    `[probe]\nrun = ${JSON.stringify(change.command ?? "bun --version")}\n`,
  );
  if (change.source !== undefined)
    await Bun.write(join(root, "scripts/tests/probe.test.ts"), change.source);
  return root;
}
test("strict policy accepts declared tools and locked bins", async () => {
  expect(
    await checkTools(
      await fixture({ command: "bunx --no-install oxfmt" }),
      policy,
    ),
  ).toEqual([]);
});
test.each([
  [{ command: "rogue --version" }, "undeclared command rogue"],
  [{ source: 'Bun.spawn(["rogue"]);' }, "undeclared command rogue"],
  [{ aggressive: false }, "invalid mise tool configuration"],
  [{ duplicate: true }, "duplicate tool authority oxfmt"],
  [{ rootTask: true }, "task bodies must live in mise/tasks"],
  [
    { includes: ["mise/tasks", ".mise/tasks"] },
    "task includes must be exactly mise/tasks",
  ],
  [{ tool: "latest" }, "unpinned tool bun"],
  [{ dependency: "^0.67.0" }, "missing exact locked npm dependency oxfmt"],
  [{ lockVersion: "0.66.0" }, "missing exact locked npm dependency oxfmt"],
])("strict repository policy: %j", async (change, expected) => {
  expect(
    (await checkTools(await fixture(change), policy)).join("\n"),
  ).toContain(expected);
});
test("includes outside the conventional directory and run arrays are inspected", async () => {
  const root = await fixture({ includes: ["extra/tasks.toml"] });
  await Bun.write(
    join(root, "extra/tasks.toml"),
    '[probe]\nrun = ["bun --version", "rogue --version"]\n',
  );
  expect((await checkTools(root)).join("\n")).toContain(
    "extra/tasks.toml:probe: undeclared command rogue",
  );
});
async function cli(root: string, ...flags: string[]) {
  const child = Bun.spawn(
    [
      process.execPath,
      resolve(import.meta.dir, "../scripts/mise-contract.ts"),
      ...flags,
      root,
    ],
    {
      env: { ...process.env, MISE_TRUSTED_CONFIG_PATHS: root },
      timeout: 30_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [out, err, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { out: out + err, exit };
}
test("real mise integration fails on a split task's undeclared command", async () => {
  const result = await cli(
    await fixture({ command: "rogue --version" }),
    "--tools",
  );
  expect(result.exit).toBe(1);
  expect(result.out).toContain(
    "mise/tasks/check.toml:probe: undeclared command rogue",
  );
});
test("real mise integration rejects the reference checker template counterexample", async () => {
  const result = await cli(
    await fixture({ source: templateCounterexample.source }),
    "--tools",
  );
  expect(result.exit).toBe(1);
  expect(result.out).toContain(
    "scripts/tests/probe.test.ts: undeclared command rogue",
  );
});
test("default runtime and body rules inspect split files and run arrays", async () => {
  const root = await fixture({ includes: ["extra.toml"] });
  await Bun.write(
    join(root, "extra.toml"),
    '[outside]\nrun = ["echo hello", "go version"]\n',
  );
  const result = await cli(root);
  expect(result.exit).toBe(1);
  expect(result.out).toContain("invoke 'go' but [tools] does not declare it");
});
