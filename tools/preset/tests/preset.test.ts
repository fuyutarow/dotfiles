import { afterAll, describe, expect, test } from "bun:test";
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
});
