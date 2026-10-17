import { afterEach, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addedDiagnostics,
  checkConsumer,
  checkConsumers,
  diagnostics,
  type Consumer,
} from "../src/check-consumers.ts";

const temporary: string[] = [];
afterEach(() => {
  for (const path of temporary.splice(0))
    rmSync(path, { recursive: true, force: true });
});

test("diagnostics normalize run-specific paths; only workspace additions count", () => {
  const base = diagnostics(
    "/b/tools/agx-usehooks/src/index.ts(1,1): error TS1: x\nnoise\nsrc/a.ts(2,3): error TS2322: y\n",
    [["/b", "<repo>"]],
  );
  const workspace = diagnostics(
    "/w/tools/agx-usehooks/src/index.ts(1,1): error TS1: x\nsrc/a.ts(2,3): error TS2322: y\nsrc/a.ts(2,3): error TS2322: y\n",
    [["/w", "<repo>"]],
  );
  expect(base).toEqual([
    "<repo>/tools/agx-usehooks/src/index.ts(1,1): error TS1: x",
    "src/a.ts(2,3): error TS2322: y",
  ]);
  expect(addedDiagnostics(base, workspace)).toEqual([
    "src/a.ts(2,3): error TS2322: y",
  ]);
  expect(addedDiagnostics(workspace, base)).toEqual([]);
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "usehooks-consumer-"));
  temporary.push(root);
  const tree = (name: string, declaration: string) => {
    const path = join(root, name, "tools/agx-usehooks");
    mkdirSync(join(path, "src"), { recursive: true });
    writeFileSync(
      join(path, "package.json"),
      JSON.stringify({ name: "agx-usehooks", type: "module" }),
    );
    writeFileSync(join(path, "src/index.ts"), declaration);
    return path;
  };
  const shape =
    "export declare function gpu(): {nowPct: number} | {unavailable: string};\n";
  const alpha = tree("alpha", shape);
  const consumerRoot = join(root, "consumer");
  const adapter = join(root, "bun-check-adapter.ts");
  const hooks = join(consumerRoot, ".agents/hooks");
  const installed = join(root, "installed");
  for (const path of [hooks, installed, join(consumerRoot, "node_modules")])
    mkdirSync(path, { recursive: true });
  writeFileSync(join(installed, "index.ts"), shape);
  writeFileSync(
    join(installed, "package.json"),
    JSON.stringify({ name: "agx-usehooks", exports: "./index.ts" }),
  );
  const link = join(consumerRoot, "node_modules/agx-usehooks");
  symlinkSync(installed, link);
  const config = JSON.stringify({
    compilerOptions: {
      types: [],
      strict: true,
      noEmit: true,
      module: "ESNext",
      moduleResolution: "bundler",
      allowImportingTsExtensions: true,
    },
    include: [".agents/hooks/**/*.ts", "launcher/**/*.ts"],
  });
  writeFileSync(join(consumerRoot, "tsconfig.json"), config);
  writeFileSync(
    adapter,
    `import { readFileSync } from "node:fs";\n` +
      `const args = Bun.argv.slice(2);\n` +
      `const project = args[args.indexOf("-p") + 1] ?? ".";\n` +
      `if (args.includes("--showConfig")) {\n` +
      `  const config = Bun.JSONC.parse(readFileSync(project + "/tsconfig.json", "utf8"));\n` +
      `  process.stdout.write(JSON.stringify({ compilerOptions: config.compilerOptions ?? {} }));\n` +
      `} else {\n` +
      `  const result = Bun.spawnSync(["bun", "check", "--project", project], { stdout: "inherit", stderr: "inherit" });\n` +
      `  process.exitCode = result.exitCode;\n` +
      `}\n`,
  );
  const hook = join(hooks, "lanes.ts");
  const source =
    "import {gpu} from 'agx-usehooks'; import './broken.ts'; const device = gpu(); if (!('unavailable' in device)) device.nowPct;\n";
  writeFileSync(hook, source);
  // 14 errors unrelated to agx-usehooks, present on alpha and in the workspace alike.
  writeFileSync(
    join(hooks, "broken.ts"),
    Array.from(
      { length: 14 },
      (_, index) => `export const v${index}: number = 'not a number';\n`,
    ).join(""),
  );
  const consumer: Consumer = {
    name: "fixture",
    root: consumerRoot,
    hooks: ".agents/hooks",
    link_task: "link:agx-usehooks",
    link_path: "node_modules/agx-usehooks",
    command: ["bun", adapter, "--noEmit", "-p", "{root}"],
  };
  return {
    root,
    tree,
    alpha,
    shape,
    consumer,
    consumerRoot,
    hook,
    source,
    config,
    link,
    installed,
  };
}

test("a consumer broken on alpha is PRE-EXISTING; an added consumer error FAILs naming it; nothing is written", async () => {
  const f = fixture();
  const lines: string[] = [];
  const write = (text: string) => void lines.push(text);
  const same = f.tree("same", `${f.shape}export const touched = 1;\n`);
  expect(await checkConsumer(f.consumer, same, f.alpha, write)).toBe(0);
  expect(lines.join("")).toContain(
    "PRE-EXISTING fixture: 14 error(s) present with the base too; none added",
  );

  lines.length = 0;
  const changed = f.tree(
    "changed",
    "export declare function gpu(): {utilPct: number} | {unavailable: string};\n",
  );
  expect(await checkConsumer(f.consumer, changed, f.alpha, write)).toBe(1);
  const report = lines.join("");
  expect(report).toMatch(
    /\.agents\/hooks\/lanes\.ts[(:]1[,:]\d+\)?:? -? ?error TS2339: Property 'nowPct' does not exist/u,
  );
  expect(report).toContain(
    "FAIL fixture: 1 diagnostic(s) added by the workspace",
  );
  expect(report).not.toContain("broken.ts");

  expect(readFileSync(f.hook, "utf8")).toBe(f.source);
  expect(readFileSync(join(f.consumerRoot, "tsconfig.json"), "utf8")).toBe(
    f.config,
  );
  expect(realpathSync(f.link)).toBe(realpathSync(f.installed));
}, 120_000);

test("an untouched agx-usehooks tree is SKIP; a missing consumer is SKIP", async () => {
  const f = fixture();
  const lines: string[] = [];
  const write = (text: string) => void lines.push(text);
  const untouched = f.tree("untouched", f.shape);
  expect(
    await checkConsumers(
      [{ ...f.consumer, root: "/nonexistent" }],
      untouched,
      f.alpha,
      write,
    ),
  ).toBe(0);
  expect(lines.join("")).toBe(
    "SKIP usehooks:consumers: the landed diff does not touch tools/agx-usehooks\n",
  );

  lines.length = 0;
  const changed = f.tree("changed", `${f.shape}export const touched = 1;\n`);
  expect(
    await checkConsumers(
      [{ ...f.consumer, root: join(f.root, "absent") }],
      changed,
      f.alpha,
      write,
    ),
  ).toBe(0);
  expect(lines.join("")).toContain("SKIP fixture: consumer not present");
});
