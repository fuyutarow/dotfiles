import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import { discoverPresets } from "../src/manifests.ts";

const ROOT = resolve(import.meta.dir, "../..");
const scratch = await mkdtemp(join(tmpdir(), "preset-uv-"));
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

describe("uv preset", () => {
  test("lists, applies every fixture destination to an empty repo, and detects drift", async () => {
    const listed = await run("list");
    expect(listed.exit).toBe(0);
    expect(listed.stdout).toMatch(/^python\t/mu);
    const catalog = await discoverPresets(join(ROOT, "standard-presets"));
    if (!catalog.ok) expect.unreachable(catalog.error);
    const preset = catalog.presets.find((entry) => entry.name === "python");
    if (preset === undefined) expect.unreachable("uv manifest missing");
    const destinations = (
      await Bun.file(
        join(import.meta.dir, "fixtures/python/destinations.txt"),
      ).text()
    )
      .trim()
      .split("\n");
    expect(preset.files.map((file) => file.destination)).toEqual(destinations);
    const repo = await mkdtemp(join(scratch, "empty-"));
    expect(await readdir(repo)).toEqual([]);
    expect((await run("diff", "python", "--to", repo)).exit).toBe(1);
    expect((await run("apply", "python", "--to", repo, "--dry-run")).exit).toBe(
      0,
    );
    expect(await readdir(repo)).toEqual([]);
    expect((await run("apply", "python", "--to", repo)).exit).toBe(0);
    for (const file of preset.files) {
      expect(await Bun.file(join(repo, file.destination)).text()).toBe(
        await Bun.file(join(preset.directory, file.source)).text(),
      );
    }
    expect(await run("diff", "python", "--to", repo)).toEqual({
      stdout: "preset: python is up to date\n",
      stderr: "",
      exit: 0,
    });
    await writeFile(join(repo, "pyproject.toml"), "# drift\n");
    const drift = await run("diff", "python", "--to", repo);
    expect(drift.exit).toBe(1);
    expect(drift.stdout).toContain("--- pyproject.toml (target)");
    expect((await run("apply", "python", "--to", repo)).exit).toBe(0);
    expect((await run("diff", "python", "--to", repo)).exit).toBe(0);
  }, 60_000);

  test("preserves the prescribed values and keeps optional examples separate", async () => {
    const directory = join(ROOT, "standard-presets/python");
    expect(
      Bun.TOML.parse(await Bun.file(join(directory, "pyproject.toml")).text()),
    ).toMatchObject({
      project: { "requires-python": ">=3.12", dependencies: [] },
      "dependency-groups": { dev: ["ruff==0.15.21", "pytest", "pyright"] },
      tool: {
        uv: { "required-version": ">=0.11.28" },
        pyright: { typeCheckingMode: "strict" },
        ruff: {
          "line-length": 100,
          "target-version": "py312",
          lint: { preview: false },
        },
      },
    });
    expect(
      parse(await Bun.file(join(directory, ".pre-commit-config.yaml")).text()),
    ).toEqual({
      repos: [
        {
          repo: "https://github.com/astral-sh/ruff-pre-commit",
          rev: "v0.15.21",
          hooks: [{ id: "ruff-check", args: ["--fix"] }, { id: "ruff-format" }],
        },
      ],
    });
    expect(
      Bun.TOML.parse(await Bun.file(join(directory, "mise.toml")).text()),
    ).toMatchObject({
      tasks: {
        setup: { run: "uv sync" },
        lint: { run: "uv run ruff check" },
        test: { run: "uv run pytest" },
      },
    });
    expect(
      Bun.TOML.parse(
        await Bun.file(
          join(directory, "examples/pyproject-pytorch.toml"),
        ).text(),
      ),
    ).toMatchObject({
      project: {
        "requires-python": ">=3.13",
        dependencies: ["torch>=2.3.1", "torchvision"],
      },
      tool: {
        uv: {
          index: [
            { name: "pytorch-cpu", explicit: true },
            { name: "pytorch-cu130", explicit: true },
          ],
        },
      },
    });
    const script = await Bun.file(join(directory, "examples/script.py")).text();
    expect(script).toStartWith("# /// script\n");
    expect(script).toContain('# requires-python = ">=3.12"');
  });
});
