import { describe, expect, test } from "bun:test";
import {
  missingGpuToolDenial,
  probeGpuVisibility,
  type GpuProbeResult,
} from "../src/gpu-visibility.ts";

describe("GPU tool visibility", () => {
  test("names the missing WSL path for an explicit GPU request", () => {
    expect(
      missingGpuToolDenial({
        requested: true,
        executableFound: false,
        path: "/usr/bin:/bin",
        isWsl: true,
      }),
    ).toBe(
      "GPU not visible in this unit: nvidia-smi not found on PATH=/usr/bin:/bin; expected /usr/lib/wsl/lib",
    );
  });

  test("does not refuse CPU work or a visible GPU tool", () => {
    expect(
      missingGpuToolDenial({
        requested: false,
        executableFound: false,
        path: "/usr/bin:/bin",
        isWsl: true,
      }),
    ).toBeUndefined();
    expect(
      missingGpuToolDenial({
        requested: true,
        executableFound: true,
        path: "/usr/lib/wsl/lib:/usr/bin",
        isWsl: true,
      }),
    ).toBeUndefined();
  });

  test("skips the GPU probe for CPU-only work", () => {
    let probes = 0;
    expect(
      probeGpuVisibility(
        {
          requested: false,
          executableFound: false,
          path: undefined,
          isWsl: false,
        },
        () => {
          probes += 1;
          return { kind: "visible" };
        },
      ),
    ).toBeUndefined();
    expect(probes).toBe(0);
  });

  test("retries with bounded backoff until the GPU appears", () => {
    let probes = 0;
    const delays: number[] = [];
    const result = probeGpuVisibility(
      {
        requested: true,
        executableFound: true,
        path: "/usr/bin",
        isWsl: false,
      },
      (): GpuProbeResult => {
        probes += 1;
        return probes < 3
          ? { kind: "absent", exitCode: 1 }
          : { kind: "visible" };
      },
      (milliseconds) => {
        delays.push(milliseconds);
      },
    );
    expect(result).toBeUndefined();
    expect(probes).toBe(3);
    expect(delays).toEqual([100, 250]);
  });

  test("distinguishes a probe timeout from a GPU absence", () => {
    const input = {
      requested: true,
      executableFound: true,
      path: "/usr/bin",
      isWsl: false,
    };
    expect(
      probeGpuVisibility(
        input,
        () => ({ kind: "timeout" }),
        () => {},
      ),
    ).toContain("timed out after 3 attempts");
    expect(
      probeGpuVisibility(
        input,
        () => ({ kind: "absent", exitCode: 1 }),
        () => {},
      ),
    ).toContain("reported no visible GPU");
  });
});
