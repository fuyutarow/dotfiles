import { expect, test } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("ccc GPU policy and embedder adapter yield under the runner's admission lock", () => {
  const result = Bun.spawnSync(
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
    ],
    {
      timeout: 60_000,
      env: {
        ...process.env,
        UV_CACHE_DIR: join(tmpdir(), "dotfiles-uv-cache"),
      },
    },
  );
  expect(result.stderr.toString() + result.stdout.toString()).toContain(
    "passed",
  );
  expect(result.exitCode).toBe(0);
}, 65_000);
