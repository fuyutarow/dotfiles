import { expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("an existing updated executable is preserved and passes check", async () => {
  const dir = await mkdtemp(join(tmpdir(), "reason-network-test-"));
  const binary = join(dir, "reason-network");
  const content = "#!/bin/sh\necho updated-version\n";
  await using cleanup = {
    [Symbol.asyncDispose]: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
  void cleanup;
  await writeFile(binary, content);
  await chmod(binary, 0o755);
  for (const action of ["install", "install", "check"]) {
    const child = Bun.spawn(
      [process.execPath, join(import.meta.dir, "install.ts"), action],
      {
        env: { ...process.env, PATH: dir },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    expect(await child.exited).toBe(0);
    expect(await readFile(binary, "utf8")).toBe(content);
  }
});
