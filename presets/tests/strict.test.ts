import { afterAll, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";

const ROOT = resolve(import.meta.dir, "../..");
const scratch = await mkdtemp(join(tmpdir(), "preset-strict-"));
afterAll(() => rm(scratch, { recursive: true, force: true }));
const Config = z.looseObject({
  rules: z.record(z.string(), z.unknown()),
  overrides: z.array(
    z.looseObject({ rules: z.record(z.string(), z.unknown()) }),
  ),
});
const Report = z.looseObject({
  number_of_files: z.number(),
  diagnostics: z.array(
    z.looseObject({ code: z.string(), filename: z.string() }),
  ),
});

async function run(cwd: string, ...args: string[]) {
  const child = Bun.spawn([process.execPath, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exit };
}

test("strict rules are errors in dotfiles and reject assertions and suppression comments", async () => {
  const root = jsonOf(Config).safeParse(
    await readFile(join(ROOT, ".oxlintrc.json"), "utf8"),
  );
  if (!root.success) expect.unreachable(root.error.message);
  expect(root.data.rules["typescript/no-non-null-assertion"]).toBe("error");
  expect(root.data.rules["typescript/ban-ts-comment"]).toEqual([
    "error",
    {
      "ts-expect-error": true,
      "ts-ignore": true,
      "ts-nocheck": true,
      "ts-check": false,
    },
  ]);
  const repo = await mkdtemp(join(scratch, "strict-"));
  expect(
    (
      await run(
        repo,
        join(ROOT, "presets/src/cli.ts"),
        "apply",
        "typescript",
        "--to",
        repo,
      )
    ).exit,
  ).toBe(0);
  await symlink(join(ROOT, "node_modules"), join(repo, "node_modules"));
  for (const [name, source, rule] of [
    [
      "assertion",
      "export const get = (v?: string) => v!;\n",
      "no-non-null-assertion",
    ],
    [
      "expect",
      "// @ts-expect-error\nexport const n: number = 'text';\n",
      "ban-ts-comment",
    ],
    [
      "ignore",
      "// @ts-ignore\nexport const n: number = 'text';\n",
      "ban-ts-comment",
    ],
    [
      "nocheck",
      "// @ts-nocheck\nexport const n: number = 'text';\n",
      "ban-ts-comment",
    ],
    [
      "good",
      "export const get = (v?: string) => v ?? 'fallback';\n",
      undefined,
    ],
  ]) {
    const file = `${name}.ts`;
    await writeFile(join(repo, file), source ?? "");
    const result = await run(
      repo,
      "x",
      "--bun",
      "--no-install",
      "oxlint",
      "--format=json",
      file,
    );
    const report = jsonOf(Report).safeParse(result.stdout);
    if (!report.success)
      expect.unreachable(`${result.stderr}\n${result.stdout}`);
    expect(report.data.number_of_files).toBe(1);
    expect(result.exit).toBe(rule === undefined ? 0 : 1);
    if (rule !== undefined)
      expect(
        report.data.diagnostics.some((item) => item.code.includes(rule)),
      ).toBe(true);
  }
}, 60_000);

test("local rules strengthen all file scopes and refusal names the rule without writes", async () => {
  const repo = await mkdtemp(join(scratch, "local-"));
  const local = join(repo, "oxlint-policy.local.toml");
  const declaration =
    'schema = 1\nignore = []\nreact = ["react/**"]\n[rules]\n"node/no-sync" = "error"\n"eslint/no-console" = "error"\n';
  await writeFile(local, declaration);
  const apply = await run(
    repo,
    join(ROOT, "presets/src/cli.ts"),
    "apply",
    "typescript",
    "--to",
    repo,
  );
  expect(apply.exit).toBe(0);
  expect(await readFile(local, "utf8")).toBe(declaration);
  const configPath = join(repo, ".oxlintrc.json");
  const original = await readFile(configPath, "utf8");
  const config = jsonOf(Config).safeParse(original);
  if (!config.success) expect.unreachable(config.error.message);
  expect(config.data.rules["node/no-sync"]).toEqual([
    "error",
    { allowAtRootLevel: true },
  ]);
  expect(config.data.rules["eslint/no-console"]).toBe("error");
  expect(
    config.data.overrides.every(
      (entry) => entry.rules["node/no-sync"] === "error",
    ),
  ).toBe(true);
  await symlink(join(ROOT, "node_modules"), join(repo, "node_modules"));
  const paths = ["ordinary.ts", "tests/input.ts", "react/input.ts"];
  for (const file of paths) {
    await mkdir(join(repo, file, ".."), { recursive: true });
    await writeFile(
      join(repo, file),
      'import { readFileSync } from "node:fs";\nexport function read() { return readFileSync("input", "utf8"); }\n',
    );
  }
  const lint = await run(
    repo,
    "x",
    "--bun",
    "--no-install",
    "oxlint",
    "--format=json",
    ...paths,
  );
  const report = jsonOf(Report).safeParse(lint.stdout);
  if (!report.success) expect.unreachable(`${lint.stderr}\n${lint.stdout}`);
  expect(lint.exit).toBe(1);
  expect(report.data.number_of_files).toBe(3);
  expect(
    report.data.diagnostics.filter((item) => item.code.includes("no-sync")),
  ).toHaveLength(3);
  for (const rule of [
    "typescript/no-non-null-assertion",
    "typescript/ban-ts-comment",
    "eslint-js/no-restricted-syntax",
    "typescript/no-unsafe-assignment",
    "react/rules-of-hooks",
  ]) {
    await writeFile(
      local,
      `schema = 1\nignore = []\nreact = ["react/**"]\n[rules]\n"${rule}" = "off"\n`,
    );
    const refused = await run(
      repo,
      join(ROOT, "scripts/render-oxlintrc.ts"),
      "--repo",
      repo,
      "--write",
    );
    expect(refused.exit).toBe(2);
    expect(refused.stderr).toContain(rule);
    expect(await readFile(configPath, "utf8")).toBe(original);
  }
}, 60_000);
