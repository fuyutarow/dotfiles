import { afterAll, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";

const ROOT = resolve(import.meta.dir, "../..");
const scratch = await mkdtemp(join(tmpdir(), "preset-latex-"));
afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

async function run(...args: string[]) {
  const child = Bun.spawn(
    [process.execPath, join(ROOT, "standard-presets/src/cli.ts"), ...args],
    { cwd: scratch, stdout: "pipe", stderr: "pipe", timeout: 30_000 },
  );
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exit };
}

test("LaTeX preset applies to an empty repo and detects drift", async () => {
  const parsed = jsonOf(z.array(z.tuple([z.string(), z.string()]))).safeParse(
    await Bun.file(
      join(import.meta.dir, "fixtures/latex/destinations.json"),
    ).text(),
  );
  if (!parsed.success) expect.unreachable(parsed.error.message);
  const repo = await mkdtemp(join(scratch, "empty-"));
  expect(await readdir(repo)).toEqual([]);
  const listed = await run("list");
  expect(listed.exit).toBe(0);
  expect(listed.stdout).toContain("latex\t");
  const applied = await run("apply", "latex", "--to", repo);
  expect(applied.exit).toBe(0);
  expect(applied.stderr).toBe("");
  expect(applied.stdout).toBe(
    parsed.data
      .map(([, destination]) => `[log] preset: wrote ${destination}\n`)
      .join(""),
  );
  for (const [source, destination] of parsed.data)
    expect(await Bun.file(join(repo, destination)).bytes()).toEqual(
      await Bun.file(join(ROOT, "standard-presets/latex", source)).bytes(),
    );
  const tasks = Bun.TOML.parse(await Bun.file(join(repo, "mise.toml")).text());
  expect(tasks).toHaveProperty("env.LATEX_DIR", "papers/2606_001-title_name");
  expect(await run("diff", "latex", "--to", repo)).toEqual({
    exit: 0,
    stderr: "",
    stdout: "[log] preset: latex is up to date\n",
  });
  for (const [, destination] of parsed.data) {
    await writeFile(join(repo, destination), "drift\n");
    const drift = await run("diff", "latex", "--to", repo);
    expect(drift.exit).toBe(1);
    expect(drift.stdout).toContain(`--- ${destination} (target)`);
    expect((await run("apply", "latex", "--to", repo)).exit).toBe(0);
    expect((await run("diff", "latex", "--to", repo)).exit).toBe(0);
  }
}, 60_000);
