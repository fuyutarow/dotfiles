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
test.each([".", "tools"])(
  "preset jj commit lints exactly selected TS files in %s and refuses violations",
  async (directory) => {
    const scratch = await mkdtemp(join(tmpdir(), "preset-lint-candidate-"));
    await using _cleanup = {
      [Symbol.asyncDispose]: () =>
        rm(scratch, { recursive: true, force: true }),
    };
    {
      const repo = join(scratch, "repo");
      const bin = join(scratch, "bin");
      const toolchain = join(repo, directory);
      const selectedPath =
        directory === "." ? "selected.ts" : directory + "/selected.ts";
      await mkdir(repo);
      await mkdir(bin);
      await mkdir(toolchain, { recursive: true });
      await symlink(
        join(
          root,
          "agents/skills/wiring-mise-tasks/scripts/lint-ts-candidate.ts",
        ),
        join(bin, "lint-ts-candidate"),
      );
      await writeFile(join(bin, "git"), "#!/bin/sh\nexit 99\n", {
        mode: 0o755,
      });
      const config = join(scratch, "jj.toml");
      await writeFile(
        config,
        '[user]\nname="Fixture"\nemail="fixture@example.invalid"\n[signing]\nbehavior="drop"\n',
      );
      const env = {
        ...process.env,
        HOME: scratch,
        XDG_CONFIG_HOME: join(scratch, "config"),
        MISE_CEILING_PATHS: scratch,
        MISE_STATE_DIR: join(scratch, "mise-state"),
        JJ_CONFIG: config,
        PATH: `${bin}:${process.env["PATH"]}`,
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
      const fixtureTemplate = template.replace(
        'depends = ["fmt:staged", "lint"]',
        'depends = ["lint:ts"]',
      );
      const tasks =
        directory === "."
          ? fixtureTemplate
          : fixtureTemplate.replace(
              'run = "lint-ts-candidate"',
              'run = "lint-ts-candidate --dir ./tools/"',
            );
      expect(template).not.toMatch(/git diff|\$\(|\bif\s/u);
      const bunPin = (await readFile(join(root, "mise.toml"), "utf8")).match(
        /^bun = ("[^"]+")$/mu,
      )?.[1];
      expect(bunPin).toBeDefined();
      await writeFile(
        join(repo, "mise.toml"),
        `[tools]\nbun = ${bunPin}\n${tasks}\n[tasks.commit]\nrun = ${JSON.stringify(`bun ${root}/agents/skills/wiring-mise-tasks/scripts/jj-commit.ts`)}\n`,
      );
      await writeFile(
        join(repo, "mise.toml"),
        (await readFile(join(repo, "mise.toml"), "utf8")) +
          ["f", "fmt", "fmt:check", "fmt:staged", "test", "up", "pull", "push"]
            .map((name) => `\n[tasks."${name}"]\nrun = "true"\n`)
            .join(""),
      );
      await cp(
        join(root, "presets/typescript/lint-oxlint.ts"),
        join(toolchain, "lint-oxlint.ts"),
      );
      await cp(
        join(root, "presets/typescript/zod.ts"),
        join(toolchain, "zod.ts"),
      );
      await cp(
        join(root, "presets/typescript/package.json"),
        join(toolchain, "package.json"),
      );
      await symlink(
        join(root, "node_modules"),
        join(toolchain, "node_modules"),
      );
      await writeFile(
        join(toolchain, ".oxlintrc.json"),
        JSON.stringify({ rules: { "no-debugger": "error" } }),
      );
      await writeFile(
        join(toolchain, "tsconfig.json"),
        '{"compilerOptions":{"strict":true},"include":["*.ts"]}',
      );
      await writeFile(join(repo, ".gitignore"), "node_modules\n");
      await writeFile(
        join(toolchain, "selected.ts"),
        "export const value = 1;\n",
      );
      await writeFile(join(toolchain, "other.ts"), "export const other = 1;\n");
      expect((await run(["jj", "git", "init", "--no-colocate"])).exit).toBe(0);
      expect((await run(["jj", "commit", "-m", "base"])).exit).toBe(0);
      const contract = await run([
        process.execPath,
        join(root, "agents/skills/wiring-mise-tasks/scripts/mise-contract.ts"),
        repo,
      ]);
      expect(contract.exit, contract.out + contract.err).toBe(0);
      await writeFile(
        join(toolchain, "selected.ts"),
        "export const value = 2;\n",
      );
      await writeFile(join(toolchain, "other.ts"), "debugger;\n");
      const commit = [
        "mise",
        "run",
        "commit",
        "--",
        "-m",
        "selected",
        "--",
        selectedPath,
      ];
      if (directory !== ".") {
        await mkdir(join(repo, "tools-extra"));
        await writeFile(join(repo, "outside.ts"), "debugger;\n");
        await writeFile(join(repo, "tools-extra/outside.ts"), "debugger;\n");
      }
      const good = await run(
        directory === "."
          ? commit
          : [...commit, "outside.ts", "tools-extra/outside.ts"],
      );
      expect(good.exit, good.out + good.err).toBe(0);
      expect(good.out).toContain("checked 1 file(s)");
      if (directory !== ".") {
        await writeFile(join(repo, "outside.ts"), "debugger; debugger;\n");
        const outside = await run([...commit.slice(0, -1), "outside.ts"]);
        expect(outside.exit, outside.out + outside.err).toBe(0);
        expect(outside.out).toContain("no candidate .ts/.tsx files");
      }
      await writeFile(join(toolchain, ".oxlintrc.json"), "{}");
      await writeFile(join(toolchain, "selected.ts"), "debugger;\n");
      const bad = await run(commit);
      expect(bad.exit, bad.out + bad.err).toBe(1);
      expect(bad.out + bad.err).toContain("no-debugger");
      await writeFile(join(repo, "note.txt"), "non-TypeScript candidate\n");
      const skipped = await run([...commit.slice(0, -1), "note.txt"]);
      expect(skipped.exit, skipped.out + skipped.err).toBe(0);
      expect(skipped.out).toContain("no candidate .ts/.tsx files");
      await rm(join(toolchain, "selected.ts"));
      const deleted = await run(commit);
      expect(deleted.exit, deleted.out + deleted.err).toBe(0);
      expect(deleted.out).toContain("no candidate .ts/.tsx files");
    }
  },
  120_000,
);

test("candidate bin exposes help and rejects unknown flags and positionals", async () => {
  const script = join(
    root,
    "agents/skills/wiring-mise-tasks/scripts/lint-ts-candidate.ts",
  );
  for (const [args, expected] of [
    [["--help"], 0],
    [["--unknown"], 1],
    [["--__proto__"], 2],
    [["unexpected.ts"], 2],
    [["--dir", "../tools"], 2],
    [["--dir", "/tmp"], 2],
    [["--dir", ""], 2],
    [["--dir", ".jj"], 2],
    [["--dir", ".git/tools"], 2],
  ] satisfies [string[], number][]) {
    const child = Bun.spawn([process.execPath, script, ...args], {
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
