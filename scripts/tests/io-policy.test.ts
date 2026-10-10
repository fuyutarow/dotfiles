import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";
import { generatedOverrides, loadPolicy } from "../render-oxlintrc.ts";

const loaded = await loadPolicy();
if (!loaded.ok) expect.unreachable(loaded.error);
const policy = loaded.value;
const root = join(import.meta.dir, "../..");
const scratch = await mkdtemp(join(tmpdir(), "io-policy-"));
afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});
let serial = 0;
const Report = z.object({
  diagnostics: z.array(z.object({ code: z.string() })),
  number_of_files: z.number(),
});
async function lint(path: string, code: string) {
  serial += 1;
  const config = join(scratch, `config-${serial}.json`);
  await Bun.write(join(scratch, path), code);
  await Bun.write(
    config,
    JSON.stringify({
      plugins: ["node"],
      categories: { correctness: "off" },
      jsPlugins: [
        {
          name: "dotfiles",
          specifier: join(root, "tools/oxlint-plugin-dotfiles/src/index.mjs"),
        },
      ],
      rules: {
        "node/no-sync": ["error", { allowAtRootLevel: true }],
        "dotfiles/prefer-bun-api": ["error", { apis: policy.bun_api.apis }],
      },
      overrides: generatedOverrides({ ...policy, io_allowlist: {} }),
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
      join(scratch, path),
    ],
    { cwd: scratch, timeout: 10_000 },
  );
  const report = jsonOf(Report).safeParse(result.stdout.toString());
  if (!report.success) expect.unreachable(result.stderr.toString());
  expect(report.data.number_of_files).toBe(1);
  return report.data.diagnostics.map((d) => d.code);
}

test("built-in no-sync owns nested sync calls; module-load and async reads remain legal", async () => {
  expect(
    await lint(
      "src/sync.ts",
      "import { readFileSync } from 'node:fs'; export function f() { return readFileSync('p'); }",
    ),
  ).toEqual(["node(no-sync)"]);
  expect(
    await lint(
      "src/startup.ts",
      "import { readFileSync } from 'node:fs'; export const text = readFileSync('p');",
    ),
  ).toEqual([]);
  expect(
    await lint(
      "src/async.ts",
      "import { readFile } from 'node:fs/promises'; export async function f() { return await readFile('p'); }",
    ),
  ).toEqual([]);
});

test.each(["tests/helper.ts", "src/io.test.ts"])(
  "generated test override exempts both rules: %s",
  async (path) => {
    expect(
      await lint(
        path,
        "import { readFileSync } from 'node:fs'; import { createHash } from 'node:crypto'; export function f() { readFileSync('p'); createHash('sha256'); }",
      ),
    ).toEqual([]);
  },
);

test("production neighbour triggers both rules independently", async () => {
  const codes = await lint(
    "src/io.test-helper.ts",
    "import { readFileSync } from 'node:fs'; import { createHash } from 'node:crypto'; export function f() { readFileSync('p'); createHash('sha256'); }",
  );
  expect(codes.toSorted()).toEqual([
    "dotfiles(prefer-bun-api)",
    "node(no-sync)",
  ]);
});
