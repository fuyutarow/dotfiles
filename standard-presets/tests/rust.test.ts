import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";

const ROOT = resolve(import.meta.dir, "../..");
const scratch = await mkdtemp(join(tmpdir(), "preset-cargo-"));
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

test("Cargo preset applies to an empty repository, preserves policy, and detects drift", async () => {
  const fixture = jsonOf(
    z.object({
      files: z.array(z.string()),
      workspace: z.record(z.string(), z.unknown()),
      profile: z.record(z.string(), z.unknown()),
    }),
  ).safeParse(
    await Bun.file(join(import.meta.dir, "fixtures/rust/expected.json")).text(),
  );
  if (!fixture.success) expect.unreachable(fixture.error.message);
  const listed = await run("list");
  expect(listed.exit).toBe(0);
  expect(listed.stdout).toContain("rust\t");
  expect((await run("diff", "rust", "--to", scratch)).exit).toBe(1);
  expect((await run("apply", "rust", "--to", scratch)).exit).toBe(0);
  for (const file of fixture.data.files)
    expect(await Bun.file(join(scratch, file)).bytes()).toEqual(
      await Bun.file(join(ROOT, "standard-presets/rust", file)).bytes(),
    );
  const manifest = Bun.TOML.parse(
    await Bun.file(join(scratch, "Cargo.toml")).text(),
  );
  expect(manifest).toEqual({
    workspace: fixture.data.workspace,
    profile: fixture.data.profile,
  });
  expect(
    Bun.TOML.parse(await Bun.file(join(scratch, "member-lints.toml")).text()),
  ).toEqual({ lints: { workspace: true } });
  for (const file of ["rustfmt.toml", "clippy.toml"])
    expect(Bun.TOML.parse(await Bun.file(join(scratch, file)).text())).toEqual(
      {},
    );
  const tasks = Bun.TOML.parse(
    await Bun.file(join(scratch, "mise.toml")).text(),
  );
  expect(tasks).toMatchObject({
    tasks: {
      fmt: { run: "cargo fmt --all" },
      lint: { run: "cargo clippy --workspace --all-targets" },
      test: { run: "cargo test --workspace" },
      check: { depends: ["fmt:check", "lint", "test"] },
    },
  });
  expect(await run("diff", "rust", "--to", scratch)).toEqual({
    exit: 0,
    stdout: "[log] preset: rust is up to date\n",
    stderr: "",
  });
  await writeFile(join(scratch, "rustfmt.toml"), "max_width = 80\n");
  const drift = await run("diff", "rust", "--to", scratch);
  expect(drift.exit).toBe(1);
  expect(drift.stdout).toContain("-max_width = 80");
  expect((await run("apply", "rust", "--to", scratch)).exit).toBe(0);
  expect((await run("diff", "rust", "--to", scratch)).exit).toBe(0);
}, 60_000);
