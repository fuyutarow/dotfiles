import { expect, test } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkCoreFloor } from "../src/core-floor.ts";

test("a timed-out installation observation is not reported as absence", async () => {
  const result = await checkCoreFloor(
    {
      read: (tool) => Promise.resolve(`${tool} 9.0.0`),
      installed: (tool) =>
        Promise.resolve(tool === "agx" ? { stderr: "", timeout: true } : true),
      upgrade: () => Promise.resolve(),
    },
    false,
  );
  expect(result.detail).toBe("agx: probe timed out; retry the check");
});

test("slow Homebrew installation checks can complete after three seconds", async () => {
  const dir = mkdtempSync(join(tmpdir(), "core-floor-"));
  for (const [name, body] of Object.entries({
    agx: "echo 'agx 9.0.0'",
    semlint: "echo 'semlint 9.0.0'",
    brew: "sleep 3.2; echo /opt/homebrew/Cellar/agx/9.0.0/bin/agx",
  })) {
    const path = join(dir, name);
    writeFileSync(path, `#!/bin/sh\n${body}\n`);
    chmodSync(path, 0o755);
  }
  const child = Bun.spawn(
    [process.execPath, join(import.meta.dir, "../src/core-floor.ts")],
    {
      env: { ...process.env, PATH: `${dir}:${process.env["PATH"] ?? ""}` },
      stdout: "pipe",
      stderr: "pipe",
      signal: AbortSignal.timeout(9000),
      killSignal: "SIGKILL",
    },
  );
  const [code, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);
  expect(code).toBe(0);
  expect(stderr).toContain("PASS core-floor");
}, 10000);
