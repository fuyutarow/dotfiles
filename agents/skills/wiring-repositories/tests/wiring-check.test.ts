import { afterEach, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const roots: string[] = [];
const script = join(import.meta.dir, "../scripts/wiring-check.ts");

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "wiring-check-"));
  roots.push(root);
  const bin = join(root, "bin");
  await mkdir(bin);
  await mkdir(join(root, ".git"));
  await mkdir(join(root, ".githooks"));
  // Delay git's answers so assertions also exercise awaiting subprocess completion.
  const git = join(bin, "git");
  await writeFile(
    git,
    `#!${process.execPath}
await Bun.sleep(20);
if (Bun.argv.includes("config")) {
  process.stdout.write(".githooks\\n");
} else {
  process.exit(Bun.argv.at(-1) === ".cocoindex_code/settings.yml" ? 0 : 1);
}
`,
  );
  await chmod(git, 0o755);
  return { root, bin };
}

async function run(root: string, bin: string, args: string[] = []) {
  const child = Bun.spawn([process.execPath, script, "--repo", root, ...args], {
    env: { ...process.env, PATH: `${bin}:${process.env["PATH"] ?? ""}` },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10_000,
  });
  const [exit, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exit, stdout, stderr };
}

test("awaits hook file checks and reports a missing task script", async () => {
  const { root, bin } = await fixture();
  await writeFile(
    join(root, "mise.toml"),
    '[tools]\nbun = "1"\n[tasks.verify]\nrun = "bun scripts/missing.ts"\n',
  );
  await writeFile(join(root, ".githooks/post-merge"), "mise run verify\n");
  const result = await run(root, bin);
  expect(result.exit).toBe(1);
  expect(result.stderr).toBe("");
  expect(result.stdout).toContain("FAIL  [ORDER-2]");
  expect(result.stdout).toContain("missing file `scripts/missing.ts`");
  expect(result.stdout).not.toContain("[ORDER-3]");
});

test("accepts an existing script and skips directories while reading audit sources", async () => {
  const { root, bin } = await fixture();
  await mkdir(join(root, "scripts/nested"), { recursive: true });
  await writeFile(join(root, "scripts/verify.ts"), "// fixture\n");
  await writeFile(
    join(root, "mise.toml"),
    '[tools]\nbun = "1"\n[tasks.verify]\nrun = "bun scripts/verify.ts"\n',
  );
  await writeFile(join(root, ".githooks/post-merge"), "mise run verify\n");
  const result = await run(root, bin, ["--audit"]);
  expect(result.exit).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout).toContain(
    "OK    wiring joint coherent (incl. inert audit)",
  );
});

test("awaits tracked-file subprocess results, including a nonzero exit", async () => {
  const { root, bin } = await fixture();
  await mkdir(join(root, ".cocoindex_code"));
  await writeFile(
    join(root, ".cocoindex_code/settings.yml"),
    "exclude_patterns: []\n",
  );
  const result = await run(root, bin);
  expect(result.exit).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout).not.toContain("[ORDER-5]");
  expect(result.stdout).toContain("OK    wiring joint coherent");
});

test("finishes the audit before printing findings and exiting", async () => {
  const { root, bin } = await fixture();
  await mkdir(join(root, ".claude/hooks"), { recursive: true });
  await writeFile(join(root, ".claude/hooks/orphan.ts"), "// unused\n");
  const result = await run(root, bin, ["--audit"]);
  expect(result.exit).toBe(1);
  expect(result.stderr).toBe("");
  expect(result.stdout).toContain("FAIL  [INERT]");
  expect(result.stdout).toContain("orphan.ts");
  expect(result.stdout).not.toContain("OK    wiring joint coherent");
});
