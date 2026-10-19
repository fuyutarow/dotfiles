import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ownerState } from "../../shared/tests/gpu-owner-fixture.ts";

test.skipIf(Bun.which("uv") === null)(
  "Python partition reads fresh state and refuses stale or unresponsive memory",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "partition-gpu-owner-"));
    await using _cleanup = {
      [Symbol.asyncDispose]: () => rm(dir, { recursive: true, force: true }),
    };
    const statePath = join(dir, "gpu-owner.json");
    const script = `import runpy\nfree = runpy.run_path(${JSON.stringify(join(import.meta.dir, "../gpu_partition.py"))})['_free_bytes']\nprint(free(0))\n`;
    async function read(): Promise<string> {
      const child = Bun.spawn(
        ["uv", "run", "--no-project", "python", "-c", script],
        {
          env: {
            ...process.env,
            XDG_STATE_HOME: dir,
            UV_CACHE_DIR: join(dir, "uv-cache"),
            PYTHONDONTWRITEBYTECODE: "1",
          },
          stdout: "pipe",
          stderr: "pipe",
          timeout: 15000,
        },
      );
      const [out, stderr, exit] = await Promise.all([
        child.stdout.text(),
        child.stderr.text(),
        child.exited,
      ]);
      expect(exit, stderr).toBe(0);
      return out.trim();
    }
    const state = ownerState(Temporal.Now.instant().epochMilliseconds);
    await Bun.write(statePath, JSON.stringify(state));
    expect(await read()).toBe(String(8704 * 1024 ** 2));
    await Bun.write(
      statePath,
      JSON.stringify({ ...state, unresponsiveSince: state.attemptAt }),
    );
    expect(await read()).toBe("None");
    await Bun.write(
      statePath,
      JSON.stringify({ ...state, sampledAt: state.attemptAt - 120_001 }),
    );
    expect(await read()).toBe("None");
  },
  30000,
);
