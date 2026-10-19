import { expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { jsonOf, z } from "../src/zod.ts";
const PackageSchema = jsonOf(
  z.object({
    version: z.string(),
    bin: z.record(z.string(), z.string()).optional(),
  }),
);
const environments = [
  { tty: false, color: false },
  { tty: false, color: true },
  { tty: true, color: false },
  { tty: true, color: true },
];

const ROOT = resolve(import.meta.dir, "../../..");

async function run(
  entry: string,
  args: string[],
  tty = false,
  color = false,
  extraEnv: NodeJS.ProcessEnv = {},
) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...extraEnv,
    TERM: "xterm-256color",
  };
  delete env.NO_COLOR;
  delete env.FORCE_COLOR;
  if (color) env.FORCE_COLOR = "1";
  let output = "";
  const command = [process.execPath, entry, ...args];
  const child = tty
    ? Bun.spawn(
        ["sh", "-c", 'stty -onlcr; exec "$@"', "cli-test", ...command],
        {
          env,
          terminal: {
            cols: 45,
            rows: 24,
            data(_terminal, bytes) {
              output += Buffer.from(bytes).toString();
            },
          },
          timeout: 10000,
        },
      )
    : Bun.spawn(command, {
        env,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        timeout: 10000,
      });
  const [stdout, stderr, exit] = await Promise.all([
    child.stdout !== undefined && child.stdout !== null
      ? new Response(child.stdout).text()
      : Promise.resolve(""),
    child.stderr !== undefined && child.stderr !== null
      ? new Response(child.stderr).text()
      : Promise.resolve(""),
    child.exited,
  ]);
  child.terminal?.close();
  return { stdout: tty ? output : stdout, stderr, exit };
}

// Derive the acceptance surface from package declarations, including every bin alias.
for await (const packagePath of new Bun.Glob("tools/*/package.json").scan({
  cwd: ROOT,
})) {
  const decoded = PackageSchema.safeParse(
    await Bun.file(join(ROOT, packagePath)).text(),
  );
  expect(decoded.success).toBe(true);
  if (!decoded.success) continue;
  const pkg = decoded.data;
  // gpu-probe-pause owns the in-flight Cleye migration for this shared package bin.
  const bins = Object.entries(pkg.bin ?? {}).filter(
    ([name]) => name !== "gpu-sampler",
  );
  for (const [name, source] of bins) {
    test(`${name}: version aliases, typed short flag, deterministic plain help`, async () => {
      const root = await mkdtemp(join(tmpdir(), "cli-surface-"));
      await using _cleanup = {
        [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
      };
      {
        const entry = join(root, name);
        await symlink(resolve(ROOT, packagePath, "..", source), entry);
        for (const flag of ["-V", "--version"]) {
          const result = await run(entry, [flag]);
          expect(result).toEqual({
            stdout: `${Object.keys(pkg.bin ?? {})[0]} ${pkg.version}\n`,
            stderr: "",
            exit: 0,
          });
        }
        const plain = await run(entry, ["--help"]);
        expect(plain.exit, plain.stderr).toBe(0);
        expect(plain.stderr).toBe("");
        expect(plain.stdout).toContain(name === "agx" ? "TOOLS:" : "Show help");
        expect(plain.stdout).not.toContain("\u001B");
        for (const { tty, color } of environments) {
          const rendered = await run(entry, ["--help"], tty, color);
          expect(rendered).toEqual(plain);
        }
        // The forwarding wrapper must deliver the typed token to its downstream diagnostic.
        const extraEnv: NodeJS.ProcessEnv = {};
        if (name === "btmp") {
          await writeFile(
            join(root, "btm"),
            "#!/usr/bin/env bun\nprocess.stderr.write(`Error: Unknown flag: ${process.argv[2]}.\\n`);\nprocess.exit(1);\n",
            { mode: 0o755 },
          );
          extraEnv.PATH = `${root}:${process.env.PATH ?? ""}`;
          extraEnv.HERDR_ENV = "";
        }
        const error = await run(entry, ["-Z"], false, false, extraEnv);
        expect(error.exit).toBeGreaterThan(0);
        expect(error.stderr).toMatch(/(?:-Z|unknown option: Z)/u);
        expect(error.stderr).not.toContain("--Z");
      }
    });
  }
}

test("CLI template produces the same surface", async () => {
  const root = await mkdtemp(join(tmpdir(), "cli-template-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  {
    const template = await Bun.file(
      join(ROOT, "agents/skills/writing-bun-scripts/assets/cli.ts.txt"),
    ).text();
    const source = template
      .replace(
        '"../../shared/src/cli.ts"',
        JSON.stringify(join(ROOT, "tools/shared/src/cli.ts")),
      )
      .replace('"../package.json"', '"./package.json"');
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ version: "1.2.3", bin: { example: "cli.ts" } }),
    );
    await symlink(join(ROOT, "node_modules"), join(root, "node_modules"));
    const entry = join(root, "cli.ts");
    await writeFile(entry, source);
    for (const flag of ["-V", "--version"])
      expect(await run(entry, [flag])).toEqual({
        stdout: "example 1.2.3\n",
        stderr: "",
        exit: 0,
      });
    const help = await run(entry, ["--help"]);
    expect(help.exit).toBe(0);
    expect(help.stdout).not.toContain("\u001B");
    for (const { tty, color } of environments)
      expect(await run(entry, ["--help"], tty, color)).toEqual(help);
    expect((await run(entry, ["-Z"])).stderr).toContain("Unknown flag: -Z.");
  }
});

for (const command of [
  ["worker", "doctor"],
  ["worker", "dispatch"],
  ["worker", "run"],
  ["ws", "add"],
  ["ticket", "new"],
]) {
  test(`agx ${command.join(" ")}: command help is environment-independent`, async () => {
    const entry = join(ROOT, "tools/agx/src/agx.ts");
    const args = [...command, "--help"];
    const plain = await run(entry, args);
    expect(plain.exit, plain.stderr).toBe(0);
    expect(plain.stdout).not.toContain("\u001B");
    for (const { tty, color } of environments)
      expect(await run(entry, args, tty, color)).toEqual(plain);
  });
}
