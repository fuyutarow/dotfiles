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

const root = resolve(import.meta.dir, "../..");
test("preset jj commit lints exactly selected TS files and refuses violations", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "preset-lint-candidate-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(scratch, { recursive: true, force: true }),
  };
  {
    const repo = join(scratch, "repo");
    const bin = join(scratch, "bin");
    await mkdir(repo);
    await mkdir(bin);
    await symlink(
      join(
        root,
        "agents/skills/wiring-mise-tasks/scripts/lint-ts-candidate.ts",
      ),
      join(bin, "lint-ts-candidate"),
    );
    await writeFile(join(bin, "git"), "#!/bin/sh\nexit 99\n", { mode: 0o755 });
    const config = join(scratch, "jj.toml");
    await writeFile(
      config,
      '[user]\nname="Fixture"\nemail="fixture@example.invalid"\n[signing]\nbehavior="drop"\n',
    );
    const env = {
      ...process.env,
      HOME: scratch,
      XDG_CONFIG_HOME: join(scratch, "config"),
      MISE_STATE_DIR: join(scratch, "mise-state"),
      JJ_CONFIG: config,
      PATH: `${bin}:${process.env.PATH}`,
      MISE_TRUSTED_CONFIG_PATHS: repo,
      MISE_GLOBAL_CONFIG_FILE: join(scratch, "no-global.toml"),
      PRECOMMIT_VCS: undefined,
      PRECOMMIT_REV: undefined,
      PRECOMMIT_BASE: undefined,
      PRECOMMIT_PATHS_FILE: undefined,
    };
    const run = async (args: string[]) => {
      const child = Bun.spawn(args, {
        cwd: repo,
        env,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 120_000,
      });
      const [out, err, exit] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return { out, err, exit };
    };
    const template = await readFile(
      join(root, "presets/typescript/mise-tasks.toml"),
      "utf8",
    );
    expect(template).toContain('run = "lint-ts-candidate"');
    expect(template).not.toMatch(/git diff|\$\(|\bif\s/u);
    await writeFile(
      join(repo, "mise.toml"),
      `[tools]\nbun = "1.4"\n${template}\n[tasks.commit]\nrun = ${JSON.stringify(`bun ${root}/agents/skills/wiring-mise-tasks/scripts/jj-commit.ts`)}\n[tasks."hook:pre-commit"]\ndepends = ["lint:ts"]\n`,
    );
    await writeFile(
      join(repo, "mise.toml"),
      (await readFile(join(repo, "mise.toml"), "utf8")) +
        [
          "f",
          "fmt",
          "fmt:check",
          "fmt:staged",
          "lint",
          "test",
          "up",
          "pull",
          "push",
        ]
          .map((name) => `\n[tasks."${name}"]\nrun = "true"\n`)
          .join("") +
        `\n[tasks.check]\ndepends = ["lint"]\n`,
    );
    await cp(
      join(root, "presets/typescript/lint-oxlint.ts"),
      join(repo, "lint-oxlint.ts"),
    );
    await cp(join(root, "presets/typescript/zod.ts"), join(repo, "zod.ts"));
    await symlink(join(root, "node_modules"), join(repo, "node_modules"));
    await writeFile(
      join(repo, ".oxlintrc.json"),
      JSON.stringify({ rules: { "no-debugger": "error" } }),
    );
    await writeFile(
      join(repo, "tsconfig.json"),
      '{"compilerOptions":{"strict":true},"include":["*.ts"]}',
    );
    await writeFile(join(repo, ".gitignore"), "node_modules\n");
    await writeFile(join(repo, "selected.ts"), "export const value = 1;\n");
    await writeFile(join(repo, "other.ts"), "export const other = 1;\n");
    expect((await run(["jj", "git", "init", "--no-colocate"])).exit).toBe(0);
    expect((await run(["jj", "commit", "-m", "base"])).exit).toBe(0);
    const contract = await run([
      process.execPath,
      join(root, "agents/skills/wiring-mise-tasks/scripts/mise-contract.ts"),
      repo,
    ]);
    expect(contract.exit, contract.out + contract.err).toBe(0);
    await writeFile(join(repo, "selected.ts"), "export const value = 2;\n");
    await writeFile(join(repo, "other.ts"), "debugger;\n");
    const commit = [
      "mise",
      "run",
      "commit",
      "--",
      "-m",
      "selected",
      "--",
      "selected.ts",
    ];
    const good = await run(commit);
    expect(good.exit, good.out + good.err).toBe(0);
    expect(good.out).toContain("checked 1 file(s)");
    await writeFile(join(repo, ".oxlintrc.json"), "{}");
    await writeFile(join(repo, "selected.ts"), "debugger;\n");
    const bad = await run(commit);
    expect(bad.exit, bad.out + bad.err).toBe(1);
    expect(bad.out + bad.err).toContain("no-debugger");
    await writeFile(join(repo, "note.txt"), "non-TypeScript candidate\n");
    const skipped = await run([...commit.slice(0, -1), "note.txt"]);
    expect(skipped.exit, skipped.out + skipped.err).toBe(0);
    expect(skipped.out).toContain("no candidate .ts/.tsx files");
    await rm(join(repo, "selected.ts"));
    const deleted = await run(commit);
    expect(deleted.exit, deleted.out + deleted.err).toBe(0);
    expect(deleted.out).toContain("no candidate .ts/.tsx files");
  }
}, 120_000);

test("candidate bin exposes help and rejects unknown flags and positionals", async () => {
  const script = join(
    root,
    "agents/skills/wiring-mise-tasks/scripts/lint-ts-candidate.ts",
  );
  for (const [argument, expected] of [
    ["--help", 0],
    ["--unknown", 1],
    ["--__proto__", 2],
    ["unexpected.ts", 2],
  ] satisfies [string, number][]) {
    const child = Bun.spawn([process.execPath, script, argument], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10_000,
    });
    const [out, err, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exit, out + err).toBe(expected);
  }
});
