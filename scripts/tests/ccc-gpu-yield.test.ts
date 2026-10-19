import { expect, test } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("ccc GPU policy and embedder adapter yield under the runner's admission lock", async () => {
  const proc = Bun.spawn(
    [
      "uv",
      "run",
      "--no-project",
      "--with",
      "pytest==8.4.2",
      "python",
      "-B",
      "-m",
      "pytest",
      "-q",
      "-p",
      "no:cacheprovider",
      join(import.meta.dir, "../../cocoindex/test_gpu_yield.py"),
      join(import.meta.dir, "../../cocoindex/test_gpu_launch.py"),
    ],
    {
      timeout: 60_000,
      env: {
        ...process.env,
        UV_CACHE_DIR: join(tmpdir(), "dotfiles-uv-cache"),
      },
    },
  );
  const [stderr, stdout, exitCode] = await Promise.all([
    new Response(proc.stderr).text(),
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  expect(stderr + stdout).toContain("passed");
  expect(exitCode, stderr + stdout).toBe(0);
}, 65_000);
