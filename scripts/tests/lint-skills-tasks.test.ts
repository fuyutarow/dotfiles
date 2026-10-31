import { expect, test } from "bun:test";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");

test("retired task in a skill fails, while documented consumer tasks are exempt", async () => {
  const directory = await mkdtemp(join(tmpdir(), "skill-tasks-"));
  const mise = join(directory, "mise");
  await writeFile(
    mise,
    '#!/bin/sh\nprintf \'[{"name":"unrelated","aliases":[]}]\'\n',
  );
  await chmod(mise, 0o755);
  const child = Bun.spawn([process.execPath, "scripts/lint-skills-tasks.ts"], {
    cwd: root,
    env: { ...process.env, PATH: `${directory}:${process.env["PATH"]}` },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code).toBe(1);
  expect(err).toContain(
    "operating-wsl2-on-windows/SKILL.md:99: unknown mise task wsl:wake",
  );
  expect(err).not.toContain("unknown mise task latex:lint");
  expect(out).not.toContain("PASS");
});
