import { afterAll, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attempt } from "../../shared/src/attempt.ts";
import { jsonOf, z } from "../../shared/src/zod.ts";

const root = join(import.meta.dir, "../../..");
const scratch = join(tmpdir(), `prefer-bun-${crypto.randomUUID()}`);
await mkdir(scratch);
afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});
const policyText = await Bun.file(join(root, "oxlint-policy.toml")).text();
const parsed = await attempt(() => Bun.TOML.parse(policyText));
const Policy = z.object({
  bun_api: z.object({
    exclude: z.array(z.string()),
    apis: z.array(
      z.object({
        modules: z.array(z.string()),
        api: z.string(),
        replacement: z.string(),
      }),
    ),
  }),
});
const policy = parsed.ok ? Policy.safeParse(parsed.value) : undefined;
if (policy?.success !== true) expect.unreachable("invalid Bun API policy");
const apis = policy.data.bun_api.apis;
const exclude = policy.data.bun_api.exclude;
const Report = z.object({
  number_of_files: z.number(),
  diagnostics: z.array(z.object({ message: z.string() })),
});
let serial = 0;

async function lint(
  code: string,
  exempt = false,
  useCheckoutRoot = false,
  fixturePath?: string,
) {
  serial += 1;
  const file = fixturePath ?? `fixture-${serial}.ts`;
  const config = join(scratch, `config-${serial}.json`);
  await Bun.write(join(scratch, file), code);
  await Bun.write(
    config,
    JSON.stringify({
      plugins: [],
      categories: { correctness: "off" },
      jsPlugins: [
        {
          name: "dotfiles",
          specifier: join(root, "tools/oxlint-plugin-dotfiles/src/index.mjs"),
        },
      ],
      overrides: [
        { files: exclude, rules: { "dotfiles/prefer-bun-api": "off" } },
        ...(exempt && !useCheckoutRoot
          ? [{ files: [file], rules: { "dotfiles/prefer-bun-api": "off" } }]
          : []),
      ],
      rules: {
        "dotfiles/prefer-bun-api": [
          "error",
          {
            apis,
          },
        ],
      },
    }),
  );
  const result = Bun.spawnSync(
    [
      process.execPath,
      join(root, "node_modules/oxlint/bin/oxlint"),
      "-c",
      config,
      "--format",
      "json",
      join(scratch, file),
    ],
    { cwd: root, timeout: 10_000 },
  );
  const report = jsonOf(Report).safeParse(result.stdout.toString());
  if (!report.success) expect.unreachable(result.stderr.toString());
  expect(report.data.number_of_files).toBe(1);
  return {
    exit: result.exitCode,
    messages: report.data.diagnostics.map((d) => d.message),
  };
}

const cases = apis.flatMap((entry) =>
  entry.modules.flatMap((module) =>
    ["named", "namespace", "default", "require", "destructure"].map(
      (style) => [entry.api, entry.replacement, module, style] as const,
    ),
  ),
);
test.each(cases)("%s via %s %s %s", async (api, replacement, module, style) => {
  const snippets: Record<string, string> = {
    named: `import { ${api} as action } from '${module}'; action('p');`,
    namespace: `import * as io from '${module}'; io.${api}('p');`,
    default: `import io from '${module}'; io['${api}']('p');`,
    require: `const io = require('${module}'); io.${api}('p');`,
    destructure: `const { ${api}: action } = require('${module}'); action('p');`,
  };
  const result = await lint(snippets[style] ?? "");
  expect(result.exit).toBe(1);
  expect(result.messages).toEqual([
    `${api} → ${replacement} (Bun-first I/O policy).`,
  ]);
});

test("Bun calls, async fs, unrelated objects and shadowed bindings stay clear", async () => {
  const result =
    await lint(`import * as fs from 'node:fs'; import { readFileSync } from 'fs';
    function f(fs: {readFileSync: Function}, readFileSync: Function) { fs.readFileSync('p'); readFileSync('p'); }
    await fs.promises.readdir('p'); await Bun.file('p').text(); Bun.spawn(['true']); new Bun.CryptoHasher('sha256');`);
  expect(result.messages).toEqual([]);
});
test("an allowlisted file with a policy call is exempt", async () => {
  expect(
    (
      await lint(
        "import { createHash } from 'node:crypto'; createHash('sha256');",
        true,
      )
    ).messages,
  ).toEqual([]);
});
test("sync calls are owned by the built-in rule, never the Bun replacement plugin", async () => {
  const result = await lint(
    "import * as fs from 'node:fs'; function f() { return fs.readFileSync('p'); }",
  );
  expect(result.exit).toBe(0);
  expect(result.messages).toEqual([]);
});

test.each([
  "tests/helper.ts",
  "agents/codex/tests/codex-config.test.ts",
  "root.test.ts",
  "tools/demo/src/inline.test.ts",
])("test pattern excludes %s without a per-file exemption", async (path) => {
  const result = await lint(
    "import { createHash } from 'node:crypto'; createHash('sha256');",
    false,
    false,
    path,
  );
  expect(result.exit).toBe(0);
  expect(result.messages).toEqual([]);
});

test.each([
  "tools/tests-extra/src/io.ts",
  "src/test.ts",
  "src/io.test-helper.ts",
])("production neighbour %s remains governed", async (path) => {
  const result = await lint(
    "import { createHash } from 'node:crypto'; createHash('sha256');",
    false,
    false,
    path,
  );
  expect(result.exit).toBe(1);
  expect(result.messages[0]).toContain("createHash →");
});

test("a same-named file outside the plugin checkout cannot inherit an exemption", async () => {
  const result = await lint(
    "import { createHash } from 'node:crypto'; createHash('sha256');",
    true,
    true,
  );
  expect(result.exit).toBe(1);
  expect(result.messages[0]).toContain("createHash →");
});
