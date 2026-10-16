import { expect, test } from "bun:test";
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
import {
  loadPolicy,
  loadRepoPolicy,
  renderOxlintrc,
} from "../../scripts/render-oxlintrc.ts";

const ROOT = resolve(import.meta.dir, "../..");

test("first adoption in an export without VCS renders local policy and notices the missing revision", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "preset-unrecorded-export-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(scratch, { recursive: true, force: true }),
  };
  const owner = join(scratch, "owner");
  const consumer = join(scratch, "consumer");
  await mkdir(join(owner, "scripts"), { recursive: true });
  await mkdir(join(owner, "presets/typescript"), { recursive: true });
  await mkdir(consumer);
  const renderer = join(owner, "scripts/render-oxlintrc.ts");
  await cp(join(ROOT, "scripts/render-oxlintrc.ts"), renderer);
  const path = join(owner, "presets/typescript/policy.toml");
  await writeFile(
    path,
    (await readFile(join(ROOT, "presets/typescript/policy.toml"), "utf8")) +
      '\n[[ignore]]\npattern = "export-fixture/**"\nreason = "First adoption fixture"\n',
  );
  for (const dir of ["agents", "node_modules"])
    await symlink(join(ROOT, dir), join(owner, dir));
  expect(await Bun.file(join(owner, ".git")).exists()).toBe(false);
  expect(await Bun.file(join(owner, ".jj")).exists()).toBe(false);
  const base = await loadPolicy(path);
  if (!base.ok) expect.unreachable(base.error);
  const policy = await loadRepoPolicy(consumer, base.value);
  if (!policy.ok) expect.unreachable(policy.error);
  const expected = renderOxlintrc(policy.value);
  for (const flags of [[], ["--check"], ["--write"]]) {
    const child = Bun.spawn(
      [process.execPath, renderer, "--repo", consumer, ...flags],
      {
        cwd: consumer,
        // No VCS binary is available, and inherited consumer Git context is irrelevant.
        env: { ...process.env, PATH: scratch, GIT_DIR: join(consumer, ".git") },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 30_000,
      },
    );
    const [stdout, stderr, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exit, stdout + stderr).toBe(flags.includes("--check") ? 1 : 0);
    expect(stderr.trim()).toBe(
      "render-oxlintrc: no revision recorded; rendering local preset files; run preset sync",
    );
    if (flags.length === 0) expect(stdout).toBe(expected);
    expect(await Bun.file(join(consumer, ".oxlintrc.json")).exists()).toBe(
      flags.includes("--write"),
    );
  }
  expect(await readFile(join(consumer, ".oxlintrc.json"), "utf8")).toBe(
    expected,
  );
  expect(expected).not.toContain('"presetCommit"');
});

test("read-only owner: jj and Git fallback render committed policy from a consumer cwd", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "preset-read-only-"));
  const owner = join(scratch, "owner");
  const consumer = join(scratch, "consumer");
  const bin = join(scratch, "bin");
  const run = async (command: string[], fallback = false) => {
    const child = Bun.spawn(command, {
      cwd: consumer,
      env: {
        ...process.env,
        PWD: consumer,
        PATH: fallback ? `${bin}:${process.env.PATH}` : process.env.PATH,
      },
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
  };
  await mkdir(consumer);
  await using _cleanup = {
    [Symbol.asyncDispose]: async () => {
      await run(["chmod", "-R", "u+w", owner]);
      await rm(scratch, { recursive: true, force: true });
    },
  };
  await mkdir(join(owner, "scripts"), { recursive: true });
  await mkdir(bin);
  await cp(join(ROOT, "presets"), join(owner, "presets"), { recursive: true });
  const renderer = join(owner, "scripts/render-oxlintrc.ts");
  await cp(join(ROOT, "scripts/render-oxlintrc.ts"), renderer);
  for (const dir of ["agents", "node_modules"])
    await symlink(join(ROOT, dir), join(owner, dir));
  const jj = (...args: string[]) =>
    run([
      "jj",
      "--config",
      'user.name="Fixture"',
      "--config",
      'user.email="fixture@example.invalid"',
      "-R",
      owner,
      ...args,
    ]);
  expect((await run(["jj", "git", "init", owner])).exit).toBe(0);
  expect((await jj("commit", "-m", "Committed policy")).exit).toBe(0);
  expect((await jj("bookmark", "create", "alpha", "-r", "@-")).exit).toBe(0);
  const commit = await jj(
    "log",
    "--no-graph",
    "-r",
    "alpha",
    "-T",
    "commit_id",
  );
  expect(commit.exit).toBe(0);
  expect(
    (
      await run([
        process.execPath,
        join(owner, "presets/src/cli.ts"),
        "sync",
        "typescript",
        "--to",
        consumer,
      ])
    ).exit,
  ).toBe(0);
  const expected = await readFile(join(consumer, ".oxlintrc.json"), "utf8");
  // A malformed working-copy policy must never enter either committed read path.
  await writeFile(
    join(owner, "presets/typescript/policy.toml"),
    "invalid TOML [",
  );
  await writeFile(join(bin, "jj"), "#!/bin/sh\nexit 2\n", { mode: 0o755 });
  expect((await run(["chmod", "-R", "a-w", owner])).exit).toBe(0);
  const fromJj = await run([
    "jj",
    "--ignore-working-copy",
    "--at-operation",
    "@",
    "-R",
    owner,
    "file",
    "show",
    "-r",
    commit.stdout,
    "root:presets/typescript/policy.toml",
  ]);
  expect(fromJj.exit, fromJj.stderr).toBe(0);
  const fromGit = await run([
    "git",
    "--no-optional-locks",
    "-C",
    owner,
    "show",
    `${commit.stdout}:presets/typescript/policy.toml`,
  ]);
  expect(fromGit.exit, fromGit.stderr).toBe(0);
  expect(fromGit.stdout).toBe(fromJj.stdout);
  for (const fallback of [false, true]) {
    const check = await run(
      [process.execPath, renderer, "--repo", consumer, "--check"],
      fallback,
    );
    expect(check.exit, check.stdout + check.stderr).toBe(0);
    const sync = await run(
      [
        process.execPath,
        join(owner, "presets/src/cli.ts"),
        "sync",
        "typescript",
        "--to",
        consumer,
      ],
      fallback,
    );
    expect(sync.exit, sync.stdout + sync.stderr).toBe(0);
    expect(await readFile(join(consumer, ".oxlintrc.json"), "utf8")).toBe(
      expected,
    );
  }
}, 60_000);
