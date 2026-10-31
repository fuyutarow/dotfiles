import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";

const ROOT = resolve(import.meta.dir, "../..");
const scratch = await mkdtemp(join(tmpdir(), "preset-consumer-types-"));
afterAll(() => rm(scratch, { recursive: true, force: true }));

async function run(cwd: string, ...cmd: string[]) {
  const child = Bun.spawn(cmd, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  });
  const [out, err, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { out, err, exit };
}

// Firedancer's trunk selects launcher/scripts/package TS and excludes root entrypoints.
// The consumer gate preserves these globs while copying the standard preset to its root.
const consumerConfig = {
  compilerOptions: {
    target: "ESNext",
    lib: ["ESNext"],
    module: "ESNext",
    moduleResolution: "bundler",
    types: ["bun"],
    noEmit: true,
    allowImportingTsExtensions: true,
    strict: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    exactOptionalPropertyTypes: true,
    noUncheckedIndexedAccess: true,
    noImplicitOverride: true,
    noFallthroughCasesInSwitch: true,
    skipLibCheck: true,
  },
  include: [
    ".agents/hooks/**/*.ts",
    "launcher/**/*.ts",
    "scripts/**/*.ts",
    "packages/*/scripts/**/*.ts",
    "packages/*/test/**/*.ts",
  ],
  exclude: ["node_modules", "research_record", "archives"],
};
const Report = jsonOf(
  z.looseObject({
    diagnostics: z.array(z.unknown()),
    number_of_files: z.number(),
  }),
);

test("delivered runner retains its types with a consumer's own narrow include globs", async () => {
  const repo = await mkdtemp(join(scratch, "consumer-"));
  const applied = await run(
    scratch,
    process.execPath,
    join(ROOT, "standard-presets/src/cli.ts"),
    "apply",
    "typescript",
    "--to",
    repo,
  );
  expect(applied.exit, applied.err).toBe(0);
  await symlink(join(ROOT, "node_modules"), join(repo, "node_modules"));
  await mkdir(join(repo, "scripts"));
  await writeFile(join(repo, "scripts/keep.ts"), "export const keep = 1;\n");
  const configText = JSON.stringify(consumerConfig, null, 2) + "\n";
  await writeFile(join(repo, "tsconfig.json"), configText);

  // Match firedancer's selected-file invocation before anything imports the root runner.
  const lint = await run(
    repo,
    "bunx",
    "--bun",
    "--no-install",
    "oxlint",
    "--type-aware",
    "--format=json",
    "tools/lint-oxlint.ts",
  );
  expect(lint.exit, lint.out + lint.err).toBe(0);
  const report = Report.safeParse(lint.out);
  if (!report.success) expect.unreachable(report.error.message);
  expect(report.data.number_of_files).toBe(1);
  expect(report.data.diagnostics).toEqual([]);

  // Also make the compiler check the delivered file as a dependency of the consumer's
  // own included source, without broadening or replacing that consumer's tsconfig.
  await writeFile(
    join(repo, "scripts/use-runner.ts"),
    'import "../tools/lint-oxlint.ts";\n',
  );
  const checked = await run(repo, "bun", "check", "--project", "tsconfig.json");
  expect(checked.exit, checked.out + checked.err).toBe(0);
  expect(await Bun.file(join(repo, "tsconfig.json")).text()).toBe(configText);
}, 60_000);
