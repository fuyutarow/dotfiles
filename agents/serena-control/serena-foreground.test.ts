import { describe, expect, test } from "bun:test";
import {
  SERENA_COMMIT,
  SERENA_DEFAULT_CONTEXT,
  buildSerenaCommand,
  buildSerenaManifest,
} from "./serena-foreground.ts";

const GiB = 1024 ** 3;

describe("explicit Serena lifecycle", () => {
  test("pins Serena and exposes one localhost streamable HTTP endpoint", () => {
    const command = buildSerenaCommand({
      project: "/workspace/example",
      context: SERENA_DEFAULT_CONTEXT,
      port: 9121,
    });
    expect(command).toEqual([
      "uvx",
      "--from",
      `git+https://github.com/oraios/serena@${SERENA_COMMIT}`,
      "serena",
      "start-mcp-server",
      "--transport",
      "streamable-http",
      "--host",
      "127.0.0.1",
      "--port",
      "9121",
      "--context",
      "claude-code",
      "--project",
      "/workspace/example",
      "--open-web-dashboard",
      "False",
    ]);
  });

  test("uses a stable per-project job id and finite service limits", () => {
    const first = buildSerenaManifest({
      project: "/workspace/example",
      cpuThreads: 2,
      ramBytes: 4 * GiB,
      processes: 12,
      scratchBytes: 2 * GiB,
      walltimeSeconds: 14_400,
    });
    const again = buildSerenaManifest({
      project: "/workspace/example",
      cpuThreads: 2,
      ramBytes: 4 * GiB,
      processes: 12,
      scratchBytes: 2 * GiB,
      walltimeSeconds: 14_400,
    });
    const other = buildSerenaManifest({
      project: "/workspace/other",
      cpuThreads: 2,
      ramBytes: 4 * GiB,
      processes: 12,
      scratchBytes: 2 * GiB,
      walltimeSeconds: 14_400,
    });

    expect(first.job_id).toBe(again.job_id);
    expect(first.job_id).not.toBe(other.job_id);
    expect(first).toMatchObject({
      run_class: "service",
      cpu_threads: 2,
      processes: 12,
      host_ram_peak_bytes: 4 * GiB,
      scratch_bytes: 2 * GiB,
      child_fanout: 0,
      walltime_seconds: 14_400,
      device: { kind: "cpu", gpu_status: "incompatible" },
      cleanup: { mode: "term-then-kill", grace_seconds: 10 },
    });
  });
});
