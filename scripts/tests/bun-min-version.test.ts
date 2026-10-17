import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";
import { checkBunRuntime, type Ctx } from "../doctor.ts";

const root = join(import.meta.dir, "../..");
const scratch = await mkdtemp(join(tmpdir(), "bun-runtime-min-"));
afterAll(() => rm(scratch, { recursive: true, force: true }));
const Package = jsonOf(z.object({ engines: z.object({ bun: z.string() }) }));

test("minimum has one declaration per manifest and mise satisfies it", async () => {
  const source = await Bun.file(join(root, "package.json")).text();
  const manifest = Package.safeParse(source);
  expect(manifest.success).toBe(true);
  if (!manifest.success) return;
  expect(source.match(/"bun"\s*:/gu)).toHaveLength(1);
  expect(manifest.data.engines.bun).toBe(">=1.4.3");
  const mise = Bun.TOML.parse(await Bun.file(join(root, "mise.toml")).text());
  expect(mise).toMatchObject({ tools: { bun: "1.4" } });
  const Lock = z.object({
    tools: z.object({
      bun: z
        .array(
          z.object({
            version: z.string(),
            specifiers: z.array(z.string()),
          }),
        )
        .length(1),
    }),
  });
  const locked = Lock.safeParse(
    Bun.TOML.parse(await Bun.file(join(root, "mise.lock")).text()),
  );
  expect(locked.success).toBe(true);
  if (!locked.success) return;
  const bun = locked.data.tools.bun[0];
  expect(bun?.version).toBe(manifest.data.engines.bun.slice(2));
  expect(bun?.specifiers).toEqual(["1.4"]);
  expect(
    Bun.semver.satisfies(bun?.version ?? "", manifest.data.engines.bun),
  ).toBe(true);
});

test("every Bun task has the runtime prerequisite; doctor owns its own diagnosis", async () => {
  const TaskConfig = z.object({
    tasks: z.record(
      z.string(),
      z.object({
        run: z.unknown().optional(),
        depends: z.array(z.string()).optional(),
      }),
    ),
  });
  const parsed = TaskConfig.safeParse(
    Bun.TOML.parse(await Bun.file(join(root, "mise.toml")).text()),
  );
  expect(parsed.success).toBe(true);
  if (!parsed.success) return;
  for (const [name, task] of Object.entries(parsed.data.tasks)) {
    if (name === "doctor" || name === "bun:check") continue;
    if (/\bbun(?:x)?\b/u.test(JSON.stringify(task.run) ?? ""))
      expect(task.depends, name).toContain("bun:check");
  }
});

test("runtime gate names the executable and fix and reads the manifest minimum", async () => {
  const ctx: Ctx = {
    home: scratch,
    dotfiles: scratch,
    isMac: false,
    isWsl: false,
    isCoreBox: false,
  };
  await writeFile(
    join(scratch, "package.json"),
    JSON.stringify({ engines: { bun: ">=999.0.0" } }),
  );
  const rejected = await checkBunRuntime(ctx);
  expect(rejected.verdict).toBe("FAIL");
  expect(rejected.detail).toContain(process.execPath);
  expect(rejected.fix).toContain("mise install bun");
  await writeFile(
    join(scratch, "package.json"),
    JSON.stringify({ engines: { bun: ">=1.0.0" } }),
  );
  expect((await checkBunRuntime(ctx)).verdict).toBe("PASS");
});

test.each(["1.4.2", "1.4.3"])(
  "doctor probes Homebrew %s even outside PATH",
  async (version) => {
    const { mkdir, chmod } = await import("node:fs/promises");
    const { checkBunFloor } = await import("../doctor.ts");
    const fixture = await mkdtemp(join(scratch, "brew-"));
    const homebrew = join(fixture, "homebrew");
    const binary = join(homebrew, "bin/bun");
    await mkdir(join(homebrew, "bin"), { recursive: true });
    await writeFile(binary, `#!/bin/sh\nprintf '%s\\n' '${version}'\n`);
    await chmod(binary, 0o755);
    const result = await checkBunFloor(
      {
        home: fixture,
        dotfiles: root,
        isMac: false,
        isWsl: false,
        isCoreBox: false,
      },
      homebrew,
      "/usr/bin:/bin",
    );
    expect(result.verdict).toBe(version === "1.4.2" ? "FAIL" : "PASS");
    expect(JSON.stringify(result)).toContain(binary);
    expect(JSON.stringify(result)).toContain(version);
  },
);
