import { afterAll, expect, test } from "bun:test";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";
import {
  loadPolicy,
  loadRepoPolicy,
  renderOxlintrc,
} from "../../scripts/render-oxlintrc.ts";

const ROOT = resolve(import.meta.dir, "../..");
const scratch = await mkdtemp(join(tmpdir(), "preset-react-"));
const bin = join(scratch, "bin");
await mkdir(bin);
await symlink(process.execPath, join(bin, "bun"));
afterAll(() => rm(scratch, { recursive: true, force: true }));

const Config = z.looseObject({
  plugins: z.array(z.string()),
  overrides: z.array(
    z.looseObject({
      files: z.array(z.string()),
      plugins: z.array(z.string()).optional(),
      rules: z.record(z.string(), z.unknown()),
    }),
  ),
});
const Report = z.looseObject({
  diagnostics: z.array(
    z.looseObject({ code: z.string(), filename: z.string() }),
  ),
  number_of_files: z.number(),
});

async function run(cwd: string, ...args: string[]) {
  const child = Bun.spawn([process.execPath, ...args], {
    cwd,
    env: { ...process.env, PATH: bin },
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

async function render(repo: string) {
  const base = await loadPolicy();
  if (!base.ok) return expect.unreachable(base.error);
  const local = await loadRepoPolicy(repo, base.value);
  if (!local.ok) return expect.unreachable(local.error);
  const text = renderOxlintrc(local.value);
  await writeFile(join(repo, ".oxlintrc.json"), text);
  return text;
}

test("React declaration scopes real hook diagnostics and absence preserves the base render", async () => {
  const repo = await mkdtemp(join(scratch, "consumer-"));
  const applied = await run(
    repo,
    join(ROOT, "presets/src/cli.ts"),
    "apply",
    "typescript",
    "--to",
    repo,
  );
  expect(applied.exit).toBe(0);
  await symlink(join(ROOT, "node_modules"), join(repo, "node_modules"));
  const original = await render(repo);
  const localPath = join(repo, "oxlint-policy.local.toml");
  await writeFile(localPath, "schema = 1\nignore = []\nreact = []\n");
  expect(await render(repo)).toBe(original);
  await writeFile(
    localPath,
    'schema = 1\nignore = []\nreact = ["ts/heritage-react/**"]\n',
  );
  const config = jsonOf(Config).safeParse(await render(repo));
  if (!config.success) expect.unreachable(config.error.message);
  expect(config.data.plugins).not.toContain("react");
  const overrides = config.data.overrides.filter(
    (item) => item.plugins?.includes("react") ?? false,
  );
  expect(overrides).toHaveLength(1);
  expect(overrides[0]?.files).toEqual(["ts/heritage-react/**"]);
  expect(overrides[0]?.plugins).toEqual([...config.data.plugins, "react"]);
  expect(overrides[0]?.rules).toEqual({
    "react/rules-of-hooks": "error",
    "react/exhaustive-deps": "error",
    "react/hooks": "off",
    "react/exhaustive-effect-dependencies": "off",
  });
  const source = `import { useState, useEffect } from "react";
export function Bad({ enabled, value }: { enabled: boolean; value: string }) {
  if (enabled) useState(0);
  useEffect(() => { console.log(value); }, []);
  return null;
}
`;
  for (const pkg of ["heritage-react", "ordinary"]) {
    await mkdir(join(repo, "ts", pkg), { recursive: true });
    await writeFile(join(repo, "ts", pkg, "bad.tsx"), source);
  }
  expect(Bun.which("node", { PATH: bin })).toBeNull();
  // Probe the reported non-interactive launch path and retain its actual outcome.
  const legacy = await run(
    repo,
    "x",
    "--no-install",
    "oxlint",
    "--format=json",
    "ts",
  );
  process.stdout.write(
    `legacy oxlint without node: exit ${legacy.exit}, stdout ${legacy.stdout.length} bytes, stderr ${legacy.stderr.length} bytes\n`,
  );
  const result = await run(repo, "lint-oxlint.ts", "ts");
  expect(result.exit).toBe(1);
  const report = jsonOf(Report).safeParse(
    result.stdout.split("\nlint-oxlint:")[0],
  );
  if (!report.success) expect.unreachable(`${result.stderr}\n${result.stdout}`);
  expect(report.data.number_of_files).toBe(2);
  for (const rule of ["rules-of-hooks", "exhaustive-deps"]) {
    const hits = report.data.diagnostics.filter((item) =>
      item.code.includes(rule),
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((item) => item.filename.includes("heritage-react"))).toBe(
      true,
    );
  }
  expect(
    report.data.diagnostics.some(
      (item) =>
        item.filename.includes("ordinary") && item.code.startsWith("react"),
    ),
  ).toBe(false);
  await rm(localPath);
  expect(await render(repo)).toBe(original);
  const clean = await run(repo, "lint-oxlint.ts", "ts");
  expect(clean.exit).toBe(0);
  expect(clean.stdout).toContain("checked 2 file(s)");
  expect(clean.stdout).not.toContain("react(");
}, 60_000);

test("lint runner fails loudly for silent exit 0, invalid reports, and zero files", async () => {
  const repo = await mkdtemp(join(scratch, "silent-"));
  await cp(
    join(ROOT, "presets/typescript/lint-oxlint.ts"),
    join(repo, "lint-oxlint.ts"),
  );
  // The fixture codec resolves its pinned dependencies through this link.
  await symlink(join(ROOT, "presets/typescript/zod.ts"), join(repo, "zod.ts"));
  await mkdir(join(repo, "node_modules/.bin"), { recursive: true });
  await symlink(
    join(ROOT, "node_modules/cleye"),
    join(repo, "node_modules/cleye"),
  );
  const fake = join(repo, "node_modules/.bin/oxlint");
  for (const output of [
    "",
    "not json",
    '{"diagnostics":[],"number_of_files":0}',
  ]) {
    await writeFile(
      fake,
      `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(output)});\n`,
    );
    await chmod(fake, 0o755);
    const result = await run(repo, "lint-oxlint.ts", "input.ts");
    expect(result.exit).toBe(2);
    expect(result.stderr).toContain("FATAL");
    expect(result.stderr).toContain("oxlint exited 0");
    expect(result.stderr).toContain("without a valid nonempty JSON report");
  }
  expect((await run(repo, "lint-oxlint.ts", "--help")).stdout).toContain(
    "USAGE",
  );
  for (const flag of ["--unknown", "--__proto__"])
    expect((await run(repo, "lint-oxlint.ts", flag)).exit).not.toBe(0);
}, 60_000);
