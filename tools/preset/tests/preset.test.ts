import { afterAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { jsonOf, z } from "../../../agents/hooks/zod.ts";

const SCRIPT = resolve(import.meta.dir, "../src/preset.ts");
const roots: string[] = [];
afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "preset-sync-fixture-"));
  roots.push(root);
  return root;
}

async function run(root: string, ...args: string[]) {
  const child = Bun.spawn([process.execPath, SCRIPT, "sync", ...args, root], {
    cwd: root,
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

describe("preset sync", () => {
  test("shipped mise checker uses the recorded house pin, not a parent decoy", async () => {
    const parent = await fixture();
    const root = join(parent, "consumer");
    await mkdir(root);
    await writeFile(join(parent, "mise.toml"), '[tools]\nbun = "9.9.9"\n');
    const house = Bun.TOML.parse(
      await readFile(resolve(import.meta.dir, "../../../mise.toml"), "utf8"),
    );
    const parsed = z
      .object({ tools: z.object({ bun: z.string() }) })
      .safeParse(house);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const pin = parsed.data.tools.bun;
    const tasks = ["fmt", "f", "fmt:check", "lint", "test", "up", "check"]
      .map((name) => `[tasks."${name}"]\nrun = "true"`)
      .join("\n");
    await writeFile(
      join(root, "mise.toml"),
      `[tools]\nbun = "${pin}"\n${tasks}\n`,
    );
    const synced = await run(root, "--tool", "mise-contract");
    expect(synced.exit, synced.stderr).toBe(0);
    const checker = join(root, "tools/mise-contract/scripts/mise-contract.ts");
    const check = async () => {
      const child = Bun.spawn([process.execPath, checker, root], {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 30_000,
      });
      const [stdout, stderr, exit] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return { output: stdout + stderr, exit };
    };
    const good = await check();
    expect(good.exit, good.output).toBe(0);
    await writeFile(
      join(root, "mise.toml"),
      `[tools]\nbun = "9.9.9"\n${tasks}\n`,
    );
    const bad = await check();
    expect(bad.exit).toBe(1);
    expect(bad.output).toContain(`the house pin is bun = "${pin}"`);
    expect((await run(root, "--check", "--tool", "mise-contract")).exit).toBe(
      0,
    );
  }, 60_000);

  test.each([
    "jj-commit",
    "jj-push",
    "jj-precommit",
    "fmt-staged",
    "mise-contract",
    "wiring-check",
    "lint-ts-candidate",
    "tex-oracle",
  ])(
    "runs tests shipped with %s in isolation",
    async (tool) => {
      const root = await fixture();
      const synced = await run(root, "--tool", tool);
      expect(synced.exit, synced.stderr).toBe(0);
      const tests = join(root, "tools", tool, "tests");
      if (!existsSync(tests)) return;
      const child = Bun.spawn([process.execPath, "test", tests], {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 60_000,
      });
      const [stdout, stderr, exit] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(exit, `${tool}: ${stdout}\n${stderr}`).toBe(0);
    },
    90_000,
  );

  test("copies every contract tool into a fixture repo and checks recorded sources", async () => {
    const root = await fixture();
    await writeFile(join(root, "package.json"), '{"private":true}\n');
    const marker = join(root, "keep.txt");
    await writeFile(marker, "outside tools remains untouched\n");

    const synced = await run(root);
    expect(synced.exit, synced.stderr).toBe(0);
    expect(synced.stdout).toContain("8 tool(s)");
    expect(synced.stdout).toContain("file(s) from ");
    expect(await readFile(marker, "utf8")).toBe(
      "outside tools remains untouched\n",
    );

    for (const tool of [
      "jj-commit",
      "jj-push",
      "jj-precommit",
      "fmt-staged",
      "mise-contract",
      "wiring-check",
      "lint-ts-candidate",
      "tex-oracle",
    ]) {
      const directory = join(root, "tools", tool);
      expect((await lstat(directory)).isDirectory()).toBe(true);
      expect((await lstat(join(directory, ".preset-sync.json"))).isFile()).toBe(
        true,
      );
      const child = Bun.spawn(
        [
          process.execPath,
          "--no-install",
          join(directory, "scripts", `${tool}.ts`),
          "--help",
        ],
        { cwd: root, stdout: "pipe", stderr: "pipe", timeout: 10_000 },
      );
      const [, stderr, exit] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(exit, `${tool}: ${stderr}`).toBe(0);
    }
    expect(
      (await lstat(join(root, "tools/jj-push/tests/jj-push.test.ts"))).isFile(),
    ).toBe(true);
    const copiedHelp = Bun.spawn(
      [
        process.execPath,
        join(root, "tools/jj-push/scripts/jj-push.ts"),
        "--help",
      ],
      { cwd: root, stdout: "pipe", stderr: "pipe", timeout: 10_000 },
    );
    const [helpOutput, helpError, helpExit] = await Promise.all([
      new Response(copiedHelp.stdout).text(),
      new Response(copiedHelp.stderr).text(),
      copiedHelp.exited,
    ]);
    expect(helpExit, helpError).toBe(0);
    expect(helpOutput).toContain("Push the alpha bookmark to origin");

    const clean = await run(root, "--check");
    expect(clean.exit, clean.stderr).toBe(0);
    expect(clean.stdout).toContain("PRESET CLEAN");

    const copied = join(root, "tools/jj-push/scripts/jj-push.ts");
    await writeFile(copied, `${await readFile(copied, "utf8")}\nlocal edit\n`);
    const drift = await run(root, "--check", "--tool", "jj-push");
    expect(drift.exit).toBe(1);
    expect(drift.stdout).toContain("DIFF tools/jj-push/scripts/jj-push.ts");
    expect(drift.stdout).toContain("PRESET DIFF 1 file(s)");
    expect(await readFile(marker, "utf8")).toBe(
      "outside tools remains untouched\n",
    );
  });

  test("merges owned exclusions without losing consumer entries", async () => {
    const root = await fixture();
    const scopePath = join(root, "tsconfig.vendored.json");
    await writeFile(
      scopePath,
      '{\n  "exclude": ["node_modules", "dist", "src/notebooks/.observable"],\n  "compilerOptions": {"strict": true}\n}\n',
    );
    const first = await run(root, "--tool", "jj-push");
    expect(first.exit, first.stderr).toBe(0);
    const initial = await readFile(scopePath, "utf8");
    expect(initial).toContain('"dist"');
    expect(initial).toContain('"src/notebooks/.observable"');
    expect(initial).toContain('"tools/jj-push/scripts/jj-push.ts"');
    expect(initial).toContain('"strict": true');
    const second = await run(root, "--tool", "jj-push");
    expect(second.exit, second.stderr).toBe(0);
    expect(await readFile(scopePath, "utf8")).toBe(initial);
    const added = await run(root, "--tool", "jj-precommit");
    expect(added.exit, added.stderr).toBe(0);
    expect(await readFile(scopePath, "utf8")).toContain(
      "tools/jj-precommit/scripts/jj-precommit.ts",
    );
  });

  test("rejects a symlinked tools directory before writing through it", async () => {
    const root = await fixture();
    const outside = await fixture();
    const target = join(outside, "target");
    await mkdir(target, { recursive: true });
    await symlink(target, join(root, "tools"));
    const result = await run(root, "--tool", "jj-push");
    expect(result.exit).toBe(2);
    expect(result.stderr).toContain("refusing non-directory or symlink path");
    expect(
      await readFile(join(outside, "target/.preset-sync.json")).catch(() => ""),
    ).toBe("");
  });
  test("unreachable legacy record preserves unproven stale files and never aborts", async () => {
    const root = await fixture();
    const first = await run(root, "--tool", "fmt-staged");
    expect(first.exit, first.stderr).toBe(0);
    const manifestPath = join(root, "tools/fmt-staged/.preset-sync.json");
    const parsed = jsonOf(
      z.object({
        sourceCommit: z.string(),
        files: z.array(
          z.object({
            source: z.string(),
            destination: z.string(),
            sha256: z.string().optional(),
          }),
        ),
      }),
    ).safeParse(await readFile(manifestPath, "utf8"));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const manifest = parsed.data;
    manifest.sourceCommit = "a".repeat(40);
    for (const file of manifest.files) delete file.sha256;
    await writeFile(manifestPath, JSON.stringify(manifest));
    const stale = join(root, "tools/fmt-staged/tests/fmt-staged.test.ts");
    await mkdir(join(root, "tools/fmt-staged/tests"), { recursive: true });
    await writeFile(stale, "consumer data\n");
    const synced = await run(root, "--tool", "fmt-staged");
    expect(synced.exit, synced.stderr).toBe(0);
    expect(synced.stdout).toContain(
      "unmanaged: tools/fmt-staged/tests/fmt-staged.test.ts",
    );
    expect(await readFile(stale, "utf8")).toBe("consumer data\n");
  });

  test("fourth tool planning failure leaves previous tools unchanged", async () => {
    const root = await fixture();
    const args = [
      "--tool",
      "jj-commit",
      "--tool",
      "jj-push",
      "--tool",
      "jj-precommit",
      "--tool",
      "fmt-staged",
    ];
    const initial = await run(root, ...args);
    expect(initial.exit, initial.stderr).toBe(0);
    const target = join(root, "tools/jj-commit/scripts/jj-commit.ts");
    await writeFile(target, "local change\n");
    const before = await readFile(target);
    const bad = join(root, "tools/fmt-staged/scripts/fmt-staged.ts");
    await rm(bad);
    await symlink(target, bad);
    const result = await run(root, ...args);
    expect(result.exit).toBe(2);
    expect(await readFile(target)).toEqual(before);
  });

  test("second sync is a no-op and checks hashes without a reachable commit", async () => {
    const root = await fixture();
    const first = await run(root, "--tool", "jj-push");
    expect(first.exit, first.stderr).toBe(0);
    const file = join(root, "tools/jj-push/scripts/jj-push.ts");
    const before = await lstat(file);
    const second = await run(root, "--tool", "jj-push");
    expect(second.exit, second.stderr).toBe(0);
    expect((await lstat(file)).mtimeMs).toBe(before.mtimeMs);
    const manifestPath = join(root, "tools/jj-push/.preset-sync.json");
    const parsed = jsonOf(
      z.object({
        sourceCommit: z.string(),
        files: z.array(
          z.object({
            source: z.string(),
            destination: z.string(),
            sha256: z.string().optional(),
          }),
        ),
      }),
    ).safeParse(await readFile(manifestPath, "utf8"));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const manifest = parsed.data;
    manifest.sourceCommit = "a".repeat(40);
    await writeFile(manifestPath, JSON.stringify(manifest));
    expect((await run(root, "--check", "--tool", "jj-push")).exit).toBe(0);
    await writeFile(file, "drift\n");
    const drift = await run(root, "--check", "--tool", "jj-push");
    expect(drift.exit).toBe(1);
    expect(drift.stdout).toContain("DIFF tools/jj-push/scripts/jj-push.ts");
  });
});
