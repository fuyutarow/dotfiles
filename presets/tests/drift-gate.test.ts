import { afterAll, expect, test } from "bun:test";
import {
  cp,
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
const scratch = await mkdtemp(join(tmpdir(), "preset-drift-gate-"));
afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

async function run(cwd: string, ...cmd: string[]) {
  const child = Bun.spawn(cmd, {
    cwd,
    env: { ...process.env, MISE_TRUSTED_CONFIG_PATHS: scratch },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exit };
}
const Metadata = jsonOf(
  z.looseObject({
    settings: z.looseObject({
      dotfiles: z.looseObject({ presetRevision: z.string() }),
    }),
  }),
);
async function revision(repo: string) {
  const parsed = Metadata.safeParse(
    await readFile(join(repo, ".oxlintrc.json"), "utf8"),
  );
  if (!parsed.success) return expect.unreachable(parsed.error.message);
  return parsed.data.settings.dotfiles.presetRevision;
}

test("PRESET-RENDER-REV: dirty owner and alpha moves preserve recorded checks; sync uses committed alpha", async () => {
  const owner = join(scratch, "owner");
  const consumer = join(scratch, "consumer");
  await mkdir(join(owner, "scripts"), { recursive: true });
  await mkdir(consumer);
  await cp(join(ROOT, "presets"), join(owner, "presets"), { recursive: true });
  await cp(
    join(ROOT, "scripts/render-oxlintrc.ts"),
    join(owner, "scripts/render-oxlintrc.ts"),
  );
  for (const dir of ["node_modules", "agents"])
    await symlink(join(ROOT, dir), join(owner, dir));
  const jj = (...args: string[]) =>
    run(
      owner,
      "jj",
      "--config",
      'user.name="Fixture"',
      "--config",
      'user.email="fixture@example.invalid"',
      ...args,
    );
  expect((await jj("git", "init")).exit).toBe(0);
  expect((await jj("commit", "-m", "Policy A")).exit).toBe(0);
  expect((await jj("bookmark", "create", "alpha", "-r", "@-")).exit).toBe(0);
  const cli = join(owner, "presets/src/cli.ts");
  const preset = (...args: string[]) =>
    run(owner, process.execPath, cli, ...args);
  expect((await preset("apply", "typescript", "--to", consumer)).exit).toBe(0);
  const revA = await revision(consumer);
  const template = await readFile(join(consumer, "mise-tasks.toml"), "utf8");
  const tasks = Bun.TOML.parse(template);
  expect(tasks).toMatchObject({
    tasks: {
      lint: { depends: ["lint:ts"] },
      check: { depends: ["lint", "typecheck", "lint:oxlint-policy"] },
    },
  });
  // Real template aggregates and drift task; neutral leaf tasks isolate preset drift
  // from formatter, index and compiler setup in this otherwise empty consumer.
  const materialized =
    template.replaceAll("~/dotfiles", owner) +
    '\n[tasks."fmt:staged"]\nrun = "true"\n';
  await writeFile(join(consumer, "mise.toml"), materialized);
  const mise = (...args: string[]) => run(consumer, "mise", "run", ...args);
  // Override only environment-dependent leaves through a separate included config.
  await writeFile(
    join(consumer, "mise.local.toml"),
    '[tasks."lint:ts"]\nrun = "true"\n[tasks.typecheck]\nrun = "true"\n',
  );
  expect((await mise("hook:pre-commit")).exit).toBe(0);
  expect((await mise("check")).exit).toBe(0);
  const policyPath = join(owner, "presets/typescript/policy.toml");
  // Change an actual rule so this is a semantic revision, not just a comment.
  await writeFile(
    policyPath,
    (await readFile(policyPath, "utf8")) +
      '\n[[on]]\nrule = "eslint/no-alert"\nreason = "Revision B fixture"\n',
  );
  expect((await mise("hook:pre-commit")).exit).toBe(0);
  expect((await mise("check")).exit).toBe(0);
  const previousDirty = await readFile(
    join(consumer, ".oxlintrc.json"),
    "utf8",
  );
  expect((await preset("sync", "typescript", "--to", consumer)).exit).toBe(0);
  expect(await readFile(join(consumer, ".oxlintrc.json"), "utf8")).toBe(
    previousDirty,
  );
  expect((await jj("commit", "-m", "Policy B")).exit).toBe(0);
  expect((await jj("bookmark", "set", "alpha", "-r", "@-")).exit).toBe(0);
  expect((await mise("check")).exit).toBe(0);
  // An invalid working-copy policy cannot affect either committed read path.
  await writeFile(policyPath, "invalid TOML [");
  expect((await mise("check")).exit).toBe(0);
  const packagePath = join(consumer, "package.json");
  await writeFile(packagePath, '{"name":"consumer-customized"}\n');
  const previous = await readFile(join(consumer, ".oxlintrc.json"), "utf8");
  expect(
    (await preset("sync", "typescript", "--to", consumer, "--dry-run")).exit,
  ).toBe(0);
  expect(await readFile(join(consumer, ".oxlintrc.json"), "utf8")).toBe(
    previous,
  );
  expect((await preset("sync", "typescript", "--to", consumer)).exit).toBe(0);
  const revB = await revision(consumer);
  expect(revB).not.toBe(revA);
  expect(await readFile(join(consumer, ".oxlintrc.json"), "utf8")).toContain(
    "eslint/no-alert",
  );
  expect(await readFile(packagePath, "utf8")).toBe(
    '{"name":"consumer-customized"}\n',
  );
  expect((await mise("check")).exit).toBe(0);
  const renderedB = await readFile(join(consumer, ".oxlintrc.json"), "utf8");
  expect(renderedB).toMatch(/"presetCommit": "[a-f0-9]{40}"/u);
  await writeFile(
    join(consumer, ".oxlintrc.json"),
    renderedB.replace(/,\n\s*"presetCommit": "[a-f0-9]+"/u, ""),
  );
  const legacy = await mise("check");
  expect(legacy.exit).toBe(0);
  expect(legacy.stdout + legacy.stderr).toContain(
    "rendered from an unrecorded revision; run preset sync",
  );
  const legacyBytes = await readFile(join(consumer, ".oxlintrc.json"), "utf8");
  for (const flags of [[], ["--write"], ["--check"]]) {
    const result = await run(
      owner,
      process.execPath,
      join(owner, "scripts/render-oxlintrc.ts"),
      "--repo",
      consumer,
      ...flags,
    );
    expect(result.exit).toBe(0);
    expect(result.stdout).toContain(
      "rendered from an unrecorded revision; run preset sync",
    );
    expect(await readFile(join(consumer, ".oxlintrc.json"), "utf8")).toBe(
      legacyBytes,
    );
  }
  expect((await preset("sync", "typescript", "--to", consumer)).exit).toBe(0);
  expect(await readFile(join(consumer, ".oxlintrc.json"), "utf8")).toBe(
    renderedB,
  );
  const edited = renderedB.replace(
    '"eslint/no-alert": "error"',
    '"eslint/no-alert": "off"',
  );
  expect(edited).not.toBe(renderedB);
  await writeFile(join(consumer, ".oxlintrc.json"), edited);
  expect((await mise("check")).exit).not.toBe(0);
  await writeFile(join(consumer, ".oxlintrc.json"), renderedB);
  await writeFile(
    join(consumer, ".oxlintrc.json"),
    renderedB.replace(
      /"presetCommit": "[a-f0-9]+"/u,
      '"presetCommit": "' + "f".repeat(40) + '"',
    ),
  );
  const unavailable = await mise("check");
  expect(unavailable.exit).not.toBe(0);
  expect(unavailable.stdout + unavailable.stderr).toContain(
    "cannot read presets/typescript/policy.toml",
  );
  await writeFile(join(consumer, ".oxlintrc.json"), renderedB);
  // Oxlint itself accepts the provenance settings and actually checks a clean file.
  await symlink(join(ROOT, "node_modules"), join(consumer, "node_modules"));
  await writeFile(join(consumer, "clean.ts"), "export const value = 1;\n");
  const lint = await run(
    consumer,
    "bunx",
    "--bun",
    "oxlint",
    "--format",
    "json",
    "clean.ts",
  );
  expect(lint.exit).toBe(0);
  expect(lint.stdout).toContain('"number_of_files": 1');
}, 60_000);

const TaskGraph = z.looseObject({
  tasks: z.record(
    z.string(),
    z.looseObject({ depends: z.array(z.string()).optional() }),
  ),
});
test("dotfiles and consumer commit gates cannot reach preset drift checks", async () => {
  for (const path of ["mise.toml", "presets/typescript/mise-tasks.toml"]) {
    const parsed = TaskGraph.safeParse(
      Bun.TOML.parse(await readFile(join(ROOT, path), "utf8")),
    );
    if (!parsed.success) expect.unreachable(parsed.error.message);
    const tasks = parsed.data.tasks;
    const reachable = (name: string, seen = new Set<string>()): Set<string> => {
      if (seen.has(name)) return seen;
      seen.add(name);
      for (const dependency of tasks[name]?.depends ?? [])
        reachable(dependency, seen);
      return seen;
    };
    expect(reachable("hook:pre-commit").has("lint:oxlint-policy")).toBe(false);
    expect(reachable("lint").has("lint:oxlint-policy")).toBe(false);
    expect(tasks["check"]?.depends).toContain("lint:oxlint-policy");
  }
});
