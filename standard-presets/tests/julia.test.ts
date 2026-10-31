import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "../../agents/hooks/zod.ts";
import { discoverPresets } from "../src/manifests.ts";

const ROOT = resolve(import.meta.dir, "../..");
const scratch = await mkdtemp(join(tmpdir(), "preset-julia-"));
const parsedFixture = z
  .object({
    destinations: z.array(z.string()),
    package: z.string(),
    uuid: z.string(),
    julia: z.string(),
    projects: z.array(z.string()),
    test_uuid: z.string(),
    source_path: z.string(),
  })
  .safeParse(
    Bun.TOML.parse(
      await Bun.file(
        join(import.meta.dir, "fixtures/julia/expected.toml"),
      ).text(),
    ),
  );
if (!parsedFixture.success) expect.unreachable(parsedFixture.error.message);
const fixture = parsedFixture.data;

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

describe("Julia preset", () => {
  test("lists, applies to an empty repository, and detects drift", async () => {
    const catalog = await discoverPresets(join(ROOT, "standard-presets"));
    if (!catalog.ok) expect.unreachable(catalog.error);
    const preset = catalog.presets.find((entry) => entry.name === "julia");
    if (preset === undefined) expect.unreachable("missing Julia preset");
    expect(preset.files.map((file) => file.destination)).toEqual(
      fixture["destinations"],
    );
    const listed = await run("list");
    expect(listed.exit).toBe(0);
    expect(listed.stdout).toContain("julia\t");
    const target = await mkdtemp(join(scratch, "empty-"));
    expect((await run("diff", "julia", "--to", target)).exit).toBe(1);
    expect(
      (await run("apply", "julia", "--to", target, "--dry-run")).exit,
    ).toBe(0);
    expect(await Bun.file(join(target, "Project.toml")).exists()).toBe(false);
    expect((await run("apply", "julia", "--to", target)).exit).toBe(0);
    for (const file of preset.files)
      expect(await Bun.file(join(target, file.destination)).text()).toBe(
        await Bun.file(join(preset.directory, file.source)).text(),
      );
    expect(await run("diff", "julia", "--to", target)).toEqual({
      exit: 0,
      stderr: "",
      stdout: "[log] preset: julia is up to date\n",
    });
    const project = Bun.TOML.parse(
      await Bun.file(join(target, "Project.toml")).text(),
    );
    expect(project).toMatchObject({
      name: fixture["package"],
      uuid: fixture["uuid"],
      compat: { julia: fixture["julia"] },
      workspace: { projects: fixture["projects"] },
    });
    const child = Bun.TOML.parse(
      await Bun.file(join(target, "test/Project.toml")).text(),
    );
    expect(child).toMatchObject({
      deps: { MyPackage: fixture["uuid"], Test: fixture["test_uuid"] },
      sources: { MyPackage: { path: fixture["source_path"] } },
    });
    const tasks = Bun.TOML.parse(
      await Bun.file(join(target, "mise.toml")).text(),
    );
    expect(tasks).toMatchObject({
      tasks: { "fmt:julia": { run: "julia --project=. -m Runic --inplace ." } },
    });
    await Bun.write(join(target, "Project.toml"), "# drift\n");
    const drift = await run("diff", "julia", "--to", target);
    expect(drift.exit).toBe(1);
    expect(drift.stdout).toContain("--- Project.toml (target)");
    expect((await run("apply", "julia", "--to", target)).exit).toBe(0);
    expect((await run("diff", "julia", "--to", target)).exit).toBe(0);
  }, 60_000);
});
